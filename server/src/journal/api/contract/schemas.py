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


# --- dashboard and insights (api/dashboard.py) -----------------------------
#
# Most dashboard bodies echo the request's `from`/`to` query params. `from` is
# a Python keyword, so those shapes use the functional `TypedDict` syntax, with
# the docstring set on `__doc__` and the config applied by calling
# `with_config` (it sets `__pydantic_config__` in place, like the decorator).
# Every echoed `from`/`to` is null when the caller omitted it, except on
# mood-drilldown, which rejects a request without both (400).

type DashboardBin = Literal["week", "month", "quarter", "year"]
"""Time bucket of the writing-stats and entity-trends series."""

type MoodBin = Literal["day", "week", "month", "quarter", "year"]
"""Time bucket of the mood-trends series. The server also accepts `day` here
(the MCP mood tool uses it); the dashboard asks for the other four."""


@with_config(CONTRACT_CONFIG)
class WritingFrequencyBin(TypedDict):
    """One non-empty bucket: `asdict(journal.models.WritingFrequencyBin)`.
    `bin_start` is the ISO date of the bucket's first day."""

    bin_start: str
    entry_count: int
    total_words: int


WritingStatsResponse = TypedDict(
    "WritingStatsResponse",
    {
        "from": str | None,
        "to": str | None,
        "bin": DashboardBin,
        "bins": list[WritingFrequencyBin],
    },
)
WritingStatsResponse.__doc__ = """Body of `GET /api/dashboard/writing-stats`.
Empty buckets are omitted."""
with_config(CONTRACT_CONFIG)(WritingStatsResponse)


type MoodScaleType = Literal["bipolar", "unipolar"]
"""`journal.services.mood_dimensions.ScaleType`."""


@with_config(CONTRACT_CONFIG)
class MoodDimension(TypedDict):
    """One mood facet from the server's TOML config. `score_min` and
    `score_max` follow from `scale_type` (bipolar `[-1, 1]`, unipolar
    `[0, 1]`)."""

    name: str
    positive_pole: str
    negative_pole: str
    scale_type: MoodScaleType
    score_min: float
    score_max: float
    notes: str


@with_config(CONTRACT_CONFIG)
class MoodDimensionsMeta(TypedDict):
    """Metadata of the mood-dimensions config file; empty strings when mood
    scoring is off or the file has no `[meta]` block."""

    version: str
    description: str


@with_config(CONTRACT_CONFIG)
class MoodDimensionsResponse(TypedDict):
    """Body of `GET /api/dashboard/mood-dimensions`. `dimensions` is empty
    when mood scoring is disabled."""

    dimensions: list[MoodDimension]
    meta: MoodDimensionsMeta


@with_config(CONTRACT_CONFIG)
class MoodTrendBin(TypedDict):
    """One (period, dimension) bucket: `asdict(journal.models.MoodTrend)`."""

    period: str
    dimension: str
    avg_score: float
    entry_count: int
    score_min: float | None
    score_max: float | None


MoodTrendsResponse = TypedDict(
    "MoodTrendsResponse",
    {
        "from": str | None,
        "to": str | None,
        "bin": MoodBin,
        "bins": list[MoodTrendBin],
    },
)
MoodTrendsResponse.__doc__ = """Body of `GET /api/dashboard/mood-trends`.
Buckets with no scored entries are omitted."""
with_config(CONTRACT_CONFIG)(MoodTrendsResponse)


@with_config(CONTRACT_CONFIG)
class MoodDrilldownEntry(TypedDict):
    """One entry's score for the drilled-down dimension."""

    entry_id: int
    entry_date: str
    score: float
    confidence: float | None
    rationale: str | None


MoodDrilldownResponse = TypedDict(
    "MoodDrilldownResponse",
    {
        "dimension": str,
        "from": str,
        "to": str,
        "entries": list[MoodDrilldownEntry],
    },
)
MoodDrilldownResponse.__doc__ = """Body of `GET /api/dashboard/mood-drilldown`.
`from` and `to` are required query params, so they are never null here."""
with_config(CONTRACT_CONFIG)(MoodDrilldownResponse)


@with_config(CONTRACT_CONFIG)
class EntityDistributionItem(TypedDict):
    """Mention count of one entity in the window."""

    canonical_name: str
    entity_type: EntityType
    mention_count: int


EntityDistributionResponse = TypedDict(
    "EntityDistributionResponse",
    {
        "type": EntityType | None,
        "from": str | None,
        "to": str | None,
        "total": int,
        "items": list[EntityDistributionItem],
    },
)
EntityDistributionResponse.__doc__ = """Body of `GET /api/dashboard/entity-distribution`.
`type` echoes the entity-type filter (null when absent)."""
with_config(CONTRACT_CONFIG)(EntityDistributionResponse)


@with_config(CONTRACT_CONFIG)
class CalendarDay(TypedDict):
    """One day with at least one entry."""

    date: str
    entry_count: int
    total_words: int


CalendarHeatmapResponse = TypedDict(
    "CalendarHeatmapResponse",
    {
        "from": str | None,
        "to": str | None,
        "days": list[CalendarDay],
    },
)
CalendarHeatmapResponse.__doc__ = """Body of `GET /api/dashboard/calendar-heatmap`.
`from`/`to` echo the query params and are null when omitted."""
with_config(CONTRACT_CONFIG)(CalendarHeatmapResponse)


