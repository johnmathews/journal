"""API key CRUD routes.

Three operations on programmatic credentials owned by the current user:

- ``POST /api/auth/api-keys`` — generate a new key (returned exactly once).
  Body: ``name`` (required), and at most one of ``expires_days`` or
  ``expires_at``; unknown fields are rejected.
- ``GET  /api/auth/api-keys`` — list the user's keys (no secret material).
- ``DELETE /api/auth/api-keys/{id}`` — revoke a key.

The POST/GET pair shares a single ``@mcp.custom_route`` registration with
in-handler method dispatch; this matches the original module's shape so
existing route names (``api_auth_api_keys`` / ``api_auth_api_key_revoke``)
stay stable.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from starlette.responses import JSONResponse

from journal.auth import get_authenticated_user
from journal.auth_api._shared import _api_key_info_to_dict, _services_or_503

if TYPE_CHECKING:
    from collections.abc import Callable

    from mcp.server.fastmcp import FastMCP
    from starlette.requests import Request

    from journal.api.contract import schemas as contract
    from journal.services.auth import AuthService

log = logging.getLogger(__name__)

# Every key POST /api/auth/api-keys accepts. Anything else is a 400.
_CREATE_FIELDS = frozenset({"name", "expires_days", "expires_at"})

# 100 years. Far beyond any real use, and well inside datetime's range.
_MAX_EXPIRES_DAYS = 36_500


def _invalid_field(message: str) -> JSONResponse:
    return JSONResponse({"error": "invalid_field", "message": message}, status_code=400)


def _parse_expires_at(value: object) -> datetime | None:
    """Parse ``expires_at`` from a request body.

    Accepts an ISO 8601 date-time with a time zone (``Z`` or an offset) that
    lies in the future. Returns ``None`` for anything else, including a bare
    date or a naive date-time: without a zone the instant is ambiguous.
    """
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            return None
        parsed = parsed.astimezone(UTC)
    except (ValueError, OverflowError):
        return None
    if parsed <= datetime.now(UTC):
        return None
    return parsed


def register_api_keys_routes(
    mcp: FastMCP,
    services_getter: Callable[[], dict | None],
) -> None:
    """Register API key CRUD routes on the MCP server."""

    # ── POST /api/auth/api-keys ────────────────────────────────────────

    @mcp.custom_route(
        "/api/auth/api-keys",
        methods=["POST", "GET"],
        name="api_auth_api_keys",
    )
    async def auth_api_keys(request: Request) -> JSONResponse:
        """Create (POST) or list (GET) API keys for the authenticated user."""
        result = _services_or_503(services_getter)
        if isinstance(result, JSONResponse):
            return result
        services = result

        auth_service: AuthService = services["auth_service"]
        user = get_authenticated_user(request)

        if request.method == "POST":
            return await _create_api_key(request, auth_service, user.user_id)
        else:
            return _list_api_keys(auth_service, user.user_id)

    async def _create_api_key(
        request: Request,
        auth_service: AuthService,
        user_id: int,
    ) -> JSONResponse:
        """Handle POST /api/auth/api-keys — generate a new API key."""
        try:
            body = await request.json()
        except (json.JSONDecodeError, ValueError):
            return JSONResponse(
                {"error": "invalid_body", "message": "Invalid JSON body"},
                status_code=400,
            )
        if not isinstance(body, dict):
            return JSONResponse(
                {"error": "invalid_body", "message": "Body must be a JSON object"},
                status_code=400,
            )

        # Reject unknown keys: silently ignoring one is how a key "with an
        # expiry" ended up with none (#40).
        unknown = sorted(set(body) - _CREATE_FIELDS)
        if unknown:
            return _invalid_field(f"Unknown field(s): {', '.join(unknown)}")

        name = body.get("name", "")
        name = name.strip() if isinstance(name, str) else ""
        if not name:
            return JSONResponse(
                {"error": "missing_fields", "message": "API key name is required"},
                status_code=400,
            )

        if body.get("expires_days") is not None and body.get("expires_at") is not None:
            return _invalid_field("Send expires_days or expires_at, not both")

        expires_days: int | None = body.get("expires_days")
        if expires_days is not None:
            try:
                expires_days = int(expires_days)
                if not 1 <= expires_days <= _MAX_EXPIRES_DAYS:
                    raise ValueError("expires_days out of range")
            except (TypeError, ValueError, OverflowError):
                return _invalid_field(
                    f"expires_days must be an integer from 1 to {_MAX_EXPIRES_DAYS}"
                )

        expires_at: datetime | None = None
        if body.get("expires_at") is not None:
            expires_at = _parse_expires_at(body["expires_at"])
            if expires_at is None:
                return _invalid_field(
                    "expires_at must be a future ISO 8601 date-time with a "
                    "time zone, e.g. 2026-12-31T22:59:59Z"
                )

        full_key, key_info = auth_service.create_api_key(
            user_id, name, expires_days=expires_days, expires_at=expires_at
        )

        # The full key is shown exactly once.
        response_data: contract.ApiKeyCreatedResponse = {
            **_api_key_info_to_dict(key_info),
            "key": full_key,
        }

        log.info("Created API key '%s' for user %d", name, user_id)
        return JSONResponse(response_data, status_code=201)

    def _list_api_keys(auth_service: AuthService, user_id: int) -> JSONResponse:
        """Handle GET /api/auth/api-keys — list all API keys for the user."""
        keys = auth_service.list_api_keys(user_id)
        body: contract.ApiKeyListResponse = {
            "items": [_api_key_info_to_dict(k) for k in keys],
        }
        return JSONResponse(body)

    # ── DELETE /api/auth/api-keys/{id} ─────────────────────────────────

    @mcp.custom_route(
        "/api/auth/api-keys/{key_id:int}",
        methods=["DELETE"],
        name="api_auth_api_key_revoke",
    )
    async def auth_api_key_revoke(request: Request) -> JSONResponse:
        """Revoke an API key owned by the authenticated user."""
        result = _services_or_503(services_getter)
        if isinstance(result, JSONResponse):
            return result
        services = result

        auth_service: AuthService = services["auth_service"]
        user = get_authenticated_user(request)
        key_id = int(request.path_params["key_id"])

        revoked = auth_service.revoke_api_key(key_id, user.user_id)
        if not revoked:
            return JSONResponse(
                {"error": "not_found", "message": "API key not found or already revoked"},
                status_code=404,
            )

        log.info("Revoked API key %d for user %d", key_id, user.user_id)
        return JSONResponse({"ok": True})
