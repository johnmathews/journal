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

export interface StorylineSummary {
  id: number
  user_id: number
  entity_id: number
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

export interface StorylineDetail extends StorylineSummary {
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
  entity_id: number
  name: string
  description?: string
  start_date?: string
  end_date?: string
}

/** The server's 201 response for POST /api/storylines — a subset of
 *  StorylineSummary (no last_generated_at / updated_at yet, since the
 *  storyline was just inserted). */
export interface CreateStorylineResponse {
  id: number
  user_id: number
  entity_id: number
  name: string
  description: string
  status: StorylineStatus
  created_at: string
}

export interface RegenerateStorylineResponse {
  job_id: string
  status: string
}