@with_config(CONTRACT_CONFIG)
class EntityTrendBin(TypedDict):
    """Mentions of one entity in one period."""

    period: str
    entity: str
    mention_count: int


EntityTrendsResponse = TypedDict(
    "EntityTrendsResponse",
    {
        "from": str | None,
        "to": str | None,
        "bin": DashboardBin,
        "entity_type": str | None,
        "entities": list[str],
        "bins": list[EntityTrendBin],
    },
)
EntityTrendsResponse.__doc__ = """Body of `GET /api/dashboard/entity-trends`.
`entity_type` echoes the unvalidated `type` query param (null when absent);
`entities` is the top-N entity names, in rank order."""
with_config(CONTRACT_CONFIG)(EntityTrendsResponse)


@with_config(CONTRACT_CONFIG)
class MoodEntityCorrelationItem(TypedDict):
    """Average score of one dimension over the entries mentioning an entity."""

    entity: str
    entity_type: EntityType
    avg_score: float
    entry_count: int


MoodEntityCorrelationResponse = TypedDict(
    "MoodEntityCorrelationResponse",
    {
        "dimension": str,
        "from": str | None,
        "to": str | None,
        "entity_type": str | None,
        "overall_avg": float,
        "items": list[MoodEntityCorrelationItem],
    },
)
MoodEntityCorrelationResponse.__doc__ = """Body of `GET /api/dashboard/mood-entity-correlation`.
`entity_type` echoes the unvalidated `type` query param (null when absent);
`overall_avg` is 0 when nothing in the window is scored."""
with_config(CONTRACT_CONFIG)(MoodEntityCorrelationResponse)


@with_config(CONTRACT_CONFIG)
class WordCountBucket(TypedDict):
    """One histogram bucket of entry word counts."""

    range_start: int
    range_end: int
    count: int


@with_config(CONTRACT_CONFIG)
class WordCountStats(TypedDict):
    """Summary of entry word counts in the window (zeros when empty)."""

    min: int
    max: int
    avg: float
    median: float
    total_entries: int


WordCountDistributionResponse = TypedDict(
    "WordCountDistributionResponse",
    {
        "from": str | None,
        "to": str | None,
        "bucket_size": int,
        "buckets": list[WordCountBucket],
        "stats": WordCountStats,
    },
)
WordCountDistributionResponse.__doc__ = (
    """Body of `GET /api/dashboard/word-count-distribution`."""
)
with_config(CONTRACT_CONFIG)(WordCountDistributionResponse)


# --- search (api/search.py) ------------------------------------------------

type SearchSort = Literal["relevance", "date_desc", "date_asc"]
"""Result order of `GET /api/search`."""


@with_config(CONTRACT_CONFIG)
class SearchChunkMatch(TypedDict):
    """One chunk that matched the query (`journal.models.ChunkMatch`).
    Offsets and index are null for entries ingested before chunks were
    persisted."""

    text: str
    score: float
    chunk_index: int | None
    char_start: int | None
    char_end: int | None


@with_config(CONTRACT_CONFIG)
class SearchResultItem(TypedDict):
    """One entry in the search results. `snippet` is an FTS5 excerpt (with
    `\\x02`/`\\x03` around matched terms) when BM25 contributed, else null;
    `matching_chunks` is filled when dense retrieval contributed."""

    entry_id: int
    entry_date: str
    text: str
    score: float
    snippet: str | None
    matching_chunks: list[SearchChunkMatch]


@with_config(CONTRACT_CONFIG)
class SearchResponse(TypedDict):
    """Body of `GET /api/search`."""

    query: str
    limit: int
    offset: int
    sort: SearchSort
    reranker: str
    """Class name of the active reranker, e.g. `AnthropicReranker`."""
    items: list[SearchResultItem]


@with_config(CONTRACT_CONFIG)
class AnswerCitation(TypedDict):
    """One entry cited by a synthesized answer."""

    entry_id: int
    entry_date: str
    snippet: str


@with_config(CONTRACT_CONFIG)
class AnswerResponse(TypedDict):
    """Body of `POST /api/search/answer`. `answered` is false (with a fixed
    message in `answer`) when the journal doesn't cover the question;
    `is_question` is false when the query was a plain search, and `answer`
    is then empty."""

    question: str
    answer: str
    answered: bool
    is_question: bool
    citations: list[AnswerCitation]
    model: str


# --- storylines (api/storylines.py, api/storylines_write.py) ---------------

type StorylineStatus = Literal["active", "archived"]
"""`storylines.status` (CHECK constraint)."""

type ChapterState = Literal["draft", "published"]
"""Exactly one `draft` chapter per storyline (last by `seq`); the rest are
`published` and immutable."""


@with_config(CONTRACT_CONFIG)
class StorylineAnchor(TypedDict):
    """One anchor entity. `canonical_name` is empty if the entity is gone."""

    entity_id: int
    canonical_name: str


@with_config(CONTRACT_CONFIG)
class StorylineSummary(TypedDict):
    """A storyline in a list, and the body of `PATCH /api/storylines/{id}`."""

    id: int
    name: str
    description: str
    status: StorylineStatus
    anchors: list[StorylineAnchor]
    """Sorted by entity id."""
    unread_count: int
    """Published chapters not yet read."""
    chapter_count: int
    updated_at: str
    created_at: str


