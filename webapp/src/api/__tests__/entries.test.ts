import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchEntries,
  fetchEntry,
  updateEntryText,
  fetchStats,
} from '../entries'

vi.mock('../client', () => ({
  apiFetch: vi.fn(),
  ApiRequestError: class extends Error {
    constructor(
      public status: number,
      public errorCode: string,
      message: string,
    ) {
      super(message)
    }
  },
}))

import { apiFetch } from '../client'
const mockApiFetch = vi.mocked(apiFetch)

describe('entries API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchEntries calls correct endpoint with params', async () => {
    mockApiFetch.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    })
    await fetchEntries({ limit: 10, offset: 20, start_date: '2026-01-01' })
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/entries?'),
    )
    const url = mockApiFetch.mock.calls[0][0]
    expect(url).toContain('limit=10')
    expect(url).toContain('offset=20')
    expect(url).toContain('start_date=2026-01-01')
  })

  it('fetchEntries with no params calls base endpoint', async () => {
    mockApiFetch.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    })
    await fetchEntries()
    expect(mockApiFetch).toHaveBeenCalledWith('/api/entries')
  })

  it('fetchEntry calls correct endpoint', async () => {
    const entry = {
      id: 1,
      entry_date: '2026-01-01',
      raw_text: 'text',
      final_text: 'text',
    }
    mockApiFetch.mockResolvedValue(entry)
    const result = await fetchEntry(1)
    expect(mockApiFetch).toHaveBeenCalledWith('/api/entries/1')
    expect(result).toEqual(entry)
  })

  it('updateEntryText sends PATCH with body', async () => {
    const updated = { id: 1, final_text: 'corrected' }
    mockApiFetch.mockResolvedValue(updated)
    await updateEntryText(1, 'corrected')
    expect(mockApiFetch).toHaveBeenCalledWith('/api/entries/1', {
      method: 'PATCH',
      body: JSON.stringify({ final_text: 'corrected' }),
    })
  })

  it('fetchStats calls correct endpoint', async () => {
    mockApiFetch.mockResolvedValue({ total_entries: 10 })
    await fetchStats({ start_date: '2026-01-01' })
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/stats?'),
    )
  })
})
