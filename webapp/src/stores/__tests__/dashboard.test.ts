import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDashboardStore, rangeToDates } from '../dashboard'

vi.mock('@/api/dashboard', () => ({
  fetchWritingStats: vi.fn(),
  fetchMoodDimensions: vi.fn(),
  fetchMoodTrends: vi.fn(),
}))
vi.mock('@/api/insights', () => ({
  fetchMoodDrilldown: vi.fn(),
  fetchEntityDistribution: vi.fn(),
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

import {
  fetchMoodDimensions,
  fetchMoodTrends,
  fetchWritingStats,
} from '@/api/dashboard'
import { ApiRequestError } from '@/api/client'
const mockFetch = vi.mocked(fetchWritingStats)
const mockMoodDims = vi.mocked(fetchMoodDimensions)
const mockMoodTrends = vi.mocked(fetchMoodTrends)

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

describe('useDashboardStore — mood surface', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const fakeDimensions = [
    {
      name: 'joy_sadness',
      positive_pole: 'joy',
      negative_pole: 'sadness',
      scale_type: 'bipolar' as const,
      score_min: -1.0,
      score_max: 1.0,
      notes: '...',
    },
    {
      name: 'agency',
      positive_pole: 'agency',
      negative_pole: 'apathy',
      scale_type: 'unipolar' as const,
      score_min: 0.0,
      score_max: 1.0,
      notes: '...',
    },
  ]

  it('initial mood state is empty, flag off', () => {
    const store = useDashboardStore()
    expect(store.moodDimensions).toEqual([])
    expect(store.moodBins).toEqual([])
    expect(store.moodScoringEnabled).toBe(false)
    expect(store.hasMoodData).toBe(false)
    expect(store.hiddenMoodDimensions.size).toBe(0)
  })

  it('loadMoodDimensions populates state and flips the enabled flag', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    expect(store.moodDimensions).toHaveLength(2)
    expect(store.moodScoringEnabled).toBe(true)
  })

  it('loadMoodDimensions isolates agency by default on first load', async () => {
    const dims = [
      { ...fakeDimensions[0], name: 'joy_sadness' },
      { ...fakeDimensions[1], name: 'agency' },
      { ...fakeDimensions[0], name: 'anxiety_eagerness' },
      { ...fakeDimensions[0], name: 'proactive_reactive' },
      { ...fakeDimensions[0], name: 'fulfillment' },
    ]
    mockMoodDims.mockResolvedValue({ dimensions: dims })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    // Only agency should be visible (isolated)
    expect(store.hiddenMoodDimensions.has('joy_sadness')).toBe(true)
    expect(store.hiddenMoodDimensions.has('anxiety_eagerness')).toBe(true)
    expect(store.hiddenMoodDimensions.has('proactive_reactive')).toBe(true)
    expect(store.hiddenMoodDimensions.has('fulfillment')).toBe(true)
    expect(store.hiddenMoodDimensions.has('agency')).toBe(false)
  })

  it('loadMoodDimensions does not reapply defaults on subsequent calls', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    // Clear hidden set (simulating user restoring all)
    store.hiddenMoodDimensions.clear()
    // Second load should not reapply defaults
    await store.loadMoodDimensions()
    expect(store.hiddenMoodDimensions.size).toBe(0)
  })

  it('loadMoodDimensions swallows errors and leaves state empty', async () => {
    mockMoodDims.mockRejectedValue(new Error('network down'))
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    expect(store.moodDimensions).toEqual([])
    expect(store.moodScoringEnabled).toBe(false)
  })

  it('loadMoodTrends populates moodBins on success', async () => {
    mockMoodTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [
        {
          period: '2026-03-02',
          dimension: 'joy_sadness',
          avg_score: 0.5,
          entry_count: 3,
          score_min: 0.3,
          score_max: 0.7,
        },
        {
          period: '2026-03-02',
          dimension: 'agency',
          avg_score: 0.7,
          entry_count: 3,
          score_min: 0.5,
          score_max: 0.9,
        },
      ],
    })
    const store = useDashboardStore()
    await store.loadMoodTrends()
    expect(store.moodBins).toHaveLength(2)
    expect(store.hasMoodData).toBe(true)
    expect(store.moodHasLoaded).toBe(true)
    expect(store.moodError).toBeNull()
  })

  it('loadMoodTrends surfaces ApiRequestError verbatim', async () => {
    mockMoodTrends.mockRejectedValue(
      new ApiRequestError(400, 'invalid_bin', 'Unsupported granularity'),
    )
    const store = useDashboardStore()
    await store.loadMoodTrends()
    expect(store.moodError).toBe('Unsupported granularity')
    expect(store.moodBins).toEqual([])
  })

  it('loadMoodTrends falls back on non-Error throw', async () => {
    mockMoodTrends.mockRejectedValue('kaboom')
    const store = useDashboardStore()
    await store.loadMoodTrends()
    expect(store.moodError).toBe('Failed to load mood data')
  })

  it('toggleMoodDimension isolates clicked dimension (Grafana-style)', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()

    // Click joy_sadness → isolate it (agency hidden)
    store.toggleMoodDimension('joy_sadness')
    expect(store.hiddenMoodDimensions.has('agency')).toBe(true)
    expect(store.hiddenMoodDimensions.has('joy_sadness')).toBe(false)

    // joy_sadness isolated → click joy_sadness again → restore all
    store.toggleMoodDimension('joy_sadness')
    expect(store.hiddenMoodDimensions.size).toBe(0)
  })

  it('toggleMoodDimension switches isolation when clicking a different dimension', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()

    // Isolate joy_sadness
    store.toggleMoodDimension('joy_sadness')
    expect(store.hiddenMoodDimensions.has('agency')).toBe(true)

    // Click agency while joy_sadness is isolated → switch to agency
    store.toggleMoodDimension('agency')
    expect(store.hiddenMoodDimensions.has('joy_sadness')).toBe(true)
    expect(store.hiddenMoodDimensions.has('agency')).toBe(false)
  })

  it('toggleMoodDimension creates a new Set so Vue reactivity fires', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    const before = store.hiddenMoodDimensions
    store.toggleMoodDimension('joy_sadness')
    const after = store.hiddenMoodDimensions
    // Must be a different Set instance — mutating in place would
    // not trigger watchers in the DashboardView.
    expect(after).not.toBe(before)
  })

  it('reset wipes mood state back to defaults', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    mockMoodTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [
        {
          period: '2026-03-02',
          dimension: 'joy_sadness',
          avg_score: 0.5,
          entry_count: 1,
          score_min: 0.5,
          score_max: 0.5,
        },
      ],
    })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    await store.loadMoodTrends()
    store.toggleMoodDimension('joy_sadness')

    store.reset()

    expect(store.moodDimensions).toEqual([])
    expect(store.moodBins).toEqual([])
    expect(store.moodScoringEnabled).toBe(false)
    expect(store.hiddenMoodDimensions.size).toBe(0)
    expect(store.moodHasLoaded).toBe(false)
  })

  it('loadMoodTrends applies range override', async () => {
    mockMoodTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    const store = useDashboardStore()
    await store.loadMoodTrends({ range: 'last_6_months' })
    expect(store.range).toBe('last_6_months')
  })

  it('loadMoodTrends applies bin override', async () => {
    mockMoodTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'month',
      bins: [],
    })
    const store = useDashboardStore()
    await store.loadMoodTrends({ bin: 'month' })
    expect(store.bin).toBe('month')
    const call = mockMoodTrends.mock.calls[0][0]
    expect(call?.bin).toBe('month')
  })

  it('loadDrillDown populates drill-down state', async () => {
    const { fetchMoodDrilldown } = await import('@/api/insights')
    vi.mocked(fetchMoodDrilldown).mockResolvedValue({
      dimension: 'joy_sadness',
      from: '2026-03-02',
      to: '2026-03-08',
      entries: [
        {
          entry_id: 1,
          entry_date: '2026-03-02',
          score: 0.5,
          confidence: 0.9,
          rationale: 'Happy day',
        },
      ],
    })
    const store = useDashboardStore()
    await store.loadDrillDown('2026-03-02', 'joy_sadness')
    expect(store.drillPeriod).toBe('2026-03-02')
    expect(store.drillDimension).toBe('joy_sadness')
    expect(store.drillEntries).toHaveLength(1)
    expect(store.drillLoading).toBe(false)
    expect(store.drillError).toBeNull()
  })

  it('clearDrillDown resets drill-down state', async () => {
    const store = useDashboardStore()
    store.drillPeriod = '2026-03-02'
    store.drillDimension = 'joy_sadness'
    store.clearDrillDown()
    expect(store.drillPeriod).toBeNull()
    expect(store.drillDimension).toBeNull()
    expect(store.drillEntries).toEqual([])
  })

  it('loadDrillDown surfaces ApiRequestError verbatim', async () => {
    const { fetchMoodDrilldown } = await import('@/api/insights')
    vi.mocked(fetchMoodDrilldown).mockRejectedValue(
      new ApiRequestError(400, 'invalid', 'Bad dimension'),
    )
    const store = useDashboardStore()
    await store.loadDrillDown('2026-03-02', 'joy_sadness')
    expect(store.drillError).toBe('Bad dimension')
    expect(store.drillEntries).toEqual([])
    expect(store.drillLoading).toBe(false)
  })

  it('loadDrillDown surfaces plain Error messages', async () => {
    const { fetchMoodDrilldown } = await import('@/api/insights')
    vi.mocked(fetchMoodDrilldown).mockRejectedValue(new Error('network'))
    const store = useDashboardStore()
    await store.loadDrillDown('2026-03-02', 'joy_sadness')
    expect(store.drillError).toBe('network')
  })

  it('loadDrillDown falls back on non-Error throw', async () => {
    const { fetchMoodDrilldown } = await import('@/api/insights')
    vi.mocked(fetchMoodDrilldown).mockRejectedValue('kaboom')
    const store = useDashboardStore()
    await store.loadDrillDown('2026-03-02', 'joy_sadness')
    expect(store.drillError).toBe('Failed to load drill-down data')
  })

  it('loadDrillDown uses correct end date for month bin', async () => {
    const { fetchMoodDrilldown } = await import('@/api/insights')
    vi.mocked(fetchMoodDrilldown).mockResolvedValue({
      dimension: 'agency',
      from: '2026-03-01',
      to: '2026-03-31',
      entries: [],
    })
    const store = useDashboardStore()
    store.bin = 'month'
    await store.loadDrillDown('2026-03-01', 'agency')
    expect(vi.mocked(fetchMoodDrilldown)).toHaveBeenCalledWith({
      dimension: 'agency',
      from: '2026-03-01',
      to: '2026-03-31',
    })
  })

  it('loadDrillDown uses correct end date for quarter bin', async () => {
    const { fetchMoodDrilldown } = await import('@/api/insights')
    vi.mocked(fetchMoodDrilldown).mockResolvedValue({
      dimension: 'agency',
      from: '2026-03-01',
      to: '2026-03-31',
      entries: [],
    })
    const store = useDashboardStore()
    store.bin = 'quarter'
    await store.loadDrillDown('2026-01-01', 'agency')
    expect(vi.mocked(fetchMoodDrilldown)).toHaveBeenCalledWith({
      dimension: 'agency',
      from: '2026-01-01',
      to: '2026-03-31',
    })
  })

  it('loadDrillDown uses correct end date for year bin', async () => {
    const { fetchMoodDrilldown } = await import('@/api/insights')
    vi.mocked(fetchMoodDrilldown).mockResolvedValue({
      dimension: 'agency',
      from: '2026-03-01',
      to: '2026-03-31',
      entries: [],
    })
    const store = useDashboardStore()
    store.bin = 'year'
    await store.loadDrillDown('2026-01-01', 'agency')
    expect(vi.mocked(fetchMoodDrilldown)).toHaveBeenCalledWith({
      dimension: 'agency',
      from: '2026-01-01',
      to: '2026-12-31',
    })
  })
})

