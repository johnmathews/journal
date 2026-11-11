"""Consistency checks on the response shapes in ``journal.api.contract.schemas``."""

from __future__ import annotations

import inspect
from typing import is_typeddict

import pytest

from journal.api.contract import schemas
from journal.api.contract.export import build_schema_document

TYPED_DICTS = sorted(
    (obj for _, obj in inspect.getmembers(schemas) if is_typeddict(obj)),
    key=lambda cls: cls.__name__,
)


@pytest.mark.parametrize("cls", TYPED_DICTS, ids=lambda cls: cls.__name__)
def test_exported_required_keys_match_the_typeddict(cls: type) -> None:
    """``NotRequired`` keys must export as optional (``?`` in TypeScript).

    Under ``from __future__ import annotations`` the ``typing`` module cannot
    see ``NotRequired`` inside string annotations, and a nested shape then
    exported every key as required. ``schemas.py`` must not use that import.
    """
    definition = build_schema_document()["$defs"][cls.__name__]
    assert set(definition.get("required", [])) == set(cls.__required_keys__)
    assert set(definition["properties"]) == (
        set(cls.__required_keys__) | set(cls.__optional_keys__)
    )


def test_some_shapes_have_optional_keys() -> None:
    """Guard the test above: it is vacuous if no shape has an optional key."""
    assert schemas.EntitySummary.__optional_keys__ == frozenset({"quotes"})
