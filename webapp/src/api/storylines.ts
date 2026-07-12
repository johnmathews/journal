import type {
  ChapterDetail,
  ChapterMeta,
  CreateStorylineRequest,
  CreateStorylineResponse,
  RenameChapterRequest,
  SetStorylineAnchorsRequest,
  SetStorylineAnchorsResponse,
  StorylineDetail,
  StorylineJobResponse,
  StorylineListParams,
  StorylineListResponse,
  StorylineSummary,
  UpdateStorylineRequest,
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

export function fetchChapter(
  storylineId: number,
  chapterId: number,
): Promise<ChapterDetail> {
  return apiFetch<ChapterDetail>(
    `/api/storylines/${storylineId}/chapters/${chapterId}`,
  )
}

export function createStoryline(
  request: CreateStorylineRequest,
): Promise<CreateStorylineResponse> {
  return apiFetch<CreateStorylineResponse>('/api/storylines', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function updateStoryline(
  id: number,
  request: UpdateStorylineRequest,
): Promise<StorylineSummary> {
  return apiFetch<StorylineSummary>(`/api/storylines/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(request),
  })
}

export function deleteStoryline(id: number): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/storylines/${id}`, {
    method: 'DELETE',
  })
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

/** Re-narrate the draft chapter from its current entries (202 + job). */
export function refreshStoryline(id: number): Promise<StorylineJobResponse> {
  return apiFetch<StorylineJobResponse>(`/api/storylines/${id}/refresh`, {
    method: 'POST',
  })
}

/** Fold the newest published chapter back into the draft (202 + job). */
export function unpublishNewest(id: number): Promise<StorylineJobResponse> {
  return apiFetch<StorylineJobResponse>(
    `/api/storylines/${id}/chapters/unpublish`,
    { method: 'POST' },
  )
}

export function markChapterRead(
  storylineId: number,
  chapterId: number,
): Promise<ChapterMeta> {
  return apiFetch<ChapterMeta>(
    `/api/storylines/${storylineId}/chapters/${chapterId}/read`,
    { method: 'POST' },
  )
}

export function markChapterUnread(
  storylineId: number,
  chapterId: number,
): Promise<ChapterMeta> {
  return apiFetch<ChapterMeta>(
    `/api/storylines/${storylineId}/chapters/${chapterId}/unread`,
    { method: 'POST' },
  )
}

export function renameChapter(
  storylineId: number,
  chapterId: number,
  request: RenameChapterRequest,
): Promise<ChapterMeta> {
  return apiFetch<ChapterMeta>(
    `/api/storylines/${storylineId}/chapters/${chapterId}`,
    { method: 'PATCH', body: JSON.stringify(request) },
  )
}