@with_config(CONTRACT_CONFIG)
class ChapterMeta(TypedDict):
    """Chapter metadata: the chapter list on a storyline, and the body of the
    read, unread and rename routes. Dates and `entry_count` derive from the
    chapter's entries."""

    id: int
    seq: int
    title: str
    state: ChapterState
    entry_count: int
    first_entry_date: str | None
    last_entry_date: str | None
    published_at: str | None
    """Null while the chapter is the draft."""
    read_at: str | None
    """Null means unread."""
    citation_count: int


@with_config(CONTRACT_CONFIG)
class TextSegment(TypedDict):
    """A run of narrative prose."""

    kind: Literal["text"]
    text: str


@with_config(CONTRACT_CONFIG)
class CitationSegment(TypedDict):
    """A citation of a quote from an entry
    (`journal.services.storylines.segments.citation_segment`). `entry_date`
    is absent on narratives stored before the field existed."""

    kind: Literal["citation"]
    entry_id: int
    quote: str
    entry_date: NotRequired[str]


type Segment = TextSegment | CitationSegment
"""One unit of a chapter narrative: prose and citations interleave."""


@with_config(CONTRACT_CONFIG)
class Addendum(TypedDict):
    """A later addition to a published chapter, rendered as its own block."""

    added_at: str
    segments: list[Segment]
    entry_ids: list[int]


@with_config(CONTRACT_CONFIG)
class ChapterDetail(ChapterMeta):
    """Body of `GET /api/storylines/{id}/chapters/{cid}`."""

    segments: list[Segment]
    addenda: list[Addendum]
    model_used: str
    generated_at: str | None


@with_config(CONTRACT_CONFIG)
class StorylineDetail(StorylineSummary):
    """Body of `GET /api/storylines/{id}`: the summary plus chapter metadata
    in `seq` order (the draft last)."""

    chapters: list[ChapterMeta]


@with_config(CONTRACT_CONFIG)
class StorylineListResponse(TypedDict):
    """Body of `GET /api/storylines`."""

    items: list[StorylineSummary]
    total: int
    limit: int
    offset: int


@with_config(CONTRACT_CONFIG)
class CreateStorylineResponse(TypedDict):
    """Body of `POST /api/storylines` (201). `bootstrap_job_id` is null when
    the bootstrap job could not be queued."""

    storyline: StorylineDetail
    bootstrap_job_id: str | None


@with_config(CONTRACT_CONFIG)
class StorylineJobResponse(TypedDict):
    """Body of the job-queueing storyline routes (refresh, unpublish; 202)."""

    job_id: str
    status: JobStatus


@with_config(CONTRACT_CONFIG)
class SetStorylineAnchorsResponse(TypedDict):
    """Body of `PUT /api/storylines/{id}/anchors`."""

    id: int
    anchors: list[StorylineAnchor]


@with_config(CONTRACT_CONFIG)
class StorylineDeleteResponse(TypedDict):
    """Body of `DELETE /api/storylines/{id}`."""

    deleted: bool


# --- authenticated health and stats (api/health.py) ------------------------


@with_config(CONTRACT_CONFIG)
class IngestionStats(TypedDict):
    """Corpus statistics: `asdict(journal.models.IngestionStats)`."""

    total_entries: int
    entries_last_7d: int
    entries_last_30d: int
    by_source_type: dict[str, int]
    """Entry count per `source_type`."""
    avg_words_per_entry: float
    avg_chunks_per_entry: float
    last_ingestion_at: str | None
    total_chunks: int
    row_counts: dict[str, int]
    """Row count per SQLite table."""


@with_config(CONTRACT_CONFIG)
class IngestionStatsError(TypedDict):
    """Sent in place of `IngestionStats` when the stats query fails."""

    error: str


@with_config(CONTRACT_CONFIG)
class LatencyPercentiles(TypedDict):
    """Per-query-type latency in ms; all null before the first sample."""

    p50_ms: float | None
    p95_ms: float | None
    p99_ms: float | None


@with_config(CONTRACT_CONFIG)
class QueryTypeStats(TypedDict):
    """Counter and latency for one query type."""

    count: int
    latency: LatencyPercentiles


@with_config(CONTRACT_CONFIG)
class QueryStats(TypedDict):
    """Query counters since server start (`journal.services.stats`)."""

    total_queries: int
    uptime_seconds: float
    started_at: str | None
    """Null only when the server runs without a stats collector."""
    by_type: dict[str, QueryTypeStats]


type FitnessAuthStatus = Literal["unknown", "ok", "broken"]
"""`fitness_auth_state.auth_status` (migration 0023)."""


@with_config(CONTRACT_CONFIG)
class FitnessSourceHealth(TypedDict):
    """One fitness source in the `/api/health` `fitness` block.

    `auth_status` and `auth_broken_since` are null for a source with sync
    runs but no auth-state row."""

    auth_status: FitnessAuthStatus | None
    last_success_at: str | None
    auth_broken_since: str | None


