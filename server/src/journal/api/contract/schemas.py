"""Response shapes for the REST API, one ``TypedDict`` per 2xx body.

Every shape (including nested ones) is decorated with
``@with_config(CONTRACT_CONFIG)`` so unknown keys are rejected
(``additionalProperties: false`` in the exported schema). The class name
becomes the definition name in ``contract/api.schema.json`` and the
exported TypeScript type name in the webapp, so pick names that read well
there.

``RESPONSE_SCHEMAS`` maps a route's ``name=`` (from
``@mcp.custom_route(..., name=...)``) to the ``TypedDict`` its 2xx JSON
body must match. See ``journal.api.contract`` for the workflow.
"""

from __future__ import annotations

from typing import Final, Literal, TypedDict

from pydantic import ConfigDict, with_config

CONTRACT_CONFIG: Final = ConfigDict(
    extra="forbid",
    json_schema_serialization_defaults_required=True,
)
"""Config every contract ``TypedDict`` must carry (via ``with_config``)."""


# --- /health (route name ``api_health``) ----------------------------------

type HealthStatus = Literal["ok", "degraded", "error"]
"""Per-component and overall status (`journal.services.liveness`)."""


@with_config(CONTRACT_CONFIG)
class ComponentCheck(TypedDict):
    """One liveness check: `asdict(journal.services.liveness.ComponentCheck)`."""

    name: str
    status: HealthStatus
    detail: str
    error: str | None


@with_config(CONTRACT_CONFIG)
class PublicHealthResponse(TypedDict):
    """Body of the unauthenticated `GET /health`: liveness only.

    The authenticated `GET /api/health` (`api_health_authed`) carries
    more blocks and gets its own shape.
    """

    status: HealthStatus
    checks: list[ComponentCheck]


# --- registry ---------------------------------------------------------------

RESPONSE_SCHEMAS: Final[dict[str, type]] = {
    "api_health": PublicHealthResponse,
}
