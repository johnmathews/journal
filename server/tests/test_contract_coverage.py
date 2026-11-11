"""Every REST route is covered by the API contract, or knowingly allowlisted.

Route names come from the real FastMCP app the server builds
(``journal.mcp_server.app.mcp``, which registers the api, auth and admin route
groups), not from grepping source.

``tests/contract_allowlist.txt`` lists the routes that have no response
schema yet. It may only shrink: its ``ceiling:`` line must equal the number of
entries, so removing an entry means lowering the ceiling, and adding one means
raising it in a reviewed diff. Contract batches W13 to W17 empty it.

The second half of this module tests the runtime check itself
(``tests/contract_check.py``), which validates 2xx JSON bodies of registered
routes in every API test.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from starlette.applications import Starlette
from starlette.responses import JSONResponse, PlainTextResponse, Response, StreamingResponse
from starlette.routing import Route

from journal.api.contract import RESPONSE_SCHEMAS
from tests.contract_check import ContractTestClient, ContractViolationError

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from starlette.requests import Request
    from starlette.types import ASGIApp, Receive, Scope, Send

TESTS_DIR = Path(__file__).parent
ALLOWLIST_PATH = TESTS_DIR / "contract_allowlist.txt"
_CEILING_RE = re.compile(r"^ceiling:\s*(\d+)$")


@dataclass(frozen=True)
class Allowlist:
    ceiling: int
    entries: list[str]


def load_allowlist(path: Path = ALLOWLIST_PATH) -> Allowlist:
    """Parse the allowlist: ``#`` comments, one ``ceiling: N`` line, route names."""
    ceiling: int | None = None
    entries: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = _CEILING_RE.match(line)
        if match:
            assert ceiling is None, f"{path.name}: more than one `ceiling:` line"
            ceiling = int(match.group(1))
            continue
        entries.append(line)
    assert ceiling is not None, f"{path.name}: missing the `ceiling: N` line"
    return Allowlist(ceiling=ceiling, entries=entries)


def real_route_names() -> list[str]:
    """Names of every ``@mcp.custom_route`` on the server's FastMCP app."""
    from journal.mcp_server.app import mcp

    # FastMCP keeps custom routes here and appends them to the Starlette app
    # it builds. Reading the list avoids building (and mutating) that app.
    names = [route.name for route in mcp._custom_starlette_routes]
    assert names, "no custom routes found on journal.mcp_server.app.mcp"
    return names


@pytest.fixture(scope="module")
def route_names() -> set[str]:
    return set(real_route_names())


@pytest.fixture(scope="module")
def allowlist() -> Allowlist:
    return load_allowlist()


# --- coverage --------------------------------------------------------------


def test_route_names_are_unique() -> None:
    names = real_route_names()
    duplicates = sorted({n for n in names if names.count(n) > 1})
    assert not duplicates, f"custom_route names must be unique (contract keys): {duplicates}"


def test_every_route_is_registered_or_allowlisted(
    route_names: set[str], allowlist: Allowlist
) -> None:
    uncovered = sorted(route_names - set(RESPONSE_SCHEMAS) - set(allowlist.entries))
    assert not uncovered, (
        f"Routes with no response contract: {uncovered}. Add a TypedDict for each to "
        "journal/api/contract/schemas.py, register it in RESPONSE_SCHEMAS and run "
        "`uv run journal contract export`. (tests/contract_allowlist.txt may only shrink.)"
    )


def test_every_registered_name_is_a_real_route(route_names: set[str]) -> None:
    unknown = sorted(set(RESPONSE_SCHEMAS) - route_names)
    assert not unknown, (
        f"RESPONSE_SCHEMAS keys that are not custom_route names: {unknown}. "
        "A misspelt key is never checked at runtime."
    )


def test_allowlist_has_no_registered_routes(allowlist: Allowlist) -> None:
    stale = sorted(set(allowlist.entries) & set(RESPONSE_SCHEMAS))
    assert not stale, (
        f"Now registered, so delete from tests/contract_allowlist.txt: {stale}. "
        f"Then set `ceiling: {len(allowlist.entries) - len(stale)}`."
    )


def test_allowlist_has_no_unknown_routes(route_names: set[str], allowlist: Allowlist) -> None:
    stale = sorted(set(allowlist.entries) - route_names)
    assert not stale, (
        f"Not a custom_route name (removed or renamed?), so delete from "
        f"tests/contract_allowlist.txt: {stale}"
    )


def test_allowlist_is_sorted_without_duplicates(allowlist: Allowlist) -> None:
    assert allowlist.entries == sorted(set(allowlist.entries)), (
        "tests/contract_allowlist.txt entries must be sorted and unique"
    )


def test_allowlist_never_exceeds_its_ceiling(allowlist: Allowlist) -> None:
    assert len(allowlist.entries) <= allowlist.ceiling, (
        f"tests/contract_allowlist.txt has {len(allowlist.entries)} entries but its "
        f"ceiling is {allowlist.ceiling}. The allowlist may only shrink: register the "
        "new route's response schema instead of allowlisting it."
    )


