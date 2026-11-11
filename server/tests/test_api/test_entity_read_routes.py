"""API tests for the entity read routes: detail, mentions and relationships.

Each request here also runs the runtime contract check (``ContractTestClient``),
so the bodies are validated against ``journal.api.contract.schemas``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pytest
    from starlette.testclient import TestClient

    from journal.db.repository import SQLiteEntryRepository
    from journal.entitystore.store import SQLiteEntityStore


def _seed_relationship(
    repo: SQLiteEntryRepository, entity_store: SQLiteEntityStore
) -> tuple[int, int, int]:
    """Alice (person) visited Blue Bottle (place) in one entry.

    Returns ``(alice_id, cafe_id, entry_id)``.
    """
    entry = repo.create_entry("2026-03-22", "photo", "Alice visited Blue Bottle.", 4)
    alice = entity_store.create_entity("person", "Alice", "", "2026-03-22")
    cafe = entity_store.create_entity("place", "Blue Bottle", "", "2026-03-22")
    entity_store.create_relationship(
        alice.id, "visited", cafe.id, "Alice visited Blue Bottle", entry.id, 0.88, "run-1",
    )
    return alice.id, cafe.id, entry.id


class TestEntityRelationships:
    """F7: the entity page renders related-entity names and types from this body."""

    def test_outgoing_relationship_carries_names_types_and_entry_date(
        self,
        client: TestClient,
        repo: SQLiteEntryRepository,
        services: dict,
    ) -> None:
        alice_id, cafe_id, entry_id = _seed_relationship(repo, services["entity_store"])

        resp = client.get(f"/api/entities/{alice_id}/relationships")

        assert resp.status_code == 200
        body = resp.json()
        assert body["entity_id"] == alice_id
        assert body["incoming"] == []
        [rel] = body["outgoing"]
        assert rel["subject_entity_id"] == alice_id
        assert rel["subject_name"] == "Alice"
        assert rel["subject_type"] == "person"
        assert rel["predicate"] == "visited"
        assert rel["object_entity_id"] == cafe_id
        assert rel["object_name"] == "Blue Bottle"
        assert rel["object_type"] == "place"
        assert rel["entry_id"] == entry_id
        assert rel["entry_date"] == "2026-03-22"
        # Kept from the original body.
        assert rel["quote"] == "Alice visited Blue Bottle"
        assert rel["confidence"] == 0.88
        assert rel["extraction_run_id"] == "run-1"
        assert rel["created_at"]

    def test_incoming_relationship_carries_names_types_and_entry_date(
        self,
        client: TestClient,
        repo: SQLiteEntryRepository,
        services: dict,
    ) -> None:
        alice_id, cafe_id, _ = _seed_relationship(repo, services["entity_store"])

        resp = client.get(f"/api/entities/{cafe_id}/relationships")

        assert resp.status_code == 200
        body = resp.json()
        assert body["outgoing"] == []
        [rel] = body["incoming"]
        assert rel["subject_entity_id"] == alice_id
        assert rel["subject_name"] == "Alice"
        assert rel["subject_type"] == "person"
        assert rel["object_name"] == "Blue Bottle"
        assert rel["object_type"] == "place"
        assert rel["entry_date"] == "2026-03-22"

    def test_relationships_are_scoped_to_the_users_entries(
        self,
        client: TestClient,
        repo: SQLiteEntryRepository,
        services: dict,
    ) -> None:
        """An edge extracted from another user's entry is not returned."""
        entity_store: SQLiteEntityStore = services["entity_store"]
        alice_id, cafe_id, _ = _seed_relationship(repo, entity_store)
        other = services["user_repo"].create_user("other@example.com", "Other")
        theirs = repo.create_entry(
            "2026-03-23", "photo", "Alice again.", 2, user_id=other.id,
        )
        entity_store.create_relationship(
            alice_id, "liked", cafe_id, "Alice again", theirs.id, 0.5, "run-2",
        )

        body = client.get(f"/api/entities/{alice_id}/relationships").json()

        assert [r["predicate"] for r in body["outgoing"]] == ["visited"]

    def test_unknown_entity_is_404(self, client: TestClient) -> None:
        assert client.get("/api/entities/9999/relationships").status_code == 404


class TestEntityDetail:
    def test_detail_returns_the_full_entity(
        self,
        client: TestClient,
        repo: SQLiteEntryRepository,
        services: dict,
    ) -> None:
        alice_id, _, _ = _seed_relationship(repo, services["entity_store"])

        resp = client.get(f"/api/entities/{alice_id}")

        assert resp.status_code == 200
        body = resp.json()
        assert body["canonical_name"] == "Alice"
        assert body["entity_type"] == "person"
        assert body["is_quarantined"] is False
        assert client.contract_check.checked[-1] == "api_entity_detail"

    def test_unknown_entity_is_404(self, client: TestClient) -> None:
        assert client.get("/api/entities/9999").status_code == 404


class TestEntityMentions:
    def _seed_mention(
        self, repo: SQLiteEntryRepository, entity_store: SQLiteEntityStore
    ) -> tuple[int, int]:
        entry = repo.create_entry("2026-03-22", "photo", "Walked with Alice.", 3)
        alice = entity_store.create_entity("person", "Alice", "", "2026-03-22")
        entity_store.create_mention(
            entity_id=alice.id,
            entry_id=entry.id,
            quote="Walked with Alice",
            confidence=0.92,
            extraction_run_id="run-1",
        )
        return alice.id, entry.id

    def test_mention_carries_its_entry_date(
        self,
        client: TestClient,
        repo: SQLiteEntryRepository,
        services: dict,
    ) -> None:
        alice_id, entry_id = self._seed_mention(repo, services["entity_store"])

        resp = client.get(f"/api/entities/{alice_id}/mentions")

        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        [mention] = body["mentions"]
        assert mention["entry_id"] == entry_id
        assert mention["entry_date"] == "2026-03-22"
        assert client.contract_check.checked[-1] == "api_entity_mentions"

    def test_mention_whose_entry_is_gone_has_a_null_entry_date(
        self,
        client: TestClient,
        repo: SQLiteEntryRepository,
        services: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """F19: the route looks each mention's entry up separately, so an
        entry deleted between the two reads yields ``entry_date: null``.
        The contract declares it nullable; the runtime check validates it."""
        alice_id, _ = self._seed_mention(repo, services["entity_store"])
        monkeypatch.setattr(services["query"], "get_entry", lambda *a, **kw: None)

        resp = client.get(f"/api/entities/{alice_id}/mentions")

        assert resp.status_code == 200
        [mention] = resp.json()["mentions"]
        assert mention["entry_date"] is None
        assert client.contract_check.checked[-1] == "api_entity_mentions"
