import type { PaginationParams } from '@/types/entry'

/** One unit of a storyline panel's rendered content.
 *
 * The wire shape mirrors `services/storylines/segments.py` on the
 * server: a panel is a flat `Segment[]` where text runs and citation
 * pointers interleave. The webapp renders text segments as plain prose
 * and citation segments as `<RouterLink :to="/entries/${entry_id}">`
 * followed by the italicised cited quote.
 *
 * `quote` is sentence-length on both panels:
 *  - Narrative citations come from Anthropic Citations `source="text"`
 *    documents, so the API returns the auto-chunked sentence as
 *    `cited_text` (typically 50–200 chars).
 *  - Curation citations carry the short verbatim excerpt pulled from
 *    `entity_mentions.quote` (or the ±120-char FTS snippet when the
 *    FTS fallback fired).
 *
 * Both are short enough to render inline; the renderer has no
 * disclosure path.
 */
export type Segment =
  | { kind: 'text'; text: string }
  | {
      kind: 'citation'
      entry_id: number
      quote: string
      /** ISO YYYY-MM-DD date of the cited entry. Optional because
       *  panels stored before the server added this field still
       *  deserialise — UIs that depend on it must handle absence. */
      entry_date?: string
    }

export type StorylinePanelKind = 'curation' | 'narrative'

/** Server-returned status for a storyline. Today only "active" is
 *  produced — the column is plumbed so soft-deleting / archiving is a
 *  schema-free change later. */
export type StorylineStatus = 'active' | string

/** One anchor entity on a storyline. A storyline has 1..N anchors;
 *  the server normalises them to ascending entity id order. */
export interface StorylineAnchor {
  id: number
  canonical_name: string
}

export interface StorylineSummary {
  id: number
  user_id: number
  anchors: StorylineAnchor[]
  name: string
  description: string
  start_date: string | null
  end_date: string | null
  status: StorylineStatus
  last_generated_at: string | null
  last_extension_check_at: string | null
  created_at: string
  updated_at: string
}

export interface StorylinePanel {
  panel_kind: StorylinePanelKind
  segments: Segment[]
  source_entry_ids: number[]
  citation_count: number
  model_used: string | null
  generated_at: string | null
}

/** One chapter's summary, as returned in `StorylineDetail.chapters` and
 *  the chapter rail. Mirrors the server's `_chapter_to_dict`: a chapter is
 *  a time-windowed slice of a storyline that owns its own two panels and
 *  is generated independently. Exactly one chapter per storyline is
 *  `open` (the live, append-extended slice); the rest are `closed`. */
export interface StorylineChapterSummary {
  id: number
  storyline_id: number
  seq: number
  title: string
  start_date: string | null
  end_date: string | null
  state: 'open' | 'closed'
  last_generated_at: string | null
  /** Sum of citation_count across the chapter's panels — rail badge. */
  citation_count: number
}

/** A single chapter's detail — the summary fields plus its rendered
 *  panels. Returned by `GET /api/storylines/{id}/chapters/{cid}`. The
 *  `panels` map is keyed by panel kind so the reader can restart citation
 *  numbering per chapter. */
export interface StorylineChapterDetail extends StorylineChapterSummary {
  panels: Partial<Record<StorylinePanelKind, StorylinePanel>>
}

/** Request body for `PATCH /api/storylines/{id}/chapters/{cid}`. Renames
 *  the chapter; the server trims the title and rejects an empty result
 *  with 400. */
export interface RenameChapterRequest {
  title: string
}

export interface StorylineDetail extends StorylineSummary {
  /** Chapters in `seq` order. Migrated/legacy storylines have a single
   *  open chapter; new storylines get their first chapter on create. */
  chapters: StorylineChapterSummary[]
  /** Back-compat: the open chapter's panels, kept while the webapp
   *  migrates to the per-chapter reader. */
  panels: Partial<Record<StorylinePanelKind, StorylinePanel>>
}

export interface StorylineListResponse {
  items: StorylineSummary[]
  total: number
  limit: number
  offset: number
}

export interface StorylineListParams extends PaginationParams {
  status?: string
}

export interface CreateStorylineRequest {
  entity_ids: number[]
  name: string
  description?: string
  start_date?: string
  end_date?: string
}