def test_allowlist_ceiling_is_tight(allowlist: Allowlist) -> None:
    """Ratchet: once an entry is removed, the ceiling must come down with it.

    (Exceeding the ceiling is ``test_allowlist_never_exceeds_its_ceiling``.)
    """
    assert allowlist.ceiling <= len(allowlist.entries), (
        f"Lower the ceiling in tests/contract_allowlist.txt to `ceiling: "
        f"{len(allowlist.entries)}` (it is {allowlist.ceiling})."
    )


def test_load_allowlist_parses_format(tmp_path: Path) -> None:
    path = tmp_path / "allow.txt"
    path.write_text("# note\n\nceiling: 2\napi_a\n  api_b  \n", encoding="utf-8")
    assert load_allowlist(path) == Allowlist(ceiling=2, entries=["api_a", "api_b"])


def test_load_allowlist_requires_a_ceiling(tmp_path: Path) -> None:
    path = tmp_path / "allow.txt"
    path.write_text("api_a\n", encoding="utf-8")
    with pytest.raises(AssertionError, match="missing the `ceiling: N` line"):
        load_allowlist(path)


def test_every_test_client_runs_the_contract_check() -> None:
    """New test modules must use ContractTestClient, not a bare TestClient."""
    bare = re.compile(r"(?<!\w)TestClient\(")
    offenders = [
        f"{path.relative_to(TESTS_DIR)}:{lineno}"
        for path in sorted(TESTS_DIR.rglob("*.py"))
        if path.name != "contract_check.py"
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
        if bare.search(line)
    ]
    assert not offenders, (
        f"Use tests.contract_check.ContractTestClient instead of TestClient: {offenders}"
    )


# --- the runtime check (tests/contract_check.py) ---------------------------

GOOD_HEALTH = {
    "status": "ok",
    "checks": [{"name": "sqlite", "status": "ok", "detail": "SELECT 1 succeeded", "error": None}],
}


def _app(response: Response, *, name: str = "api_health", status: int = 200) -> Starlette:
    """A Starlette app whose one route (named ``name``) returns ``response``."""
    response.status_code = status

    async def endpoint(request: Request) -> Response:
        return response

    return Starlette(routes=[Route("/health", endpoint, methods=["GET"], name=name)])


@pytest.mark.parametrize("raise_server_exceptions", [True, False])
def test_check_fails_the_request_naming_the_route(raise_server_exceptions: bool) -> None:
    bad = {**GOOD_HEALTH, "surprise": 1}
    client = ContractTestClient(
        _app(JSONResponse(bad)), raise_server_exceptions=raise_server_exceptions
    )
    with pytest.raises(ContractViolationError) as exc_info:
        client.get("/health")
    message = str(exc_info.value)
    assert "'api_health'" in message
    assert "GET /health -> 200" in message
    assert "PublicHealthResponse" in message
    assert "extra_forbidden" in message


def test_check_passes_and_records_a_valid_body() -> None:
    client = ContractTestClient(_app(JSONResponse(GOOD_HEALTH)))
    assert client.get("/health").json() == GOOD_HEALTH
    assert client.contract_check.checked == ["api_health"]


def test_violation_does_not_leak_into_the_next_request() -> None:
    client = ContractTestClient(_app(JSONResponse({"status": "ok"})))
    with pytest.raises(ContractViolationError):
        client.get("/health")
    assert client.contract_check.violations == []


@pytest.mark.parametrize(
    ("response", "status"),
    [
        pytest.param(JSONResponse({"wrong": True}), 503, id="non-2xx"),
        pytest.param(PlainTextResponse("not json"), 200, id="non-json"),
        pytest.param(Response(b"", media_type="application/json"), 204, id="empty-body"),
    ],
)
def test_check_skips_responses_it_does_not_cover(response: Response, status: int) -> None:
    client = ContractTestClient(_app(response, status=status))
    assert client.get("/health").status_code == status
    assert client.contract_check.checked == []


def test_check_skips_streamed_json() -> None:
    async def chunks() -> AsyncIterator[bytes]:
        yield b'{"wrong":'
        yield b" true}"

    client = ContractTestClient(
        _app(StreamingResponse(chunks(), media_type="application/json"))
    )
    assert client.get("/health").json() == {"wrong": True}
    assert client.contract_check.checked == []


def test_check_skips_unregistered_routes() -> None:
    client = ContractTestClient(_app(JSONResponse({"anything": 1}), name="not_in_contract"))
    assert client.get("/health").status_code == 200
    assert client.contract_check.checked == []


def test_check_rejects_invalid_json_from_a_registered_route() -> None:
    client = ContractTestClient(
        _app(Response(b"{not json", media_type="application/json"))
    )
    with pytest.raises(ContractViolationError, match="'api_health'.*not valid JSON"):
        client.get("/health")


def test_check_finds_the_route_behind_a_scope_copying_middleware() -> None:
    class CopyScope:
        def __init__(self, app: ASGIApp) -> None:
            self.app = app

        async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
            await self.app(dict(scope), receive, send)

    client = ContractTestClient(CopyScope(_app(JSONResponse({"status": "ok"}))))
    with pytest.raises(ContractViolationError, match="'api_health'"):
        client.get("/health")


def test_check_ignores_bare_asgi_apps_without_a_router() -> None:
    async def bare(scope: Scope, receive: Receive, send: Send) -> None:
        await JSONResponse({"ok": True})(scope, receive, send)

    client = ContractTestClient(bare)
    assert client.get("/anything").json() == {"ok": True}
    assert client.contract_check.checked == []
