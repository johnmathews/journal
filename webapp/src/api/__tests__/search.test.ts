import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchEntries } from '../search'

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

describe('search API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the expected URL with every param set', async () => {
    mockApiFetch.mockResolvedValue({
      query: 'vienna',
      reranker: 'AnthropicReranker',
      limit: 20,
      offset: 0,
      items: [],
    })

    await searchEntries({
      q: 'vienna',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      limit: 20,
      offset: 10,
    })

    expect(mockApiFetch).toHaveBeenCalledTimes(1)
    const url = mockApiFetch.mock.calls[0][0] as string
    expect(url.startsWith('/api/search?')).toBe(true)
    expect(url).toContain('q=vienna')
    // The retired `mode` param must not appear in the request URL.
    expect(url).not.toContain('mode=')
    expect(url).toContain('start_date=2026-01-01')
    expect(url).toContain('end_date=2026-12-31')
    expect(url).toContain('limit=20')
    expect(url).toContain('offset=10')
  })

  it('drops undefined and empty params from the URL', async () => {
    mockApiFetch.mockResolvedValue({
      query: 'atlas',
      reranker: 'AnthropicReranker',
      limit: 10,
      offset: 0,
      items: [],
    })

    await searchEntries({
      q: 'atlas',
      start_date: '',
      end_date: undefined,
    })

    const url = mockApiFetch.mock.calls[0][0] as string
    expect(url).toContain('q=atlas')
    expect(url).not.toContain('start_date')
    expect(url).not.toContain('end_date')
  })

  it('sends URL without query string when all params are empty', async () => {
    mockApiFetch.mockResolvedValue({
      query: '',
      reranker: 'AnthropicReranker',
      limit: 10,
      offset: 0,
      items: [],
    })

    await searchEntries({
      q: '',
      start_date: undefined,
      end_date: undefined,
    })

    const url = mockApiFetch.mock.calls[0][0] as string
    expect(url).toBe('/api/search')
    expect(url).not.toContain('?')
  })

  it('returns the response body unchanged', async () => {
    const payload = {
      query: 'vienna',
      reranker: 'AnthropicReranker',
      limit: 10,
      offset: 0,
      items: [
        {
          entry_id: 1,
          entry_date: '2026-03-22',
          text: 'Vienna trip',
          score: 1.0,
          snippet: '\x02Vienna\x03 trip',
          matching_chunks: [],
        },
      ],
    }
    mockApiFetch.mockResolvedValue(payload)

    const result = await searchEntries({ q: 'vienna' })
    expect(result).toEqual(payload)
  })
})