/** The server's 201 response for POST /api/storylines — a subset of
 *  StorylineSummary (no last_generated_at / updated_at yet, since the
 *  storyline was just inserted). The server auto-kicks the
 *  panel-generation job on success and returns its id; the field is
 *  optional to keep older test fixtures and (in theory) downlevel
 *  server builds typecheck-compatible. */
export interface CreateStorylineResponse {
  id: number
  user_id: number
  anchors: StorylineAnchor[]
  name: string
  description: string
  status: StorylineStatus
  created_at: string
  generation_job_id?: string
}

/** Maximum number of anchor entities per storyline. Mirrors the
 *  server-side MAX_ANCHORS in `services/storylines/service.py` — the
 *  server stays the source of truth (it rejects above-cap requests
 *  with 422), but the client cap saves a round-trip. Bump on both
 *  sides when the time comes. */
export const MAX_ANCHORS = 15

/** Request body for `PUT /api/storylines/{id}/anchors`. Replaces the
 *  anchor set entirely (set semantics, not patch). The server dedupes
 *  and sorts the ids ascending, replaces the anchor rows, and returns
 *  the authoritative set — it does NOT touch the stored panels or
 *  kick a regeneration job, so the client owns the
 *  regenerate-after-edit decision (see StorylineAnchorEditor.vue). */
export interface SetStorylineAnchorsRequest {
  entity_ids: number[]
}

export interface SetStorylineAnchorsResponse {
  id: number
  anchors: StorylineAnchor[]
}

/** Request body for `PATCH /api/storylines/{id}`. Updates editable
 *  storyline metadata; currently only the `name` (title). The server
 *  trims the name, rejects an empty result with 400, and does NOT
 *  regenerate panels — a rename preserves the curated/narrative text. */
export interface UpdateStorylineRequest {
  name: string
}

/** The server's 200 response for `PATCH /api/storylines/{id}` — the
 *  updated storyline summary (panels omitted, same shape family as the
 *  create response plus `updated_at`). */
export interface UpdateStorylineResponse {
  id: number
  user_id: number
  anchors: StorylineAnchor[]
  name: string
  description: string
  status: StorylineStatus
  created_at: string
  updated_at: string
}

export interface RegenerateStorylineResponse {
  job_id: string
  status: string
}

/** Optional body for POST /api/storylines/{id}/regenerate.
 *
 * - `start_date` / `end_date`: ISO `YYYY-MM-DD`; both optional. Empty
 *   body falls back to the storyline's saved range (legacy behaviour).
 * - `mode`: `"replace"` (default) regenerates both panels from
 *   scratch; `"append"` appends new-range segments and requires
 *   `start_date >= storyline.last_generated_at` (server validates,
 *   returns 400 on violation).
 * - `resegment`: when `true`, re-carve the storyline into titled
 *   ~200-word chapters instead of just refreshing existing chapters'
 *   panels. INCOMPATIBLE with `mode="append"` (server returns 400 if
 *   combined), so the UI never sends append alongside resegment.
 * - `override_locked`: only meaningful with `resegment=true`. When
 *   `true`, also re-carve across hand-painted (locked) chapters;
 *   otherwise those are preserved. */
export interface RegenerateStorylineRequest {
  start_date?: string
  end_date?: string
  mode?: 'replace' | 'append'
  resegment?: boolean
  override_locked?: boolean
}

/** Response for chapter-edit endpoints that return one affected chapter
 *  (add, merge). */
export interface ChapterMutationResponse {
  chapter: StorylineChapterSummary
  job_ids: string[]
}

/** Response for edits that return multiple affected chapters (split,
 *  date-edit). */
export interface ChapterMultiMutationResponse {
  chapters: StorylineChapterSummary[]
  job_ids: string[]
}

export interface AddChapterRequest {
  start_date: string
  /** Omit for a new-latest open chapter; set for a ranged closed one. */
  end_date?: string
}

export interface SplitChapterRequest {
  date: string
}

export interface MergeChaptersRequest {
  chapter_ids: number[]
}

/** PATCH body for a chapter date edit (rename uses RenameChapterRequest). */
export interface UpdateChapterWindowRequest {
  start_date?: string
  end_date?: string
  allow_gap?: boolean
}

export interface DeleteChapterRequest {
  allow_gap?: boolean
}
