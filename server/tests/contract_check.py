"""Runtime API contract check for server tests.

Every test client in the suite is a :class:`ContractTestClient`. It wraps the
app under test in :class:`ContractCheckMiddleware`, which watches each HTTP
response. When a response is a 2xx, non-streaming ``application/json`` body
and the route that served it is registered in
``journal.api.contract.RESPONSE_SCHEMAS``, the body is validated with
``get_adapter(route_name).validate_python(body, strict=True)``.

A mismatch is recorded, not raised inside the app: an exception raised there
would be swallowed by ``TestClient(raise_server_exceptions=False)`` after the
200 had already been sent. Instead :meth:`ContractTestClient.send` raises
:class:`ContractViolationError` (an ``AssertionError``) at the request call site in
the test, naming the route and quoting the Pydantic error.

Responses that are skipped: non-2xx, non-JSON, streamed (more than one body
message), empty bodies (e.g. ``HEAD``), and routes not in the registry.
``tests/test_contract_coverage.py`` makes sure every route is either
registered or on the shrinking allowlist.

Usage in a fixture::

    from tests.contract_check import ContractTestClient

    with ContractTestClient(app, raise_server_exceptions=False) as tc:
        yield tc
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from pydantic import ValidationError
from starlette.routing import Match, Router
from starlette.testclient import TestClient

from journal.api.contract import RESPONSE_SCHEMAS, get_adapter

if TYPE_CHECKING:
    import httpx
    from starlette.types import ASGIApp, Message, Receive, Scope, Send

__all__ = [
    "ContractCheckMiddleware",
    "ContractTestClient",
    "ContractViolationError",
    "find_router",
    "route_name_for_scope",
]


class ContractViolationError(AssertionError):
    """A registered route returned a 2xx JSON body that breaks its contract."""


def _is_json_media_type(content_type: str) -> bool:
    media_type = content_type.split(";", 1)[0].strip().lower()
    return media_type == "application/json" or media_type.endswith("+json")


def find_router(app: object) -> Router | None:
    """Follow ``.app`` down a middleware chain to the first Starlette router.

    Returns ``None`` for a bare ASGI app with no router (nothing it serves can
    be a registered route).
    """
    node: object | None = app
    for _ in range(64):  # middleware chains are short; guard against cycles
        if node is None:
            return None
        if isinstance(node, Router):
            return node
        router = getattr(node, "router", None)
        if isinstance(router, Router):
            return router
        node = getattr(node, "app", None)
    return None


def route_name_for_scope(router: Router, scope: Scope) -> str | None:
    """Return the ``name`` of the route in ``router`` that fully matches ``scope``."""
    for route in router.routes:
        match, _ = route.matches(scope)
        if match is Match.FULL:
            return getattr(route, "name", None)
    return None


class _ResponseCapture:
    """Collects one HTTP response's status, media type and body bytes."""

    __slots__ = ("body", "body_messages", "eligible", "status")

    def __init__(self) -> None:
        self.status = 0
        self.eligible = False
        self.body = bytearray()
        self.body_messages = 0

    def observe(self, message: Message) -> None:
        kind = message["type"]
        if kind == "http.response.start":
            self.status = message["status"]
            content_type = ""
            for key, value in message.get("headers", ()):
                if key.lower() == b"content-type":
                    content_type = value.decode("latin-1")
                    break
            self.eligible = 200 <= self.status < 300 and _is_json_media_type(content_type)
        elif kind == "http.response.body":
            if not self.eligible:
                return
            self.body_messages += 1
            if message.get("more_body", False) or self.body_messages > 1:
                # Streamed body: not a single JSONResponse, skip it.
                self.eligible = False
                self.body.clear()
                return
            self.body.extend(message.get("body", b""))
        else:
            # http.response.pathsend / zerocopysend etc.: not a JSON body.
            self.eligible = False


class ContractCheckMiddleware:
    """ASGI middleware that validates 2xx JSON bodies of registered routes.

    Violations are appended to :attr:`violations` (one message per bad
    response). :class:`ContractTestClient` raises them after each request.
    :attr:`checked` lists the route names whose bodies were validated, in
    order, which lets tests assert the check actually ran.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._router = find_router(app)
        self.violations: list[str] = []
        self.checked: list[str] = []

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        capture = _ResponseCapture()

        async def send_and_capture(message: Message) -> None:
            capture.observe(message)
            await send(message)

        await self.app(scope, receive, send_and_capture)

        if capture.eligible and capture.body:
            self._check(scope, capture)

    def _check(self, scope: Scope, capture: _ResponseCapture) -> None:
        request_line = f"{scope['method']} {scope['path']} -> {capture.status}"
        # Starlette's Router stores itself in the (shared, mutable) scope; fall
        # back to the router found by walking the app's middleware chain.
        router = scope.get("router", self._router)
        if router is None:
            return  # bare ASGI test app: it has no named routes
        name = route_name_for_scope(router, scope)
        if name is None:
            self.violations.append(
                f"Contract check could not identify the route for {request_line}: "
                "no route in the app's router fully matches the request."
            )
            return
        if name not in RESPONSE_SCHEMAS:
            return
        schema_name = RESPONSE_SCHEMAS[name].__name__
        try:
            body: Any = json.loads(capture.body)
        except ValueError as exc:
            self.violations.append(
                f"Route {name!r} ({request_line}) returned a 2xx application/json "
                f"body that is not valid JSON: {exc}"
            )
            return
        try:
            get_adapter(name).validate_python(body, strict=True)
        except ValidationError as exc:
            self.violations.append(
                f"Route {name!r} ({request_line}) response does not match its contract "
                f"{schema_name} (journal.api.contract.schemas):\n{exc}"
            )
            return
        self.checked.append(name)

    def raise_violations(self) -> None:
        """Raise :class:`ContractViolationError` for any recorded mismatch, then reset."""
        if not self.violations:
            return
        messages, self.violations = self.violations, []
        raise ContractViolationError("\n\n".join(messages))


class ContractTestClient(TestClient):
    """``TestClient`` that checks every response against the API contract.

    Accepts exactly the same arguments as ``starlette.testclient.TestClient``.
    The wrapped app's check is available as :attr:`contract_check`.
    """

    __test__ = False

    def __init__(self, app: ASGIApp, *args: Any, **kwargs: Any) -> None:
        self.contract_check = ContractCheckMiddleware(app)
        super().__init__(self.contract_check, *args, **kwargs)

    def send(self, request: httpx.Request, **kwargs: Any) -> httpx.Response:  # type: ignore[override]
        # Drop anything left over from a request that raised mid-flight.
        self.contract_check.violations.clear()
        response = super().send(request, **kwargs)
        self.contract_check.raise_violations()
        return response
