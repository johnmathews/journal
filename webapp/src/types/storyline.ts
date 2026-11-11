import type { PaginationParams } from '@/types/entry'

/** One unit of a chapter narrative's rendered content.
 *
 * The wire shape mirrors `services/storylines/segments.py` on the
 * server: a narrative is a flat `Segment[]` where text runs and
 * citation pointers interleave. The webapp renders text segments as
 * prose and citation segments as footnote links to
 * `/entries/${entry_id}` with the cited quote.
 */
export type Segment =
  | { kind: 'text'; text: string }
  | {
      kind: 'citation'
      entry_id: number
      quote: string
      /** ISO YYYY-MM-DD date of the cited entry. Optional because
       *  narratives stored before the server added this field still
       *  deserialise — UIs that depend on it must handle absence. */
      entry_date?: string
    }

/** Server-returned status for a storyline. */
export type StorylineStatus = 'active' | 'archived'

/** Chapter lifecycle state: exactly one `draft` per storyline (always
 *  last by `seq`); everything else is `published` and immutable. */
export type ChapterState = 'draft' | 'published'

/** One anchor entity on a storyline. A storyline has 1..15 anchors;
 *  the server normalises them to ascending entity id order. */
export interface StorylineAnchor {
  entity_id: number
  canonical_name: string
}

/** Storyline summary as returned by the list and detail endpoints. */
export interface StorylineSummary {
  id: number
  name: string
  description: string
  status: StorylineStatus
  anchors: StorylineAnchor[]
  /** Published chapters not yet read — drives the list/sidebar badges. */
  unread_count: number
  chapter_count: number
  updated_at: string
  created_at: string
}

/** Chapter metadata, as returned in `StorylineDetail.chapters` and by
 *  the read/rename mutations. Date range and entry count are derived
 *  from the chapter's entry membership on the server — chapters no
 *  longer have their own date windows. */
export interface ChapterMeta {
  id: number
  seq: number
  title: string
  state: ChapterState
  entry_count: number
  first_entry_date: string | null
  last_entry_date: string | null
  /** NULL while the chapter is the draft. */
  published_at: string | null
  /** NULL = unread. Only meaningful once published. */
  read_at: string | null
  citation_count: number
}

/** A later-discovered addition to a published chapter. The original
 *  narrative is never edited; addenda render as separate blocks. */
export interface Addendum {
  added_at: string
  segments: Segment[]
  entry_ids: number[]
}

/** Full chapter content — `GET /api/storylines/{id}/chapters/{cid}`. */
export interface ChapterDetail extends ChapterMeta {
  segments: Segment[]
  addenda: Addendum[]
  model_used: string
  generated_at: string | null
}

/** `GET /api/storylines/{id}` — summary plus chapter metadata in `seq`
 *  order (the draft is naturally last). */
export interface StorylineDetail extends StorylineSummary {
  chapters: ChapterMeta[]
}

export interface StorylineListResponse {
  items: StorylineSummary[]
  total: number
  limit: number
  offset: number
}

export interface StorylineListParams extends PaginationParams {
  status?: string
  /** Whole-dataset search over name + description, filtered in SQL on
   *  the server. Absent = unfiltered. */
  search?: string
}

export interface CreateStorylineRequest {
  entity_ids: number[]
  name: string
  description?: string
}

/** 201 response for POST /api/storylines. The server seeds the draft
 *  chapter and queues a bootstrap job that partitions any existing
 *  history into chapters. `bootstrap_job_id` is null when the
 *  generation engine isn't wired on the server. */
export interface CreateStorylineResponse {
  storyline: StorylineDetail
  bootstrap_job_id: string | null
}

/** Maximum number of anchor entities per storyline. Mirrors the
 *  server-side MAX_ANCHORS in `api/storylines_write.py` — the server
 *  stays the source of truth (it rejects above-cap requests with 422),
 *  but the client cap saves a round-trip. */
export const MAX_ANCHORS = 15

/** `PUT /api/storylines/{id}/anchors` — replaces the anchor set
 *  entirely (set semantics). Does not regenerate the draft; the client
 *  owns the refresh-after-edit decision. */
export interface SetStorylineAnchorsRequest {
  entity_ids: number[]
}

export interface SetStorylineAnchorsResponse {
  id: number
  anchors: StorylineAnchor[]
}

/** `PATCH /api/storylines/{id}` — rename and/or archive. */
export interface UpdateStorylineRequest {
  name?: string
  status?: StorylineStatus
}

/** 202 response for the job-queueing routes (refresh, unpublish). */
export interface StorylineJobResponse {
  job_id: string
  status: string
}

/** `PATCH /api/storylines/{id}/chapters/{cid}` body. The server trims
 *  the title and rejects an empty result with 400. */
export interface RenameChapterRequest {
  title: string
}