@with_config(CONTRACT_CONFIG)
class HealthResponse(TypedDict):
    """Body of the authenticated `GET /api/health`: liveness plus usage stats."""

    status: HealthStatus
    checks: list[ComponentCheck]
    ingestion: IngestionStats | IngestionStatsError
    queries: QueryStats
    fitness: NotRequired[dict[str, FitnessSourceHealth]]
    """Keyed by source (`strava`, `garmin`). Absent when the user has no
    fitness source configured or synced."""


@with_config(CONTRACT_CONFIG)
class Statistics(TypedDict):
    """Body of `GET /api/stats`: `asdict(journal.models.Statistics)`."""

    total_entries: int
    date_range_start: str | None
    date_range_end: str | None
    total_words: int
    avg_words_per_entry: float
    entries_per_month: float


# --- settings (api/settings.py) --------------------------------------------

type PricingCategory = Literal["llm", "embedding", "transcription"]
"""`pricing.category` (migration 0017)."""


@with_config(CONTRACT_CONFIG)
class PricingEntry(TypedDict):
    """One model's price: `api._shared._pricing_to_dict`."""

    model: str
    category: PricingCategory
    input_cost_per_mtok: float | None
    output_cost_per_mtok: float | None
    cost_per_minute: float | None
    last_verified: str


@with_config(CONTRACT_CONFIG)
class RuntimeSetting(TypedDict):
    """One runtime-editable setting (`RuntimeSettings.get_all`)."""

    key: str
    type: Literal["bool", "string"]
    label: str
    description: str
    value: bool | str
    """A boolean when `type` is `bool`, else a string."""
    choices: NotRequired[list[str]]
    """Allowed values of a `string` setting that has a fixed set."""


@with_config(CONTRACT_CONFIG)
class OcrSettings(TypedDict):
    """`ocr` block of `GET /api/settings`."""

    provider: str
    model: str


@with_config(CONTRACT_CONFIG)
class TranscriptionFallbackSettings(TypedDict):
    """`transcription.fallback` block of `GET /api/settings`."""

    enabled: bool
    model: str


@with_config(CONTRACT_CONFIG)
class TranscriptionShadowSettings(TypedDict):
    """`transcription.shadow` block; provider and model are null when disabled."""

    enabled: bool
    provider: str | None
    model: str | None


@with_config(CONTRACT_CONFIG)
class TranscriptionRetrySettings(TypedDict):
    """`transcription.retry` block of `GET /api/settings`."""

    max_attempts: int
    base_delay_seconds: float
    max_delay_seconds: float


@with_config(CONTRACT_CONFIG)
class TranscriptionSettings(TypedDict):
    """`transcription` block of `GET /api/settings`."""

    provider: str
    model: str
    fallback: TranscriptionFallbackSettings
    shadow: TranscriptionShadowSettings
    retry: TranscriptionRetrySettings


@with_config(CONTRACT_CONFIG)
class TranscriptFormattingSettings(TypedDict):
    """`transcript_formatting` block of `GET /api/settings`."""

    model: str


@with_config(CONTRACT_CONFIG)
class EmbeddingSettings(TypedDict):
    """`embedding` block of `GET /api/settings`."""

    model: str
    dimensions: int


@with_config(CONTRACT_CONFIG)
class ChunkingSettings(TypedDict):
    """`chunking` block of `GET /api/settings`."""

    strategy: str
    max_tokens: int
    min_tokens: int
    overlap_tokens: int
    boundary_percentile: int
    decisive_percentile: int
    embed_metadata_prefix: bool


@with_config(CONTRACT_CONFIG)
class EntityExtractionSettings(TypedDict):
    """`entity_extraction` block of `GET /api/settings`."""

    model: str
    dedup_similarity_threshold: float


@with_config(CONTRACT_CONFIG)
class SearchSettings(TypedDict):
    """`search` block of `GET /api/settings`: the hybrid-search knobs (F17)."""

    reranker: str
    """`anthropic`, or `none` for RRF-only ranking."""
    reranker_model: str | None
    """Null when `reranker` is `none`."""
    bm25_candidates: int
    dense_candidates: int
    fusion_top_m: int
    rrf_k: int


@with_config(CONTRACT_CONFIG)
class FeatureSettings(TypedDict):
    """`features` block of `GET /api/settings`."""

    mood_scoring: bool
    """The runtime `enable_mood_scoring` setting."""
    mood_scorer_model: str
    journal_author_name: str
    strava_enabled: bool
    """False hides all Strava UI (Strava is mothballed, `STRAVA_ENABLED`)."""


@with_config(CONTRACT_CONFIG)
class ServerSettings(TypedDict):
    """Body of `GET /api/settings`: non-secret config. Secrets are never sent."""

    ocr: OcrSettings
    transcription: TranscriptionSettings
    transcript_formatting: TranscriptFormattingSettings
    embedding: EmbeddingSettings
    chunking: ChunkingSettings
    entity_extraction: EntityExtractionSettings
    search: SearchSettings
    features: FeatureSettings
    runtime: list[RuntimeSetting]
    """Empty when runtime settings are unavailable."""
    pricing: list[PricingEntry]


@with_config(CONTRACT_CONFIG)
class RuntimeSettingsListResponse(TypedDict):
    """Body of `GET /api/settings/runtime`."""

    settings: list[RuntimeSetting]


