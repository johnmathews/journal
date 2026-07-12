import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createStoryline,
  deleteStoryline,
  fetchChapter,
  fetchStoryline,
  fetchStorylines,
  markChapterRead,
  markChapterUnread,
  refreshStoryline,
  renameChapter,
  setStorylineAnchors,
  unpublishNewest,
  updateStoryline,
} from '../storylines'

vi.mock('../client', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '../client'
const mockApiFetch = vi.mocked(apiFetch)

describe('storylines API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchStorylines calls /api/storylines with no params', async () => {
    mockApiFetch.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    })
    await fetchStorylines()
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines')
  })

  it('fetchStorylines encodes limit/offset/status into the query string', async () => {
    mockApiFetch.mockResolvedValue({
      items: [],
      total: 0,
      limit: 10,
      offset: 30,
    })
    await fetchStorylines({ limit: 10, offset: 30, status: 'active' })
    const url = mockApiFetch.mock.calls[0][0] as string
    expect(url).toMatch(/^\/api\/storylines\?/)
    expect(url).toContain('limit=10')
    expect(url).toContain('offset=30')
    expect(url).toContain('status=active')
  })

  it('fetchStorylines skips undefined params', async () => {
    mockApiFetch.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    })
    await fetchStorylines({ limit: 5, status: undefined })
    const url = mockApiFetch.mock.calls[0][0] as string
    expect(url).toContain('limit=5')
    expect(url).not.toContain('status=')
  })

  it('fetchStoryline calls /api/storylines/{id}', async () => {
    mockApiFetch.mockResolvedValue({ id: 7, name: 'Running', chapters: [] })
    const result = await fetchStoryline(7)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines/7')
    expect(result).toEqual({ id: 7, name: 'Running', chapters: [] })
  })

  it('fetchChapter calls /api/storylines/{id}/chapters/{cid}', async () => {
    mockApiFetch.mockResolvedValue({ id: 9, segments: [], addenda: [] })
    const result = await fetchChapter(3, 9)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines/3/chapters/9')
    expect(result.id).toBe(9)
  })

  it('createStoryline POSTs the request body', async () => {
    mockApiFetch.mockResolvedValue({
      storyline: { id: 12, name: 'Atlas', chapters: [] },
      bootstrap_job_id: 'job-1',
    })
    const result = await createStoryline({
      entity_ids: [511],
      name: 'Atlas',
      description: '',
    })
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines', {
      method: 'POST',
      body: JSON.stringify({
        entity_ids: [511],
        name: 'Atlas',
        description: '',
      }),
    })
    expect(result.bootstrap_job_id).toBe('job-1')
  })

  it('refreshStoryline POSTs to /refresh and returns a job id', async () => {
    mockApiFetch.mockResolvedValue({ job_id: 'job-42', status: 'queued' })
    const result = await refreshStoryline(3)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines/3/refresh', {
      method: 'POST',
    })
    expect(result).toEqual({ job_id: 'job-42', status: 'queued' })
  })

  it('unpublishNewest POSTs to /chapters/unpublish', async () => {
    mockApiFetch.mockResolvedValue({ job_id: 'job-77', status: 'queued' })
    const result = await unpublishNewest(4)
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/storylines/4/chapters/unpublish',
      { method: 'POST' },
    )
    expect(result.job_id).toBe('job-77')
  })

  it('markChapterRead POSTs to /chapters/{cid}/read', async () => {
    mockApiFetch.mockResolvedValue({ id: 9, read_at: '2026-07-12T10:00:00Z' })
    const result = await markChapterRead(3, 9)
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/storylines/3/chapters/9/read',
      { method: 'POST' },
    )
    expect(result.read_at).toBe('2026-07-12T10:00:00Z')
  })

  it('markChapterUnread POSTs to /chapters/{cid}/unread', async () => {
    mockApiFetch.mockResolvedValue({ id: 9, read_at: null })
    const result = await markChapterUnread(3, 9)
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/storylines/3/chapters/9/unread',
      { method: 'POST' },
    )
    expect(result.read_at).toBeNull()
  })

  it('renameChapter PATCHes the title', async () => {
    mockApiFetch.mockResolvedValue({ id: 9, title: 'The Comeback' })
    const result = await renameChapter(3, 9, { title: 'The Comeback' })
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines/3/chapters/9', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'The Comeback' }),
    })
    expect(result.title).toBe('The Comeback')
  })

  it('deleteStoryline DELETEs /api/storylines/{id}', async () => {
    mockApiFetch.mockResolvedValue({ deleted: true })
    const result = await deleteStoryline(9)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines/9', {
      method: 'DELETE',
    })
    expect(result).toEqual({ deleted: true })
  })

  it('setStorylineAnchors PUTs entity_ids to /api/storylines/{id}/anchors', async () => {
    mockApiFetch.mockResolvedValue({
      id: 4,
      anchors: [{ entity_id: 100, canonical_name: 'Running' }],
    })
    const result = await setStorylineAnchors(4, { entity_ids: [100] })
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines/4/anchors', {
      method: 'PUT',
      body: JSON.stringify({ entity_ids: [100] }),
    })
    expect(result.anchors).toEqual([
      { entity_id: 100, canonical_name: 'Running' },
    ])
  })

  it('updateStoryline PATCHes the name to /api/storylines/{id}', async () => {
    mockApiFetch.mockResolvedValue({
      id: 7,
      anchors: [{ entity_id: 100, canonical_name: 'Running' }],
      name: 'New title',
      description: '',
      status: 'active',
      unread_count: 0,
      chapter_count: 1,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-11T00:00:00Z',
    })
    const result = await updateStoryline(7, { name: 'New title' })
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines/7', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New title' }),
    })
    expect(result.name).toBe('New title')
  })
})
