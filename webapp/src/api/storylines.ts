import type {
  CreateStorylineRequest,
  CreateStorylineResponse,
  RegenerateStorylineResponse,
  StorylineDetail,
  StorylineListParams,
  StorylineListResponse,
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
): Promise<RegenerateStorylineResponse> {
  return apiFetch<RegenerateStorylineResponse>(
    `/api/storylines/${id}/regenerate`,
    { method: 'POST' },
  )
}

export function deleteStoryline(id: number): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/storylines/${id}`, {
    method: 'DELETE',
  })
}
