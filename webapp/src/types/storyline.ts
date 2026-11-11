// Storyline types. The response shapes of the `/api/storylines*` routes are
// generated from the server's API contract
// (server/src/journal/api/contract/schemas.py); request bodies, list params
// and the anchor cap stay hand-written below.
//
// - A chapter narrative is a flat `Segment[]` where text runs and citation
//   pointers interleave (`services/storylines/segments.py` on the server).
//   The webapp renders text segments as prose and citation segments as
//   footnote links to `/entries/${entry_id}`. A citation's `entry_date` is
//   absent on narratives stored before the server added it.
// - Each storyline has exactly one `draft` chapter (always last by `seq`);
//   everything else is `published` and immutable.
// - `CreateStorylineResponse.bootstrap_job_id` is null when the server could
//   not queue the bootstrap job.
import type { PaginationParams } from '@/types/entry'
import type { StorylineStatus } from './generated/api'

export type {
  Addendum,
  ChapterDetail,
  ChapterMeta,
  ChapterState,
  CitationSegment,
  CreateStorylineResponse,
  Segment,
  SetStorylineAnchorsResponse,
  StorylineAnchor,
  StorylineDeleteResponse,
  StorylineDetail,
  JobSubmissionResponse as StorylineJobResponse,
  StorylineListResponse,
  StorylineStatus,
  StorylineSummary,
  TextSegment,
} from './generated/api'

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

/** `PATCH /api/storylines/{id}` — rename and/or archive. */
export interface UpdateStorylineRequest {
  name?: string
  status?: StorylineStatus
}

/** `PATCH /api/storylines/{id}/chapters/{cid}` body. The server trims
 *  the title and rejects an empty result with 400. */
export interface RenameChapterRequest {
  title: string
}
