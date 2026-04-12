import type {
  Entity,
  EntityDeleteResponse,
  EntityListParams,
  EntityListResponse,
  EntityMentionsResponse,
  EntityMergeRequest,
  EntityMergeResponse,
  EntityRelationshipsResponse,
  EntityUpdateRequest,
  EntryEntitiesResponse,
  MergeCandidatesResponse,
  MergeHistoryResponse,
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

// --- Entity management ---

export function updateEntity(
  id: number,
  patch: EntityUpdateRequest,
): Promise<Entity> {
  return apiFetch<Entity>(`/api/entities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteEntity(id: number): Promise<EntityDeleteResponse> {
  return apiFetch<EntityDeleteResponse>(`/api/entities/${id}`, {
    method: 'DELETE',
  })
}

export function mergeEntities(
  request: EntityMergeRequest,
): Promise<EntityMergeResponse> {
  return apiFetch<EntityMergeResponse>('/api/entities/merge', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

// --- Merge candidates ---

export function fetchMergeCandidates(
  status: string = 'pending',
  limit: number = 50,
): Promise<MergeCandidatesResponse> {
  const query = buildQuery({ status, limit })
  return apiFetch<MergeCandidatesResponse>(
    `/api/entities/merge-candidates${query}`,
  )
}

export function resolveMergeCandidate(
  candidateId: number,
  status: 'accepted' | 'dismissed',
): Promise<{ id: number; status: string }> {
  return apiFetch(`/api/entities/merge-candidates/${candidateId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function fetchMergeHistory(
  entityId: number,
): Promise<MergeHistoryResponse> {
  return apiFetch<MergeHistoryResponse>(
    `/api/entities/${entityId}/merge-history`,
  )
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
