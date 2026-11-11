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
}
