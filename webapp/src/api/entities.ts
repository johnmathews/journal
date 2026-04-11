import type {
  Entity,
  EntityListParams,
  EntityListResponse,
  EntityMentionsResponse,
  EntityRelationshipsResponse,
  EntryEntitiesResponse,
} from '@/types/entity'
import type { JobSubmissionResponse } from '@/types/job'
import { apiFetch } from './client'

function buildQuery(
  params: Record<string, string | number | undefined | null>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null,
  )
  if (entries.length === 0) return ''
  return (
    '?' +
    new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
  )
}

export function fetchEntities(
  params: EntityListParams = {},
): Promise<EntityListResponse> {
  const query = buildQuery({ ...params })
  return apiFetch<EntityListResponse>(`/api/entities${query}`)
}

export function fetchEntity(id: number): Promise<Entity> {
  return apiFetch<Entity>(`/api/entities/${id}`)
}

export function fetchEntityMentions(
  id: number,
  params: { limit?: number; offset?: number } = {},
): Promise<EntityMentionsResponse> {
  const query = buildQuery({ ...params })
  return apiFetch<EntityMentionsResponse>(
    `/api/entities/${id}/mentions${query}`,
  )
}

export function fetchEntityRelationships(
  id: number,
): Promise<EntityRelationshipsResponse> {
  return apiFetch<EntityRelationshipsResponse>(
    `/api/entities/${id}/relationships`,
  )
}

// Returns every entity extracted from a specific entry. Used for the
// chip strip on EntryDetailView.
export function fetchEntryEntities(
  entryId: number,
): Promise<EntryEntitiesResponse> {
  return apiFetch<EntryEntitiesResponse>(`/api/entries/${entryId}/entities`)
}

// Trigger the batch extraction job. Pass entry_id for a single entry
// or leave it undefined and optionally scope with date filters. The
// server responds 202 with a JobSubmissionResponse immediately; the
// caller should poll /api/jobs/{id} via the jobs store to follow
// progress and collect the final result.
export function triggerEntityExtraction(
  params: {
    entry_id?: number
    start_date?: string
    end_date?: string
    stale_only?: boolean
  } = {},
): Promise<JobSubmissionResponse> {
  return apiFetch<JobSubmissionResponse>('/api/entities/extract', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}
