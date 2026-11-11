"""API tests for dashboard routes that had none before the contract (W14).

`calendar-heatmap`, `word-count-distribution` and `mood-entity-correlation`
had no API test, so their response contract was never exercised. Each
request here also runs the runtime contract check (``ContractTestClient``),
which validates the body against ``journal.api.contract.schemas``.

The no-range cases matter: every `from`/`to` echo is null when the caller
omits the param (F18: the webapp typed the heatmap's as `string`).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from starlette.testclient import TestClient

    from journal.db.repository import SQLiteEntryRepository
    from journal.entitystore.store import SQLiteEntityStore


class TestCalendarHeatmap:
    def test_without_a_range_echoes_null_from_and_to(
        self, client: TestClient, repo: SQLiteEntryRepository
    ) -> None:
        repo.create_entry("2026-03-02", "photo", "one two three", 3)
        repo.create_entry("2026-03-02", "photo", "four five", 2)
        repo.create_entry("2026-03-04", "photo", "six", 1)

        resp = client.get("/api/dashboard/calendar-heatmap")

        assert resp.status_code == 200
        body = resp.json()
        assert body["from"] is None
        assert body["to"] is None
        assert body["days"] == [
            {"date": "2026-03-02", "entry_count": 2, "total_words": 5},
            {"date": "2026-03-04", "entry_count": 1, "total_words": 1},
        ]
        assert client.contract_check.checked == ["api_dashboard_calendar_heatmap"]

    def test_with_a_range_echoes_it_and_filters(
        self, client: TestClient, repo: SQLiteEntryRepository
    ) -> None:
        repo.create_entry("2026-03-02", "photo", "in range", 2)
        repo.create_entry("2026-05-01", "photo", "out of range", 3)

        resp = client.get("/api/dashboard/calendar-heatmap?from=2026-03-01&to=2026-03-31")

        assert resp.status_code == 200
        body = resp.json()
        assert body["from"] == "2026-03-01"
        assert body["to"] == "2026-03-31"
        assert [d["date"] for d in body["days"]] == ["2026-03-02"]


class TestWordCountDistribution:
    def test_empty_corpus_returns_zero_stats(self, client: TestClient) -> None:
        resp = client.get("/api/dashboard/word-count-distribution")

        assert resp.status_code == 200
        body = resp.json()
        assert body["from"] is None
        assert body["to"] is None
        assert body["bucket_size"] == 100
        assert body["buckets"] == []
        assert body["stats"]["total_entries"] == 0
        assert client.contract_check.checked == ["api_dashboard_word_count_distribution"]

    def test_buckets_and_stats(
        self, client: TestClient, repo: SQLiteEntryRepository
    ) -> None:
        repo.create_entry("2026-03-02", "photo", "short", 15)
        repo.create_entry("2026-03-03", "photo", "longer", 25)

        resp = client.get("/api/dashboard/word-count-distribution?bucket_size=10")

        assert resp.status_code == 200
        body = resp.json()
        assert body["bucket_size"] == 10
        assert sum(b["count"] for b in body["buckets"]) == 2
        assert body["stats"]["min"] == 15
        assert body["stats"]["max"] == 25
        assert body["stats"]["total_entries"] == 2


class TestMoodEntityCorrelation:
    def test_returns_per_entity_average_and_nulls_for_absent_filters(
        self,
        client: TestClient,
        repo: SQLiteEntryRepository,
        services: dict,
    ) -> None:
        entity_store: SQLiteEntityStore = services["entity_store"]
        entry = repo.create_entry("2026-03-02", "photo", "Atlas again", 2)
        repo.add_mood_score(entry.id, "joy_sadness", 0.5)
        atlas = entity_store.create_entity("person", "Atlas", "", "2026-03-02")
        entity_store.create_mention(atlas.id, entry.id, "Atlas", 0.9, "run-1")

        resp = client.get("/api/dashboard/mood-entity-correlation?dimension=joy_sadness")

        assert resp.status_code == 200
        body = resp.json()
        assert body["dimension"] == "joy_sadness"
        assert body["from"] is None
        assert body["to"] is None
        assert body["entity_type"] is None
        assert body["overall_avg"] == 0.5
        assert body["items"] == [
            {"entity": "Atlas", "entity_type": "person", "avg_score": 0.5, "entry_count": 1}
        ]
        assert client.contract_check.checked == ["api_dashboard_mood_entity_correlation"]

    def test_missing_dimension_is_400(self, client: TestClient) -> None:
        resp = client.get("/api/dashboard/mood-entity-correlation")

        assert resp.status_code == 400
        assert resp.json()["error"] == "missing_dimension"


class TestEntityTrendsEcho:
    def test_entity_type_is_null_without_a_type_filter(
        self,
        client: TestClient,
        repo: SQLiteEntryRepository,
        services: dict,
    ) -> None:
        entity_store: SQLiteEntityStore = services["entity_store"]
        entry = repo.create_entry("2026-03-15", "photo", "Atlas", 1)
        atlas = entity_store.create_entity("person", "Atlas", "", "2026-03-15")
        entity_store.create_mention(atlas.id, entry.id, "Atlas", 0.9, "run-1")

        resp = client.get("/api/dashboard/entity-trends")

        assert resp.status_code == 200
        body = resp.json()
        assert body["bin"] == "month"
        assert body["entity_type"] is None
        assert body["entities"] == ["Atlas"]
        assert body["bins"] == [{"period": "2026-03-01", "entity": "Atlas", "mention_count": 1}]


class TestMoodTrendsDayBin:
    def test_day_bin_is_accepted(
        self, client: TestClient, repo: SQLiteEntryRepository
    ) -> None:
        """The dashboard never asks for `day`, but the server serves it, so
        the contract's `MoodBin` includes it."""
        entry = repo.create_entry("2026-03-04", "photo", "x", 1)
        repo.add_mood_score(entry.id, "agency", 0.25)

        resp = client.get("/api/dashboard/mood-trends?bin=day")

        assert resp.status_code == 200
        body = resp.json()
        assert body["bin"] == "day"
        assert [b["period"] for b in body["bins"]] == ["2026-03-04"]
