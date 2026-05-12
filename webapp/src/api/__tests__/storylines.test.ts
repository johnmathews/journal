import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createStoryline,
  deleteStoryline,
  fetchStoryline,
  fetchStorylines,
  regenerateStoryline,
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
    await createStoryline({ entity_id: 511, name: 'Atlas', description: '' })
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: 511,
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

  it('deleteStoryline DELETEs /api/storylines/{id}', async () => {
    mockApiFetch.mockResolvedValue({ deleted: true })
    const result = await deleteStoryline(9)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/storylines/9', {
      method: 'DELETE',
    })
    expect(result).toEqual({ deleted: true })
  })
})
