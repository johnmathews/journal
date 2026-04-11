import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchWritingStats } from '../dashboard'

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

describe('dashboard API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the expected URL with every param set', async () => {
    mockApiFetch.mockResolvedValue({
      from: '2026-01-01',
      to: '2026-04-11',
      bin: 'month',
      bins: [],
    })

    await fetchWritingStats({
      bin: 'month',
      from: '2026-01-01',
      to: '2026-04-11',
    })

    expect(mockApiFetch).toHaveBeenCalledTimes(1)
    const url = mockApiFetch.mock.calls[0][0] as string
    expect(url.startsWith('/api/dashboard/writing-stats?')).toBe(true)
    expect(url).toContain('bin=month')
    expect(url).toContain('from=2026-01-01')
    expect(url).toContain('to=2026-04-11')
  })

  it('calls the base endpoint with no params when none are supplied', async () => {
    mockApiFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    await fetchWritingStats()
    expect(mockApiFetch).toHaveBeenCalledWith('/api/dashboard/writing-stats')
  })

  it('drops null/empty params from the URL', async () => {
    mockApiFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    await fetchWritingStats({ bin: 'week', from: null, to: '' })
    const url = mockApiFetch.mock.calls[0][0] as string
    expect(url).toContain('bin=week')
    expect(url).not.toContain('from=')
    expect(url).not.toContain('to=')
  })

  it('returns the response body unchanged', async () => {
    const payload = {
      from: '2026-01-01',
      to: '2026-04-11',
      bin: 'month' as const,
      bins: [
        {
          bin_start: '2026-01-01',
          entry_count: 5,
          total_words: 1200,
        },
      ],
    }
    mockApiFetch.mockResolvedValue(payload)
    const result = await fetchWritingStats({ bin: 'month' })
    expect(result).toEqual(payload)
  })
})
