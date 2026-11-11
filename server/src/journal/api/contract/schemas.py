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

from typing import Any, Final, Literal, NotRequired, TypeAliasType, TypedDict

from pydantic import ConfigDict, with_config

CONTRACT_CONFIG: Final = ConfigDict(extra="forbid")
"""Config every contract ``TypedDict`` must carry (via ``with_config``).

Deliberately without ``json_schema_serialization_defaults_required``: a
``TypedDict`` has no defaults, and that flag makes Pydantic export every key
as required in serialization mode, ``NotRequired`` ones included.

This module must not use ``from __future__ import annotations`` either: under
it ``typing`` cannot see ``NotRequired`` inside string annotations, so
``__required_keys__`` is wrong. ``tests/test_contract_schemas.py`` checks
both.
"""


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


# --- entries (api/entries.py) ---------------------------------------------

type SourceType = Literal[
    "photo", "voice", "text_entry", "imported_text_file", "imported_audio_file"
]
"""How an entry was ingested (`entries.source_type`, see migration 0013)."""


@with_config(CONTRACT_CONFIG)
class EntrySummary(TypedDict):
    """One row of `GET /api/entries`: an entry without its text."""

    id: int
    entry_date: str
    source_type: SourceType
    word_count: int
    chunk_count: int
    page_count: int
    uncertain_span_count: int
    doubts_verified: bool
    date_confirmed: bool
    """False while the entry is quarantined (its date failed the bounds check)."""
    created_at: str
    language: str
    updated_at: str
    entity_mention_count: int


@with_config(CONTRACT_CONFIG)
class EntryListResponse(TypedDict):
    """Body of `GET /api/entries`."""

    items: list[EntrySummary]
    total: int
    limit: int
    offset: int


@with_config(CONTRACT_CONFIG)
class UncertainSpan(TypedDict):
    """Half-open `[char_start, char_end)` range in `raw_text` the OCR model flagged."""

    char_start: int
    char_end: int


@with_config(CONTRACT_CONFIG)
class ContentBoundary(TypedDict):
    """Half-open `[char_start, char_end)` range in `raw_text` holding the entry's content."""

    char_start: int
    char_end: int


@with_config(CONTRACT_CONFIG)
class EntryDetail(TypedDict):
    """One entry with its text: `GET /api/entries/{id}` and verify-doubts."""

    id: int
    entry_date: str
    source_type: SourceType
    raw_text: str
    final_text: str
    word_count: int
    chunk_count: int
    page_count: int
    language: str
    created_at: str
    updated_at: str
    doubts_verified: bool
    """When true, `uncertain_spans` is empty (the API suppresses them)."""
    date_confirmed: bool
    """False while the entry is quarantined (its date failed the bounds check)."""
    uncertain_spans: list[UncertainSpan]
    content_boundary: ContentBoundary | None
    """In-bounds content window; null means the whole text."""


@with_config(CONTRACT_CONFIG)
class EntryUpdateResponse(EntryDetail):
    """Body of `PATCH /api/entries/{id}`: the updated entry plus the ids of
    any background jobs the edit queued (each key only when queued)."""

    entity_extraction_job_id: NotRequired[str]
    reprocess_job_id: NotRequired[str]
    mood_job_id: NotRequired[str]
    pipeline_job_id: NotRequired[str]
    storyline_bootstrap_job_ids: NotRequired[list[str]]


@with_config(CONTRACT_CONFIG)
class EntryDeleteResponse(TypedDict):
    """Body of `DELETE /api/entries/{id}`."""

    deleted: bool
    id: int


type EntryDetailResponse = EntryDetail | EntryUpdateResponse | EntryDeleteResponse
"""`/api/entries/{id}`: GET returns `EntryDetail`, PATCH `EntryUpdateResponse`,
DELETE `EntryDeleteResponse` (one route name serves all three methods)."""