@with_config(CONTRACT_CONFIG)
class RuntimeSettingsUpdateResponse(TypedDict):
    """Body of `PATCH /api/settings/runtime` (admin only).

    `warnings` lists the keys that failed when at least one other key was
    updated; if every key fails the route answers 400 instead."""

    updated: list[str]
    settings: list[RuntimeSetting]
    warnings: NotRequired[list[str]]


@with_config(CONTRACT_CONFIG)
class PricingListResponse(TypedDict):
    """Body of `GET /api/settings/pricing`."""

    pricing: list[PricingEntry]


@with_config(CONTRACT_CONFIG)
class PricingUpdateResponse(TypedDict):
    """Body of `PATCH /api/settings/pricing` (admin only).

    200 when every model updated; 207 with `errors` when some failed. (When
    all fail it is a 400 with the same shape.)"""

    updated: list[str]
    pricing: list[PricingEntry]
    errors: NotRequired[list[str]]


# --- user preferences (api/users.py) ---------------------------------------


@with_config(CONTRACT_CONFIG)
class PreferencesResponse(TypedDict):
    """Body of `GET` and `PATCH /api/users/me/preferences`.

    Maps each preference key to its stored JSON value."""

    preferences: dict[str, Any]


# --- notifications (api/notifications.py) ----------------------------------

type NotificationTopicGroup = Literal["success", "failure", "admin"]
"""Section a topic is listed under (`journal.services.notifications.TOPICS`)."""


@with_config(CONTRACT_CONFIG)
class NotificationTopic(TypedDict):
    """One notification topic with the user's toggle state."""

    key: str
    label: str
    group: NotificationTopicGroup
    admin_only: bool
    default: bool
    enabled: bool
    """The user's preference, or `default` when unset."""


@with_config(CONTRACT_CONFIG)
class NotificationTopicsResponse(TypedDict):
    """Body of `GET /api/notifications/topics`. Admin-only topics are
    listed for admins only."""

    topics: list[NotificationTopic]


@with_config(CONTRACT_CONFIG)
class NotificationStatusResponse(TypedDict):
    """Body of `GET /api/notifications/status`."""

    configured: bool


@with_config(CONTRACT_CONFIG)
class NotificationValidateResponse(TypedDict):
    """Body of `POST /api/notifications/validate`: valid credentials are saved."""

    valid: bool
    error: str | None


@with_config(CONTRACT_CONFIG)
class NotificationTestResponse(TypedDict):
    """Body of `POST /api/notifications/test`."""

    sent: bool
    error: str | None


# --- auth (auth_api/core.py, account.py, profile.py, api_keys.py) ----------


@with_config(CONTRACT_CONFIG)
class AuthUser(TypedDict):
    """A user account: `auth_api._shared._user_to_dict` of a stored `User`."""

    id: int
    email: str
    display_name: str
    is_admin: bool
    is_active: bool
    email_verified: bool
    created_at: str
    updated_at: str


@with_config(CONTRACT_CONFIG)
class AuthUserResponse(TypedDict):
    """Body of login, register, `GET`/`PATCH /api/auth/me` and the admin
    user update."""

    user: AuthUser


@with_config(CONTRACT_CONFIG)
class AuthConfigResponse(TypedDict):
    """Body of `GET /api/auth/config` (no auth required)."""

    registration_enabled: bool


@with_config(CONTRACT_CONFIG)
class OkResponse(TypedDict):
    """Body of logout and API-key revoke."""

    ok: Literal[True]


@with_config(CONTRACT_CONFIG)
class MessageResponse(TypedDict):
    """A human-readable confirmation: forgot-password, reset-password,
    verify-email and resend-verification."""

    message: str


@with_config(CONTRACT_CONFIG)
class ResetTokenValidResponse(TypedDict):
    """Body of `GET /api/auth/verify-reset-token`; an invalid token is a 400."""

    valid: Literal[True]


@with_config(CONTRACT_CONFIG)
class ApiKey(TypedDict):
    """API key metadata (`journal.models.ApiKeyInfo`); never the secret.

    Revoked keys are listed too, with `revoked_at` set."""

    id: int
    user_id: int
    key_prefix: str
    """The first characters of the key, for recognising it."""
    name: str
    created_at: str
    expires_at: str | None
    last_used_at: str | None
    revoked_at: str | None


@with_config(CONTRACT_CONFIG)
class ApiKeyListResponse(TypedDict):
    """Body of `GET /api/auth/api-keys`, newest first."""

    items: list[ApiKey]


@with_config(CONTRACT_CONFIG)
class ApiKeyCreatedResponse(ApiKey):
    """Body of `POST /api/auth/api-keys` (201): the new key's metadata plus
    the full secret, which is shown this once only."""

    key: str


type ApiKeysResponse = ApiKeyListResponse | ApiKeyCreatedResponse
"""`/api/auth/api-keys`: `GET` lists keys, `POST` creates one."""


# --- admin (auth_api/admin.py) ---------------------------------------------

type SqliteBool = Literal[0, 1]
"""A flag sent as SQLite stores it: 0 or 1, not a JSON boolean."""


@with_config(CONTRACT_CONFIG)
class AdminUserStats(TypedDict):
    """One user in `GET /api/admin/users` (`get_user_stats`).

    The three flags are raw SQLite integers here, unlike `AuthUser`."""

    id: int
    email: str
    display_name: str
    is_admin: SqliteBool
    is_active: SqliteBool
    email_verified: SqliteBool
    created_at: str
    entry_count: int
    total_words: int
    last_entry_at: str | None
    job_count: int
    cost_estimate: float
    """Rough lifetime USD cost from job counts."""
    cost_this_week: float


