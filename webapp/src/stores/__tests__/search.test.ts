import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSearchStore } from '../search'

vi.mock('@/api/search', () => ({
  searchEntries: vi.fn(),
}))
vi.mock('@/api/client', () => ({
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

import { searchEntries } from '@/api/search'
import { ApiRequestError } from '@/api/client'
const mockSearch = vi.mocked(searchEntries)

function fakeResponse(
  overrides: Partial<{
    query: string
    reranker: string
    items: Array<{
      entry_id: number
      entry_date: string
      text: string
      score: number
      snippet: string | null
      matching_chunks: Array<{
        text: string
        score: number
        chunk_index: number | null
        char_start: number | null
        char_end: number | null
      }>
    }>
  }> = {},
) {
  return {
    query: overrides.query ?? 'vienna',
    reranker: overrides.reranker ?? 'AnthropicReranker',
    limit: 20,
    offset: 0,
    sort: 'relevance' as const,
    items: overrides.items ?? [],
  }
}

describe('useSearchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initial state is empty', () => {
    const store = useSearchStore()
    expect(store.query).toBe('')
    expect(store.items).toEqual([])
    expect(store.hasRun).toBe(false)
    expect(store.hasResults).toBe(false)
  })

  it('runSearch with empty query clears results and does not fetch', async () => {
    const store = useSearchStore()
    store.query = '   '
    await store.runSearch()

    expect(mockSearch).not.toHaveBeenCalled()
    expect(store.items).toEqual([])
    expect(store.hasRun).toBe(false)
  })

  it('runSearch populates items on success', async () => {
    mockSearch.mockResolvedValue(
      fakeResponse({
        items: [
          {
            entry_id: 42,
            entry_date: '2026-03-22',
            text: 'Vienna trip',
            score: 0.9,
            snippet: null,
            matching_chunks: [
              {
                text: 'Vienna trip',
                score: 0.9,
                chunk_index: 0,
                char_start: 0,
                char_end: 11,
              },
            ],
          },
        ],
      }),
    )

    const store = useSearchStore()
    store.query = 'vienna'
    await store.runSearch()

    expect(mockSearch).toHaveBeenCalledTimes(1)
    expect(store.items).toHaveLength(1)
    expect(store.items[0].entry_id).toBe(42)
    expect(store.hasRun).toBe(true)
    expect(store.hasResults).toBe(true)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('runSearch accepts partial overrides and calls the API with them', async () => {
    mockSearch.mockResolvedValue(fakeResponse({ query: 'atlas' }))

    const store = useSearchStore()
    await store.runSearch({
      q: 'atlas',
      start_date: '2026-03-01',
      end_date: '2026-03-31',
      limit: 10,
      offset: 20,
    })

    expect(store.query).toBe('atlas')
    expect(store.startDate).toBe('2026-03-01')
    expect(store.endDate).toBe('2026-03-31')
    expect(store.limit).toBe(10)
    expect(store.offset).toBe(20)

    expect(mockSearch).toHaveBeenCalledWith({
      q: 'atlas',
      limit: 10,
      offset: 20,
      start_date: '2026-03-01',
      end_date: '2026-03-31',
    })
  })

  it('runSearch omits null date filters from the API call', async () => {
    mockSearch.mockResolvedValue(fakeResponse())

    const store = useSearchStore()
    await store.runSearch({ q: 'vienna' })

    const call = mockSearch.mock.calls[0][0]
    expect(call).not.toHaveProperty('start_date')
    expect(call).not.toHaveProperty('end_date')
  })

  it('runSearch surfaces the server message from ApiRequestError', async () => {
    mockSearch.mockRejectedValue(
      new ApiRequestError(400, 'invalid_query', 'Query could not be parsed'),
    )

    const store = useSearchStore()
    await store.runSearch({ q: '"' })

    expect(store.error).toBe('Query could not be parsed')
    expect(store.items).toEqual([])
    expect(store.loading).toBe(false)
  })

  it('runSearch surfaces a plain Error message', async () => {
    mockSearch.mockRejectedValue(new Error('network down'))

    const store = useSearchStore()
    await store.runSearch({ q: 'vienna' })

    expect(store.error).toBe('network down')
  })

  it('runSearch falls back to a generic message on a non-Error throw', async () => {
    mockSearch.mockRejectedValue('kaboom')

    const store = useSearchStore()
    await store.runSearch({ q: 'vienna' })

    expect(store.error).toBe('Search failed')
  })

  it('runSearch omits sort param when relevance (server default)', async () => {
    mockSearch.mockResolvedValue(fakeResponse())

    const store = useSearchStore()
    await store.runSearch({ q: 'vienna' })

    const call = mockSearch.mock.calls[0][0]
    expect(call).not.toHaveProperty('sort')
    expect(store.sort).toBe('relevance')
  })

  it('runSearch sends sort param when set to a non-default', async () => {
    mockSearch.mockResolvedValue(fakeResponse())

    const store = useSearchStore()
    await store.runSearch({ q: 'vienna', sort: 'date_desc' })

    expect(store.sort).toBe('date_desc')
    expect(mockSearch.mock.calls[0][0]).toMatchObject({ sort: 'date_desc' })
  })

  it('runSearch keeps the previously chosen sort across pagination', async () => {
    mockSearch.mockResolvedValue(fakeResponse())

    const store = useSearchStore()
    await store.runSearch({ q: 'vienna', sort: 'date_asc' })
    mockSearch.mockClear()

    await store.runSearch({ offset: 20 })

    expect(store.sort).toBe('date_asc')
    expect(mockSearch.mock.calls[0][0]).toMatchObject({
      sort: 'date_asc',
      offset: 20,
    })
  })

  it('reset clears the sort back to relevance', async () => {
    const store = useSearchStore()
    store.sort = 'date_desc'
    store.reset()
    expect(store.sort).toBe('relevance')
  })

  it('reset restores the initial state', async () => {
    mockSearch.mockResolvedValue(
      fakeResponse({
        items: [
          {
            entry_id: 1,
            entry_date: '2026-03-01',
            text: 'x',
            score: 1,
            snippet: null,
            matching_chunks: [],
          },
        ],
      }),
    )

    const store = useSearchStore()
    await store.runSearch({ q: 'vienna' })
    expect(store.hasResults).toBe(true)

    store.reset()
    expect(store.query).toBe('')
    expect(store.items).toEqual([])
    expect(store.hasRun).toBe(false)
  })
})
