import type {
  CreateStorylineRequest,
  CreateStorylineResponse,
  RegenerateStorylineRequest,
  RegenerateStorylineResponse,
  RenameChapterRequest,
  SetStorylineAnchorsRequest,
  SetStorylineAnchorsResponse,
  StorylineChapterDetail,
  StorylineChapterSummary,
  StorylineDetail,
  StorylineListParams,
  StorylineListResponse,
  UpdateStorylineRequest,
  UpdateStorylineResponse,
} from '@/types/storyline'
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

export function fetchStorylines(
  params: StorylineListParams = {},
): Promise<StorylineListResponse> {
  const query = buildQuery({ ...params })
  return apiFetch<StorylineListResponse>(`/api/storylines${query}`)
}

export function fetchStoryline(id: number): Promise<StorylineDetail> {
  return apiFetch<StorylineDetail>(`/api/storylines/${id}`)
}

export function createStoryline(
  request: CreateStorylineRequest,
): Promise<CreateStorylineResponse> {
  return apiFetch<CreateStorylineResponse>('/api/storylines', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function regenerateStoryline(
  id: number,
  body?: RegenerateStorylineRequest,
): Promise<RegenerateStorylineResponse> {
  // Empty / undefined body keeps the legacy "replace using the
  // storyline's saved range" behaviour. Any field set on `body` —
  // start_date, end_date, or mode — is forwarded; the server treats
  // missing fields as "use default".
  const hasBody = body && Object.values(body).some((v) => v !== undefined)
  return apiFetch<RegenerateStorylineResponse>(
    `/api/storylines/${id}/regenerate`,
    hasBody
      ? { method: 'POST', body: JSON.stringify(body) }
      : { method: 'POST' },
  )
}

export function updateStoryline(
  id: number,
  request: UpdateStorylineRequest,
): Promise<UpdateStorylineResponse> {
  return apiFetch<UpdateStorylineResponse>(`/api/storylines/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(request),
  })
}

export function deleteStoryline(id: number): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/storylines/${id}`, {
    method: 'DELETE',
  })
}

export function fetchStorylineChapter(
  storylineId: number,
  chapterId: number,
): Promise<StorylineChapterDetail> {
  return apiFetch<StorylineChapterDetail>(
    `/api/storylines/${storylineId}/chapters/${chapterId}`,
  )
}

export function regenerateStorylineChapter(
  storylineId: number,
  chapterId: number,
): Promise<RegenerateStorylineResponse> {
  return apiFetch<RegenerateStorylineResponse>(
    `/api/storylines/${storylineId}/chapters/${chapterId}/regenerate`,
    { method: 'POST' },
  )
}

export function renameStorylineChapter(
  storylineId: number,
  chapterId: number,
  request: RenameChapterRequest,
): Promise<StorylineChapterSummary> {
  return apiFetch<StorylineChapterSummary>(
    `/api/storylines/${storylineId}/chapters/${chapterId}`,
    { method: 'PATCH', body: JSON.stringify(request) },
  )
}

export function setStorylineAnchors(
  id: number,
  request: SetStorylineAnchorsRequest,
): Promise<SetStorylineAnchorsResponse> {
  return apiFetch<SetStorylineAnchorsResponse>(
    `/api/storylines/${id}/anchors`,
    {
      method: 'PUT',
      body: JSON.stringify(request),
    },
  )
}