@with_config(CONTRACT_CONFIG)
class EntryChunk(TypedDict):
    """One persisted chunk; offsets are into `final_text` (end exclusive)."""

    index: int
    text: str
    char_start: int
    char_end: int
    token_count: int


@with_config(CONTRACT_CONFIG)
class EntryChunksResponse(TypedDict):
    """Body of `GET /api/entries/{id}/chunks`."""

    entry_id: int
    chunks: list[EntryChunk]


@with_config(CONTRACT_CONFIG)
class TokenSpan(TypedDict):
    """One tiktoken token; offsets are into `final_text` (end exclusive)."""

    index: int
    token_id: int
    text: str
    char_start: int
    char_end: int


@with_config(CONTRACT_CONFIG)
class EntryTokensResponse(TypedDict):
    """Body of `GET /api/entries/{id}/tokens`."""

    entry_id: int
    encoding: str
    """The tiktoken encoding name, e.g. `cl100k_base`."""
    model_hint: str
    """The model whose tokenizer this matches, e.g. `text-embedding-3-large`."""
    token_count: int
    tokens: list[TokenSpan]


# --- entities (api/entities.py, plus GET /api/entries/{id}/entities) -------

type EntityType = Literal["person", "place", "activity", "organization", "topic", "other"]
"""`journal.models.EntityType` (enforced by a CHECK constraint on `entities`)."""


@with_config(CONTRACT_CONFIG)
class Entity(TypedDict):
    """A full entity record: detail, update and alias routes."""

    id: int
    canonical_name: str
    entity_type: EntityType
    aliases: list[str]
    description: str
    first_seen: str
    created_at: str
    updated_at: str
    is_quarantined: bool
    quarantine_reason: str
    """Empty unless quarantined."""
    quarantined_at: str
    """Empty unless quarantined."""


@with_config(CONTRACT_CONFIG)
class EntityUpdateResponse(Entity):
    """Body of `PATCH /api/entities/{id}`. `reembed_job_id` is present only
    when the description changed and a re-embed job was queued."""

    reembed_job_id: NotRequired[str]


@with_config(CONTRACT_CONFIG)
class EntityDeleteResponse(TypedDict):
    """Body of `DELETE /api/entities/{id}`."""

    deleted: bool
    id: int


@with_config(CONTRACT_CONFIG)
class EntitySummary(TypedDict):
    """An entity in a list, with its mention count."""

    id: int
    canonical_name: str
    entity_type: EntityType
    aliases: list[str]
    mention_count: int
    first_seen: str
    last_seen: str
    is_quarantined: bool
    quarantine_reason: str
    quarantined_at: str
    quotes: NotRequired[list[str]]
    """Distinct quotes from one entry (only on `GET /api/entries/{id}/entities`)."""


@with_config(CONTRACT_CONFIG)
class EntityListResponse(TypedDict):
    """Body of `GET /api/entities`."""

    items: list[EntitySummary]
    total: int
    limit: int
    offset: int


@with_config(CONTRACT_CONFIG)
class EntryEntitiesResponse(TypedDict):
    """Body of `GET /api/entries/{id}/entities`."""

    entry_id: int
    items: list[EntitySummary]
    total: int


@with_config(CONTRACT_CONFIG)
class EntityMention(TypedDict):
    """One mention of an entity in an entry."""

    id: int
    entity_id: int
    entry_id: int
    entry_date: str | None
    """Null when the entry could not be loaded (e.g. deleted mid-request)."""
    quote: str
    confidence: float
    extraction_run_id: str
    created_at: str


@with_config(CONTRACT_CONFIG)
class EntityMentionsResponse(TypedDict):
    """Body of `GET /api/entities/{id}/mentions`."""

    entity_id: int
    mentions: list[EntityMention]
    total: int


