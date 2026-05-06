import type {
  AliasLookupResponse,
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
  QuarantinedEntitiesResponse,
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

// PATCH /api/entities/{id} — when the patch changes the description,
// the server enqueues an async ``entity_reembed`` job (refreshes the
// entity's stored embedding so future recognition reflects the new
// description) and returns the job id in `reembed_job_id`. The
// webapp tracks that job through the global jobs store / toast
// pipeline. The field is omitted on PATCHes that don't change the
// description.
export type UpdateEntityResponse = Entity & { reembed_job_id?: string }

export function updateEntity(
  id: number,
  patch: EntityUpdateRequest,
): Promise<UpdateEntityResponse> {
  return apiFetch<UpdateEntityResponse>(`/api/entities/${id}`, {
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

// --- Aliases ---

// Adds an alias to an entity. Resolves with the updated Entity on
// success (server returns 201 with the full entity record). Throws
// `ApiRequestError` on failure; status 409 means the alias is
// already attached to a different entity, in which case the caller
// can read `error.body` for `existing_entity_id`,
// `existing_canonical_name`, and `existing_entity_type` to offer a
// merge.
export function addEntityAlias(
  entityId: number,
  alias: string,
): Promise<Entity> {
  return apiFetch<Entity>(`/api/entities/${entityId}/aliases`, {
    method: 'POST',
    body: JSON.stringify({ alias }),
  })
}

export function removeEntityAlias(
  entityId: number,
  alias: string,
): Promise<Entity> {
  // Server stores the alias in lowercased / whitespace-stripped form;
  // we encode the user-supplied string and let the server normalize.
  return apiFetch<Entity>(
    `/api/entities/${entityId}/aliases/${encodeURIComponent(alias)}`,
    { method: 'DELETE' },
  )
}

// Inline collision check before submit. Returns `{ entity_id: null }`
// when the alias is unowned for this user. Type-agnostic — useful
// for the webapp to warn before letting the user attach the alias.
export function lookupAliasOwner(alias: string): Promise<AliasLookupResponse> {
  return apiFetch<AliasLookupResponse>(
    `/api/entities/aliases/lookup?alias=${encodeURIComponent(alias)}`,
  )
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

// --- Quarantine ---

// Returns every entity the authed user has flagged as quarantined.
// The dedicated endpoint exists because GET /api/entities filters
// quarantined entities out by default (and does not accept an
// include_quarantined query param). Each item is shaped as a full
// entity record with is_quarantined / quarantine_reason /
// quarantined_at populated.
export function fetchQuarantinedEntities(): Promise<QuarantinedEntitiesResponse> {
  return apiFetch<QuarantinedEntitiesResponse>('/api/entities/quarantined')
}

export function quarantineEntity(id: number, reason: string): Promise<Entity> {
  return apiFetch<Entity>(`/api/entities/${id}/quarantine`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function releaseQuarantine(id: number): Promise<Entity> {
  return apiFetch<Entity>(`/api/entities/${id}/release-quarantine`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
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