@with_config(CONTRACT_CONFIG)
class AdminUserListResponse(TypedDict):
    """Body of `GET /api/admin/users`, newest account first."""

    items: list[AdminUserStats]


@with_config(CONTRACT_CONFIG)
class OcrContextReloadSummary(TypedDict):
    """Body of `POST /api/admin/reload/ocr-context`."""

    reloaded: Literal["ocr-context"]
    provider: str
    model: str
    """The configured model, or `default` for the provider's built-in one."""
    dual_pass: bool
    context_files: int
    context_chars: int
    reloaded_at: str


@with_config(CONTRACT_CONFIG)
class TranscriptionContextReloadSummary(TypedDict):
    """Body of `POST /api/admin/reload/transcription-context`."""

    reloaded: Literal["transcription-context"]
    stack: str
    """The provider chain, e.g. `retrying(openai/gpt-4o-transcribe, fb=whisper-1)`."""
    context_files: int
    context_chars: int
    reloaded_at: str


@with_config(CONTRACT_CONFIG)
class MoodDimensionsReloadSummary(TypedDict):
    """Body of `POST /api/admin/reload/mood-dimensions` (409 when mood
    scoring is disabled)."""

    reloaded: Literal["mood-dimensions"]
    dimension_count: int
    dimensions: list[str]
    """Dimension names, in file order."""
    version: str
    reloaded_at: str


@with_config(CONTRACT_CONFIG)
class EntityCasingReloadSummary(TypedDict):
    """Body of `POST /api/admin/reload/entity-casing`."""

    reloaded: Literal["entity-casing"]
    exception_count: int
    path: str
    reloaded_at: str


# --- fitness reads (api/fitness.py) ----------------------------------------
#
# Numeric types follow the SQLite columns (migrations 0025/0029): an INTEGER
# column comes back as `int`, a REAL column as `float` (REAL affinity stores
# an inserted integer as a float). Every value computed with SQL `AVG` or by
# division is a `float`. (Strict validation still accepts an `int` for a
# `float` field, but rejects a `float` for an `int` one.)

type FitnessSource = Literal["strava", "garmin"]
"""`fitness_*.source` (CHECK constraint in migrations 0023/0025)."""

type FitnessActivityType = Literal[
    "run", "ride", "swim", "walk", "hike", "row", "strength", "other"
]
"""`fitness_activities.activity_type` (migration 0029 added `row`)."""

type FitnessSyncRunStatus = Literal[
    "running", "success", "auth_broken", "transient_failure", "normalize_drift"
]
"""`fitness_sync_runs.status` (migration 0023)."""


@with_config(CONTRACT_CONFIG)
class FitnessActivity(TypedDict):
    """One row of `fitness_activities` (`api/fitness.py::_activity_to_dict`)."""

    id: int
    user_id: int
    source: FitnessSource
    source_id: str
    activity_type: FitnessActivityType
    source_subtype: str
    """The upstream's own activity type (`Run`, `indoor_rowing`, ...)."""
    start_time: str
    local_date: str
    duration_s: int
    moving_time_s: int | None
    distance_m: float | None
    elevation_gain_m: float | None
    avg_hr_bpm: int | None
    max_hr_bpm: int | None
    avg_pace_s_per_km: float | None
    calories_kcal: int | None
    perceived_exertion: int | None
    extras: dict[str, Any]
    raw_ref_id: int
    normalized_at: str


@with_config(CONTRACT_CONFIG)
class FitnessActivitiesResponse(TypedDict):
    """Body of `GET /api/fitness/activities`."""

    items: list[FitnessActivity]


@with_config(CONTRACT_CONFIG)
class FitnessDaily(TypedDict):
    """One row of `fitness_daily` (`api/fitness.py::_daily_to_dict`).
    Garmin is the only source of daily rows today."""

    id: int
    user_id: int
    source: FitnessSource
    local_date: str
    sleep_score: int | None
    sleep_duration_s: int | None
    sleep_efficiency_pct: float | None
    hrv_overnight_ms: float | None
    resting_hr_bpm: int | None
    body_battery_high: int | None
    body_battery_low: int | None
    stress_avg: int | None
    training_load_acute: float | None
    training_load_chronic: float | None
    training_readiness: int | None
    extras: dict[str, Any]
    raw_ref_ids: list[int]
    normalized_at: str


@with_config(CONTRACT_CONFIG)
class FitnessDailyResponse(TypedDict):
    """Body of `GET /api/fitness/daily`."""

    items: list[FitnessDaily]


@with_config(CONTRACT_CONFIG)
class FitnessSyncRun(TypedDict):
    """One element of `last_runs` in the sync-status response."""

    id: int
    started_at: str
    finished_at: str | None
    status: FitnessSyncRunStatus
    rows_fetched: int
    """Legacy total (workouts + wellness)."""
    rows_normalized: int
    workouts_fetched: int
    """Per-bucket counts (2026-05-11). Strava is workouts-only, so its
    `wellness_*` are 0; rows older than the split have 0 in all four."""
    wellness_fetched: int
    workouts_normalized: int
    wellness_normalized: int
    error_class: str | None
    error_message: str | None