@with_config(CONTRACT_CONFIG)
class EntityRelationship(TypedDict):
    """One `subject -predicate-> object` edge, with both entities' names and
    types and the date of the entry it was extracted from."""

    id: int
    subject_entity_id: int
    subject_name: str
    subject_type: EntityType
    predicate: str
    object_entity_id: int
    object_name: str
    object_type: EntityType
    quote: str
    entry_id: int
    entry_date: str
    confidence: float
    extraction_run_id: str
    created_at: str


@with_config(CONTRACT_CONFIG)
class EntityRelationshipsResponse(TypedDict):
    """Body of `GET /api/entities/{id}/relationships`."""

    entity_id: int
    outgoing: list[EntityRelationship]
    """Edges where this entity is the subject."""
    incoming: list[EntityRelationship]
    """Edges where this entity is the object."""


@with_config(CONTRACT_CONFIG)
class AliasLookupResponse(TypedDict):
    """Body of `GET /api/entities/aliases/lookup`. `entity_id` is null (and
    the other keys absent) when no entity of this user owns the alias."""

    entity_id: int | None
    canonical_name: NotRequired[str]
    entity_type: NotRequired[EntityType]


# --- jobs (api/jobs.py) ----------------------------------------------------

type JobStatus = Literal["queued", "running", "succeeded", "failed"]
"""`journal.models.JobStatus`."""

type JobType = Literal[
    "entity_extraction",
    "entity_reembed",
    "fitness_backfill_garmin",
    "fitness_backfill_strava",
    "fitness_sync_garmin",
    "fitness_sync_strava",
    "ingest_audio",
    "ingest_images",
    "mood_backfill",
    "mood_score_entry",
    "reprocess_embeddings",
    "save_entry_pipeline",
    "storyline_extension_check",
    "storyline_generation",
    "storyline_update",
]
"""Every `jobs.type` the API can return. `storyline_generation` is legacy:
nothing creates it since the 2026-07-12 storylines redesign, but older rows
keep it. `tests/test_contract_job_types.py` checks this list against the
job types the code creates."""

LEGACY_JOB_TYPES: Final = frozenset({"storyline_generation"})
"""Members of `JobType` that only historical `jobs` rows carry."""


@with_config(CONTRACT_CONFIG)
class Job(TypedDict):
    """One background job: `asdict`-like view of `journal.models.Job`."""

    id: str
    type: JobType
    status: JobStatus
    params: dict[str, Any]
    progress_current: int
    progress_total: int
    result: dict[str, Any] | None
    """Worker-specific summary; null until the job succeeds."""
    error_message: str | None
    status_detail: str | None
    created_at: str
    started_at: str | None
    finished_at: str | None
    input_tokens: int | None
    """LLM tokens used; null for legacy rows and jobs without LLM calls."""
    output_tokens: int | None
    cost_usd: float | None


@with_config(CONTRACT_CONFIG)
class JobListResponse(TypedDict):
    """Body of `GET /api/jobs`."""

    items: list[Job]
    total: int
    limit: int
    offset: int


# --- registry ---------------------------------------------------------------

RESPONSE_SCHEMAS: Final[dict[str, type | TypeAliasType]] = {
    "api_health": PublicHealthResponse,
    # entries
    "api_list_entries": EntryListResponse,
    "api_entry_detail": EntryDetailResponse,
    "api_verify_doubts": EntryDetail,
    "api_entry_chunks": EntryChunksResponse,
    "api_entry_tokens": EntryTokensResponse,
    "api_entry_entities": EntryEntitiesResponse,
    # entities
    "api_list_entities": EntityListResponse,
    "api_entity_detail": Entity,
    "api_entity_mentions": EntityMentionsResponse,
    "api_entity_relationships": EntityRelationshipsResponse,
    "api_update_entity": EntityUpdateResponse,
    "api_delete_entity": EntityDeleteResponse,
    "api_lookup_alias": AliasLookupResponse,
    "api_add_entity_alias": Entity,
    "api_delete_entity_alias": Entity,
    # jobs
    "api_list_jobs": JobListResponse,
    "api_job_detail": Job,
}
