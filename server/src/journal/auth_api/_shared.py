"""Helpers shared across the auth_api cluster modules.

Three helpers, each used by ≥2 cluster modules:

- ``_services_or_503`` — service-availability guard called at the top of
  every route in the package.
- ``_user_to_dict`` — JSON-safe serialiser for a stored ``User``. Used by
  core, account, profile, and admin clusters. (Not for the session's
  ``AuthenticatedUser``, which has no timestamps: ``GET /api/auth/me`` loads
  the ``User`` row first.)
- ``_api_key_info_to_dict`` — JSON-safe serialiser for ``ApiKeyInfo``.
  Used only by api_keys, but lives here for symmetry and so the package
  facade can re-export both serialisers from a single source.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from starlette.responses import JSONResponse

if TYPE_CHECKING:
    from collections.abc import Callable

    from journal.api.contract import schemas as contract
    from journal.models import ApiKeyInfo, User


def _user_to_dict(user: User) -> contract.AuthUser:
    """Serialize a stored ``User`` to its JSON body."""
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
        "email_verified": user.email_verified,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


def _api_key_info_to_dict(info: ApiKeyInfo) -> contract.ApiKey:
    """Serialize an ApiKeyInfo to a JSON-safe dict."""
    return {
        "id": info.id,
        "user_id": info.user_id,
        "key_prefix": info.key_prefix,
        "name": info.name,
        "created_at": info.created_at,
        "expires_at": info.expires_at,
        "last_used_at": info.last_used_at,
        "revoked_at": info.revoked_at,
    }


def _services_or_503(
    services_getter: Callable[[], dict | None],
) -> dict | JSONResponse:
    """Return the services dict or a 503 JSONResponse if not yet initialized."""
    services = services_getter()
    if services is None:
        return JSONResponse(
            {"error": "server_not_ready", "message": "Server not initialized"},
            status_code=503,
        )
    return services
