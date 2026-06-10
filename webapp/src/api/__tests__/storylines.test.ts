import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createStoryline,
  deleteStoryline,
  fetchStoryline,
  fetchStorylines,
  regenerateStoryline,
  setStorylineAnchors,
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
    mockApiFetch.mockResolvedValue({ id: 7, name: 'Running', panels: {} })
    const result = await fetchStoryline(7)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines/7')
    expect(result).toEqual({ id: 7, name: 'Running', panels: {} })
  })

  it('createStoryline POSTs the request body', async () => {
    mockApiFetch.mockResolvedValue({ id: 12, name: 'Atlas' })
    await createStoryline({
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
  })

  it('regenerateStoryline POSTs to /regenerate and returns a job id', async () => {
    mockApiFetch.mockResolvedValue({ job_id: 'job-42', status: 'queued' })
    const result = await regenerateStoryline(3)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines/3/regenerate', {
      method: 'POST',
    })
    expect(result).toEqual({ job_id: 'job-42', status: 'queued' })
  })

  it('regenerateStoryline forwards an optional body when fields are set', async () => {
    mockApiFetch.mockResolvedValue({ job_id: 'job-43', status: 'queued' })
    await regenerateStoryline(5, {
      start_date: '2026-04-01',
      end_date: '2026-05-01',
      mode: 'append',
    })
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines/5/regenerate', {
      method: 'POST',
      body: JSON.stringify({
        start_date: '2026-04-01',
        end_date: '2026-05-01',
        mode: 'append',
      }),
    })
  })

  it('regenerateStoryline omits the body when all fields are undefined', async () => {
    mockApiFetch.mockResolvedValue({ job_id: 'job-44', status: 'queued' })
    await regenerateStoryline(6, {
      start_date: undefined,
      end_date: undefined,
      mode: undefined,
    })
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines/6/regenerate', {
      method: 'POST',
    })
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
      anchors: [{ id: 100, canonical_name: 'Running' }],
    })
    const result = await setStorylineAnchors(4, { entity_ids: [100] })
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines/4/anchors', {
      method: 'PUT',
      body: JSON.stringify({ entity_ids: [100] }),
    })
    expect(result.anchors).toEqual([{ id: 100, canonical_name: 'Running' }])
  })
})
