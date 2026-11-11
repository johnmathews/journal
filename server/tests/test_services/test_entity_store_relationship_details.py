"""Tests for ``SQLiteEntityStore.get_relationship_details_for_entity`` (F7).

The API's relationships route reads names, types and entry dates from this
one joined query per direction instead of looking each edge up.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from journal.db.repository import SQLiteEntryRepository
from journal.entitystore.store import SQLiteEntityStore
from journal.models import EntityRelationshipDetail

if TYPE_CHECKING:
    from journal.db.factory import ConnectionFactory


def test_details_join_names_types_and_entry_date(factory: ConnectionFactory) -> None:
    repo = SQLiteEntryRepository(factory)
    store = SQLiteEntityStore(factory)
    entry = repo.create_entry("2026-03-22", "photo", "Atlas visited Vienna.", 3)
    atlas = store.create_entity("person", "Atlas", "", "2026-03-22")
    vienna = store.create_entity("place", "Vienna", "", "2026-03-22")
    rel = store.create_relationship(
        atlas.id, "visited", vienna.id, "Atlas visited Vienna", entry.id, 0.9, "run-1",
    )

    outgoing, incoming = store.get_relationship_details_for_entity(atlas.id)

    assert incoming == []
    assert outgoing == [
        EntityRelationshipDetail(
            id=rel.id,
            subject_entity_id=atlas.id,
            predicate="visited",
            object_entity_id=vienna.id,
            quote="Atlas visited Vienna",
            entry_id=entry.id,
            confidence=0.9,
            extraction_run_id="run-1",
            created_at=rel.created_at,
            subject_name="Atlas",
            subject_type="person",
            object_name="Vienna",
            object_type="place",
            entry_date="2026-03-22",
        )
    ]
    # Same edges as the plain query, in the same order.
    plain_out, plain_in = store.get_relationships_for_entity(vienna.id)
    detail_out, detail_in = store.get_relationship_details_for_entity(vienna.id)
    assert [r.id for r in detail_out] == [r.id for r in plain_out] == []
    assert [r.id for r in detail_in] == [r.id for r in plain_in] == [rel.id]


def test_a_self_relationship_is_both_outgoing_and_incoming(
    factory: ConnectionFactory,
) -> None:
    repo = SQLiteEntryRepository(factory)
    store = SQLiteEntityStore(factory)
    entry = repo.create_entry("2026-03-22", "photo", "Atlas met Atlas.", 3)
    atlas = store.create_entity("person", "Atlas", "", "2026-03-22")
    store.create_relationship(atlas.id, "met", atlas.id, "q", entry.id, 0.5, "run-1")

    outgoing, incoming = store.get_relationship_details_for_entity(atlas.id, user_id=1)

    assert [r.object_name for r in outgoing] == ["Atlas"]
    assert [r.subject_name for r in incoming] == ["Atlas"]
