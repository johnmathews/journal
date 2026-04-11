import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDashboardStore, rangeToDates } from '../dashboard'

vi.mock('@/api/dashboard', () => ({
  fetchWritingStats: vi.fn(),
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

import { fetchWritingStats } from '@/api/dashboard'
import { ApiRequestError } from '@/api/client'
const mockFetch = vi.mocked(fetchWritingStats)

describe('rangeToDates', () => {
  const now = new Date('2026-04-11T12:00:00Z')

  it('returns null for both ends on "all"', () => {
    expect(rangeToDates('all', now)).toEqual({ from: null, to: null })
  })

  it('subtracts one month for last_1_month', () => {
    const { from, to } = rangeToDates('last_1_month', now)
    expect(to).toBe('2026-04-11')
    expect(from).toBe('2026-03-11')
  })

  it('subtracts three months for last_3_months', () => {
    const { from } = rangeToDates('last_3_months', now)
    expect(from).toBe('2026-01-11')
  })

  it('subtracts six months for last_6_months', () => {
    const { from } = rangeToDates('last_6_months', now)
    expect(from).toBe('2025-10-11')
  })

  it('subtracts one year for last_1_year', () => {
    const { from } = rangeToDates('last_1_year', now)
    expect(from).toBe('2025-04-11')
  })
})

describe('useDashboardStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initial state is last_3_months + week, nothing loaded', () => {
    const store = useDashboardStore()
    expect(store.range).toBe('last_3_months')
    expect(store.bin).toBe('week')
    expect(store.bins).toEqual([])
    expect(store.hasLoaded).toBe(false)
    expect(store.loading).toBe(false)
  })

  it('loadWritingStats populates bins and marks hasLoaded', async () => {
    mockFetch.mockResolvedValue({
      from: '2026-01-11',
      to: '2026-04-11',
      bin: 'week',
      bins: [
        { bin_start: '2026-03-02', entry_count: 3, total_words: 420 },
        { bin_start: '2026-03-09', entry_count: 5, total_words: 910 },
      ],
    })

    const store = useDashboardStore()
    await store.loadWritingStats()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(store.bins).toHaveLength(2)
    expect(store.hasLoaded).toBe(true)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.totalEntriesInRange).toBe(8)
  })

  it('loadWritingStats overrides update state and refetch', async () => {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'quarter',
      bins: [],
    })
    const store = useDashboardStore()
    await store.loadWritingStats({ range: 'all', bin: 'quarter' })
    expect(store.range).toBe('all')
    expect(store.bin).toBe('quarter')
    const call = mockFetch.mock.calls[0][0]
    expect(call?.bin).toBe('quarter')
  })

  it('surfaces ApiRequestError messages verbatim', async () => {
    mockFetch.mockRejectedValue(
      new ApiRequestError(400, 'invalid_bin', 'Unsupported granularity'),
    )
    const store = useDashboardStore()
    await store.loadWritingStats()
    expect(store.error).toBe('Unsupported granularity')
    expect(store.bins).toEqual([])
  })

  it('surfaces plain Error messages', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))
    const store = useDashboardStore()
    await store.loadWritingStats()
    expect(store.error).toBe('network down')
  })

  it('falls back to a generic message on a non-Error throw', async () => {
    mockFetch.mockRejectedValue('kaboom')
    const store = useDashboardStore()
    await store.loadWritingStats()
    expect(store.error).toBe('Failed to load dashboard data')
  })

  it('reset clears state back to defaults', async () => {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [{ bin_start: '2026-03-01', entry_count: 1, total_words: 100 }],
    })
    const store = useDashboardStore()
    await store.loadWritingStats({ range: 'all', bin: 'week' })
    expect(store.hasLoaded).toBe(true)
    store.reset()
    expect(store.range).toBe('last_3_months')
    expect(store.bin).toBe('week')
    expect(store.bins).toEqual([])
    expect(store.hasLoaded).toBe(false)
  })

  it('empty response leaves bins empty but hasLoaded true', async () => {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    const store = useDashboardStore()
    await store.loadWritingStats()
    expect(store.hasLoaded).toBe(true)
    expect(store.bins).toEqual([])
    expect(store.totalEntriesInRange).toBe(0)
  })
})