@with_config(CONTRACT_CONFIG)
class FitnessSourceStatus(TypedDict):
    """One source in `GET /api/fitness/sync/status`."""

    auth_status: FitnessAuthStatus
    """`unknown` when the source has sync runs but no auth-state row."""
    auth_broken_since: str | None
    last_success_at: str | None
    last_runs: list[FitnessSyncRun]
    """Up to 10 most recent runs, newest first."""
    credentials_saved: NotRequired[bool]
    """Garmin only (always present there): an encrypted password is saved
    and the configured `FITNESS_CREDENTIAL_KEY` can decrypt it."""


@with_config(CONTRACT_CONFIG)
class FitnessSyncStatus(TypedDict):
    """Body of `GET /api/fitness/sync/status`. A source is null when the
    user has neither an auth-state row nor a sync run for it."""

    strava: FitnessSourceStatus | None
    garmin: FitnessSourceStatus | None


@with_config(CONTRACT_CONFIG)
class FitnessActivityOrphan(TypedDict):
    """An activity whose `raw_ref_id` has no row in its source's raw table."""

    activity_id: int
    source: FitnessSource
    raw_ref_id: int
    issue: Literal["raw_row_missing"]


@with_config(CONTRACT_CONFIG)
class FitnessDailyOrphan(TypedDict):
    """A daily row with raw ids missing from `fitness_raw_garmin`."""

    daily_id: int
    source: FitnessSource
    missing_raw_ids: list[int]


@with_config(CONTRACT_CONFIG)
class FitnessIntegrityReport(TypedDict):
    """Body of `GET /api/fitness/integrity`: the caller's soft-pointer
    orphans (`journal.db.fitness_integrity`). Empty lists mean a clean DB."""

    activities: list[FitnessActivityOrphan]
    daily: list[FitnessDailyOrphan]


type DivergenceQuadrant = Literal[
    "likely_mental_fatigue",
    "hidden_physical_under_recovery",
    "congruent_fatigue",
    "congruent_ok",
]
"""How a day's felt tiredness compares with its objective recovery."""


@with_config(CONTRACT_CONFIG)
class DivergenceRow(TypedDict):
    """One day of `GET /api/fitness/divergence`: `asdict(DivergenceDay)`.

    Every `*_z` is a rolling per-person z-score over the request's `window`
    (default 28 days), null without a baseline or a value that day.
    `quadrant` is null unless `sufficient`."""

    local_date: str
    subjective_tired_z: float | None
    physical_fatigue: float | None
    mental_fatigue: float | None
    recovery_z: float | None
    hrv_z: float | None
    resting_hr_z: float | None
    sleep_z: float | None
    readiness_z: float | None
    acwr: float | None
    """Raw acute:chronic training-load ratio (not a z-score)."""
    acwr_z: float | None
    quadrant: DivergenceQuadrant | None
    n_signals: int
    sufficient: bool


@with_config(CONTRACT_CONFIG)
class DivergenceSummary(TypedDict):
    """Classified days per quadrant. A quadrant with no days is absent."""

    likely_mental_fatigue: NotRequired[int]
    hidden_physical_under_recovery: NotRequired[int]
    congruent_fatigue: NotRequired[int]
    congruent_ok: NotRequired[int]


@with_config(CONTRACT_CONFIG)
class DivergenceResponse(TypedDict):
    """Body of `GET /api/fitness/divergence`."""

    rows: list[DivergenceRow]
    summary: DivergenceSummary


@with_config(CONTRACT_CONFIG)
class MoodRecoveryRow(TypedDict):
    """One date of `GET /api/fitness/mood-recovery`: per-date averages of
    the raw daily wellness values and the fatigue mood facets. Any value is
    null when that side has no data for the date."""

    local_date: str
    training_load_acute: float | None
    training_readiness: float | None
    """An `AVG` across sources, so a float even though the column is INTEGER."""
    hrv_overnight_ms: float | None
    physical_fatigue: float | None
    mental_fatigue: float | None


@with_config(CONTRACT_CONFIG)
class MoodRecoveryResponse(TypedDict):
    """Body of `GET /api/fitness/mood-recovery`."""

    rows: list[MoodRecoveryRow]


# --- fitness jobs and connections (api/fitness_{jobs,garmin,strava}.py) -----


@with_config(CONTRACT_CONFIG)
class FitnessSyncJobResponse(TypedDict):
    """Body of `POST /api/fitness/sync/{source}` and
    `POST /api/fitness/backfill/{source}` (202)."""

    job_id: str
    status: JobStatus
    already_running: NotRequired[Literal[True]]
    """Present when a sync or backfill for this user and source was already
    queued or running; `job_id` is then that job's id."""


@with_config(CONTRACT_CONFIG)
class ConnectedAccountResponse(TypedDict):
    """A completed Garmin login (connect, reconnect, MFA) or Strava exchange."""

    connected: Literal[True]
    upstream_user_id: str
    """Garmin `displayName`, or the Strava athlete id as a string."""


@with_config(CONTRACT_CONFIG)
class GarminMfaPendingResponse(TypedDict):
    """Garmin wants an MFA code: send it with `pending_session` to
    `POST /api/fitness/garmin/connect/mfa`."""

    mfa_required: Literal[True]
    pending_session: str
    expires_at: str


