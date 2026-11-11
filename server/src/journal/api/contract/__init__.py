"""API response contract: one source of truth for the server's JSON bodies.

Each REST route's 2xx response body is described once, as a strict
``TypedDict`` in ``schemas.py``, and registered in ``RESPONSE_SCHEMAS``
under the route's ``name=`` from ``@mcp.custom_route``. From that registry:

- ``journal contract export`` writes the committed JSON Schema at
  ``contract/api.schema.json`` (repo root);
- the webapp generates its TypeScript types from that file;
- server API tests validate real response bodies with ``get_adapter``.

To change a response:

1. Edit (or add) the ``TypedDict`` in ``schemas.py`` and register the route.
2. From ``server/``, run ``uv run journal contract export``.
3. Commit the ``TypedDict`` change and ``contract/api.schema.json`` together.

``tests/test_contract_export.py`` fails if step 2 was skipped. Docstrings on
the ``TypedDict`` classes are exported too (as ``description``, which becomes
the TypeScript doc comment), so editing one also needs a re-export.
"""

from __future__ import annotations

from functools import cache
from typing import Any

from pydantic import TypeAdapter

from journal.api.contract.schemas import CONTRACT_CONFIG, RESPONSE_SCHEMAS

__all__ = ["CONTRACT_CONFIG", "RESPONSE_SCHEMAS", "get_adapter"]


@cache
def get_adapter(route_name: str) -> TypeAdapter[Any]:
    """Return the cached ``TypeAdapter`` for a registered route.

    Validate a body with ``get_adapter(name).validate_python(body, strict=True)``.
    Raises ``KeyError`` if ``route_name`` is not registered.
    """
    return TypeAdapter(RESPONSE_SCHEMAS[route_name])