describe('useDashboardStore — entity distribution', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initial entity state is empty', () => {
    const store = useDashboardStore()
    expect(store.entityType).toBe('topic')
    expect(store.entityDistribution).toEqual([])
    expect(store.entityLoading).toBe(false)
    expect(store.entityError).toBeNull()
    expect(store.entityHasLoaded).toBe(false)
  })

  it('loadEntityDistribution populates state on success', async () => {
    const { fetchEntityDistribution } = await import('@/api/insights')
    vi.mocked(fetchEntityDistribution).mockResolvedValue({
      type: 'topic',
      from: null,
      to: null,
      total: 2,
      items: [
        {
          canonical_name: 'meditation',
          entity_type: 'topic',
          mention_count: 14,
        },
        { canonical_name: 'running', entity_type: 'topic', mention_count: 9 },
      ],
    })
    const store = useDashboardStore()
    await store.loadEntityDistribution('topic')
    expect(store.entityDistribution).toHaveLength(2)
    expect(store.entityType).toBe('topic')
    expect(store.entityHasLoaded).toBe(true)
    expect(store.entityLoading).toBe(false)
    expect(store.entityError).toBeNull()
  })

  it('loadEntityDistribution surfaces ApiRequestError verbatim', async () => {
    const { fetchEntityDistribution } = await import('@/api/insights')
    vi.mocked(fetchEntityDistribution).mockRejectedValue(
      new ApiRequestError(400, 'invalid_type', 'bad entity type'),
    )
    const store = useDashboardStore()
    await store.loadEntityDistribution()
    expect(store.entityError).toBe('bad entity type')
    expect(store.entityDistribution).toEqual([])
  })

  it('loadEntityDistribution surfaces plain Error messages', async () => {
    const { fetchEntityDistribution } = await import('@/api/insights')
    vi.mocked(fetchEntityDistribution).mockRejectedValue(new Error('net fail'))
    const store = useDashboardStore()
    await store.loadEntityDistribution()
    expect(store.entityError).toBe('net fail')
  })

  it('loadEntityDistribution falls back on non-Error throw', async () => {
    const { fetchEntityDistribution } = await import('@/api/insights')
    vi.mocked(fetchEntityDistribution).mockRejectedValue(null)
    const store = useDashboardStore()
    await store.loadEntityDistribution()
    expect(store.entityError).toBe('Failed to load entity distribution')
  })

  it('loadEntityDistribution without explicit type uses current', async () => {
    const { fetchEntityDistribution } = await import('@/api/insights')
    vi.mocked(fetchEntityDistribution).mockResolvedValue({
      type: 'activity',
      from: null,
      to: null,
      total: 0,
      items: [],
    })
    const store = useDashboardStore()
    store.entityType = 'activity'
    await store.loadEntityDistribution()
    expect(store.entityType).toBe('activity')
  })

  it('reset clears entity state', async () => {
    const { fetchEntityDistribution } = await import('@/api/insights')
    vi.mocked(fetchEntityDistribution).mockResolvedValue({
      type: 'topic',
      from: null,
      to: null,
      total: 1,
      items: [{ canonical_name: 'x', entity_type: 'topic', mention_count: 1 }],
    })
    const store = useDashboardStore()
    await store.loadEntityDistribution()
    expect(store.entityHasLoaded).toBe(true)

    store.reset()
    expect(store.entityType).toBe('topic')
    expect(store.entityDistribution).toEqual([])
    expect(store.entityHasLoaded).toBe(false)
  })
})