type GarminConnectResponse = ConnectedAccountResponse | GarminMfaPendingResponse
"""`POST /api/fitness/garmin/connect` and `/reconnect`: logged in, or an MFA
challenge."""


@with_config(CONTRACT_CONFIG)
class DisconnectResponse(TypedDict):
    """Body of the Garmin and Strava disconnect routes. `disconnected` is
    false when there was no auth row to delete."""

    disconnected: bool


@with_config(CONTRACT_CONFIG)
class StravaAuthorizeUrlResponse(TypedDict):
    """Body of `GET /api/fitness/strava/authorize_url`."""

    authorize_url: str
    state: str
    """One-shot CSRF token for the exchange call."""
    expires_at: str


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
    # dashboard and insights
    "api_dashboard_writing_stats": WritingStatsResponse,
    "api_dashboard_mood_dimensions": MoodDimensionsResponse,
    "api_dashboard_mood_trends": MoodTrendsResponse,
    "api_dashboard_mood_drilldown": MoodDrilldownResponse,
    "api_dashboard_entity_distribution": EntityDistributionResponse,
    "api_dashboard_calendar_heatmap": CalendarHeatmapResponse,
    "api_dashboard_entity_trends": EntityTrendsResponse,
    "api_dashboard_mood_entity_correlation": MoodEntityCorrelationResponse,
    "api_dashboard_word_count_distribution": WordCountDistributionResponse,
    # search
    "api_search": SearchResponse,
    "api_search_answer": AnswerResponse,
    # storylines
    "api_list_storylines": StorylineListResponse,
    "api_storyline_detail": StorylineDetail,
    "api_storyline_chapter_detail": ChapterDetail,
    "api_create_storyline": CreateStorylineResponse,
    "api_refresh_storyline": StorylineJobResponse,
    "api_unpublish_storyline_chapter": StorylineJobResponse,
    "api_read_storyline_chapter": ChapterMeta,
    "api_unread_storyline_chapter": ChapterMeta,
    "api_rename_storyline_chapter": ChapterMeta,
    "api_update_storyline": StorylineSummary,
    "api_delete_storyline": StorylineDeleteResponse,
    "api_set_storyline_anchors": SetStorylineAnchorsResponse,
    # authenticated health and stats
    "api_health_authed": HealthResponse,
    "api_stats": Statistics,
    # settings
    "api_settings": ServerSettings,
    "api_runtime_settings_get": RuntimeSettingsListResponse,
    "api_runtime_settings_patch": RuntimeSettingsUpdateResponse,
    "api_pricing_get": PricingListResponse,
    "api_pricing_patch": PricingUpdateResponse,
    # user preferences
    "api_preferences_get": PreferencesResponse,
    "api_preferences_patch": PreferencesResponse,
    # notifications
    "api_notif_topics": NotificationTopicsResponse,
    "api_notif_status": NotificationStatusResponse,
    "api_notif_validate": NotificationValidateResponse,
    "api_notif_test": NotificationTestResponse,
    # auth
    "api_auth_login": AuthUserResponse,
    "api_auth_logout": OkResponse,
    "api_auth_me": AuthUserResponse,
    "api_auth_me_update": AuthUserResponse,
    "api_auth_config": AuthConfigResponse,
    "api_auth_register": AuthUserResponse,
    "api_auth_forgot_password": MessageResponse,
    "api_auth_verify_reset_token": ResetTokenValidResponse,
    "api_auth_reset_password": MessageResponse,
    "api_auth_verify_email": MessageResponse,
    "api_auth_resend_verification": MessageResponse,
    "api_auth_api_keys": ApiKeysResponse,
    "api_auth_api_key_revoke": OkResponse,
    # admin
    "api_admin_users_list": AdminUserListResponse,
    "api_admin_user_update": AuthUserResponse,
    "api_admin_reload_ocr_context": OcrContextReloadSummary,
    "api_admin_reload_transcription_context": TranscriptionContextReloadSummary,
    "api_admin_reload_mood_dimensions": MoodDimensionsReloadSummary,
    "api_admin_reload_entity_casing": EntityCasingReloadSummary,
    # fitness reads
    "api_fitness_list_activities": FitnessActivitiesResponse,
    "api_fitness_list_daily": FitnessDailyResponse,
    "api_fitness_sync_status": FitnessSyncStatus,
    "api_fitness_integrity": FitnessIntegrityReport,
    "api_fitness_divergence": DivergenceResponse,
    "api_fitness_mood_recovery": MoodRecoveryResponse,
    # fitness jobs
    "api_fitness_sync": FitnessSyncJobResponse,
    "api_fitness_backfill": FitnessSyncJobResponse,
    # fitness connections
    "api_fitness_garmin_connect": GarminConnectResponse,
    "api_fitness_garmin_reconnect": GarminConnectResponse,
    "api_fitness_garmin_connect_mfa": ConnectedAccountResponse,
    "api_fitness_garmin_disconnect": DisconnectResponse,
    "api_fitness_strava_authorize_url": StravaAuthorizeUrlResponse,
    "api_fitness_strava_exchange": ConnectedAccountResponse,
    "api_fitness_strava_disconnect": DisconnectResponse,
}
