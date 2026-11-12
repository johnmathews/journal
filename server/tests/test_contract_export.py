"""Drift test for the committed API contract (``contract/api.schema.json``).

The response ``TypedDict`` shapes in ``journal.api.contract.schemas`` are the
source of truth. The committed JSON Schema at the repo root is generated from
them by ``uv run journal contract export``. If someone edits a ``TypedDict``
without re-exporting, ``test_committed_schema_matches_fresh_export`` fails.
"""

from __future__ import annotations

import json
import sys
from typing import TYPE_CHECKING, Literal, NotRequired, TypedDict

import pytest
from pydantic import ValidationError, with_config

from journal.api.contract import CONTRACT_CONFIG, RESPONSE_SCHEMAS, get_adapter
from journal.api.contract.export import (
    build_schema_document,
    default_schema_path,
    render_schema_document,
    write_schema,
)
from journal.cli import main

if TYPE_CHECKING:
    from pathlib import Path

REEXPORT_HINT = (
    "contract/api.schema.json is stale. Run `uv run journal contract export` "
    "from server/ and commit the result."
)


def test_committed_schema_matches_fresh_export() -> None:
    committed = default_schema_path().read_bytes()
    fresh = render_schema_document().encode("utf-8")
    # Compare as text first so pytest prints a readable diff, then bytes.
    assert committed.decode("utf-8") == fresh.decode("utf-8"), REEXPORT_HINT
    assert committed == fresh, REEXPORT_HINT


def test_default_schema_path_is_repo_root_contract_dir() -> None:
    path = default_schema_path()
    assert path.name == "api.schema.json"
    assert path.parent.name == "contract"
    # The repo root holds both parts.
    assert (path.parent.parent / "server" / "pyproject.toml").is_file()


def test_schema_contains_api_health() -> None:
    doc = build_schema_document()
    assert "api_health" in doc["properties"]
    ref = doc["properties"]["api_health"]["$ref"]
    assert ref.startswith("#/$defs/")
    assert ref.removeprefix("#/$defs/") in doc["$defs"]
    assert "api_health" in doc["required"]


def test_root_lists_every_registered_route_and_nothing_else() -> None:
    doc = build_schema_document()
    assert sorted(doc["properties"]) == sorted(RESPONSE_SCHEMAS)
    assert doc["required"] == sorted(RESPONSE_SCHEMAS)
    assert doc["additionalProperties"] is False


def test_shared_shapes_are_defined_and_listed_but_not_routes() -> None:
    """The error body is no route's 2xx body, so the root doesn't reach it.
    `x-shared-definitions` names it so the webapp generator emits it."""
    doc = build_schema_document()
    assert doc["x-shared-definitions"] == ["ErrorResponse"]
    assert doc["$defs"]["ErrorResponse"]["required"] == ["error"]
    assert set(doc["$defs"]["ErrorResponse"]["properties"]) == {"error", "message"}
    assert "ErrorResponse" not in {
        ref["$ref"].removeprefix("#/$defs/") for ref in doc["properties"].values()
    }


def test_every_definition_is_titled_by_its_key() -> None:
    """The title names the generated TypeScript type."""
    doc = build_schema_document()
    assert doc["title"] == "JournalApi"
    for name, schema in doc["$defs"].items():
        assert schema["title"] == name


def test_every_object_definition_forbids_extra_keys() -> None:
    """Every registered shape (and every nested shape) must use the
    contract config, or unknown keys would slip past the runtime check."""
    doc = build_schema_document()
    for name, schema in doc["$defs"].items():
        if "properties" in schema:
            assert schema.get("additionalProperties") is False, name


def test_rendering_is_deterministic_and_newline_terminated() -> None:
    first = render_schema_document()
    assert first == render_schema_document()
    assert first.endswith("}\n")
    assert not first.endswith("\n\n")
    # Valid JSON with sorted keys at every level.
    assert json.dumps(json.loads(first), indent=2, sort_keys=True) + "\n" == first


# --- title stripping -------------------------------------------------------


@with_config(CONTRACT_CONFIG)
class _Inner(TypedDict):
    title: str
    count: int


@with_config(CONTRACT_CONFIG)
class _Outer(TypedDict):
    title: str | None
    items: list[_Inner]
    by_key: dict[str, _Inner]
    kind: Literal["a", "b"]
    note: NotRequired[str]


def test_property_titles_are_stripped_but_definition_titles_kept() -> None:
    doc = build_schema_document({"probe_route": _Outer})
    defs = doc["$defs"]
    assert defs["_Outer"]["title"] == "_Outer"
    assert defs["_Inner"]["title"] == "_Inner"
    dumped = json.dumps(doc)
    # Only the root title and one title per definition survive.
    assert dumped.count('"title": "') == 1 + len(defs)
    # A *field* named "title" is a property name, not a keyword: it stays.
    assert "title" in defs["_Outer"]["properties"]
    assert "title" in defs["_Inner"]["properties"]
    assert defs["_Outer"]["required"] == ["title", "items", "by_key", "kind"]


# --- runtime validation helper (consumed by the W11 test middleware) ------


def _health_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "status": "degraded",
        "checks": [
            {"name": "sqlite", "status": "ok", "detail": "SELECT 1 succeeded", "error": None},
            {
                "name": "chromadb",
                "status": "error",
                "detail": "collection.count() failed",
                "error": "boom",
            },
            {
                "name": "openai",
                "status": "degraded",
                "detail": "openai API key is not configured",
                "error": None,
            },
        ],
    }
    body.update(overrides)
    return body


def test_get_adapter_is_cached() -> None:
    assert get_adapter("api_health") is get_adapter("api_health")


def test_get_adapter_unknown_route_raises_key_error() -> None:
    with pytest.raises(KeyError):
        get_adapter("no_such_route")


def test_health_body_validates_strictly() -> None:
    get_adapter("api_health").validate_python(_health_body(), strict=True)


def test_health_body_with_extra_key_is_rejected() -> None:
    with pytest.raises(ValidationError, match="extra_forbidden"):
        get_adapter("api_health").validate_python(_health_body(ingestion={}), strict=True)


def test_health_check_with_extra_key_is_rejected() -> None:
    body = _health_body()
    checks = body["checks"]
    assert isinstance(checks, list)
    checks[0]["surprise"] = 1
    with pytest.raises(ValidationError, match="extra_forbidden"):
        get_adapter("api_health").validate_python(body, strict=True)


def test_health_body_with_unknown_status_is_rejected() -> None:
    with pytest.raises(ValidationError, match="literal_error"):
        get_adapter("api_health").validate_python(_health_body(status="fine"), strict=True)


def test_health_body_missing_field_is_rejected() -> None:
    body = _health_body()
    del body["checks"]
    with pytest.raises(ValidationError, match="missing"):
        get_adapter("api_health").validate_python(body, strict=True)


# --- export command --------------------------------------------------------


def test_write_schema_writes_rendered_document(tmp_path: Path) -> None:
    out = tmp_path / "nested" / "api.schema.json"
    assert write_schema(out) == out
    assert out.read_text(encoding="utf-8") == render_schema_document()


def test_cli_contract_export_writes_to_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    out = tmp_path / "api.schema.json"
    monkeypatch.setattr(sys, "argv", ["journal", "contract", "export", "--output", str(out)])
    main()
    assert out.read_text(encoding="utf-8") == render_schema_document()
    assert str(out) in capsys.readouterr().out


def test_cli_contract_requires_subcommand(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "argv", ["journal", "contract"])
    with pytest.raises(SystemExit) as exc_info:
        main()
    assert exc_info.value.code != 0


# --- a real /health body passes strict validation ---------------------------


class _BrokenVectorStore:
    def count(self) -> int:
        raise RuntimeError("chroma unreachable")


@pytest.mark.parametrize(
    ("vector_store_factory", "with_config_obj", "expected_status"),
    [
        pytest.param(lambda: None, True, "degraded", id="ok-and-degraded-checks"),
        pytest.param(_BrokenVectorStore, False, "error", id="error-check-without-config"),
    ],
)
def test_real_health_response_validates_strictly(
    vector_store_factory: object, with_config_obj: bool, expected_status: str
) -> None:
    import sqlite3
    from types import SimpleNamespace

    from mcp.server.fastmcp import FastMCP

    from journal.api import register_api_routes
    from journal.config import Config
    from journal.vectorstore.store import InMemoryVectorStore
    from tests.contract_check import ContractTestClient

    assert callable(vector_store_factory)
    vector_store = vector_store_factory() or InMemoryVectorStore()
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    services: dict[str, object] = {
        "query": SimpleNamespace(connection=conn, vector_store=vector_store),
    }
    if with_config_obj:
        services["config"] = Config(anthropic_api_key="a" * 40, openai_api_key="")
    test_mcp = FastMCP("test-contract")
    register_api_routes(test_mcp, lambda: services)  # type: ignore[arg-type, return-value]
    try:
        with ContractTestClient(test_mcp.streamable_http_app()) as client:
            response = client.get("/health")
    finally:
        conn.close()
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == expected_status
    get_adapter("api_health").validate_python(body, strict=True)
