import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDashboardStore, rangeToDates } from '../dashboard'

vi.mock('@/api/dashboard', () => ({
  fetchWritingStats: vi.fn(),
  fetchMoodDimensions: vi.fn(),
  fetchMoodTrends: vi.fn(),
  fetchCalendarHeatmap: vi.fn(),
  fetchEntityTrends: vi.fn(),
  fetchMoodEntityCorrelation: vi.fn(),
  fetchWordCountDistribution: vi.fn(),
}))
vi.mock('@/api/insights', () => ({
  fetchMoodDrilldown: vi.fn(),
  fetchEntityDistribution: vi.fn(),
}))
vi.mock('@/api/preferences', () => ({
  fetchPreferences: vi.fn(),
  updatePreferences: vi.fn(),
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
  fetchCalendarHeatmap,
  fetchEntityTrends,
  fetchMoodDimensions,
  fetchMoodEntityCorrelation,
  fetchMoodTrends,
  fetchWordCountDistribution,
  fetchWritingStats,
} from '@/api/dashboard'
import { fetchPreferences, updatePreferences } from '@/api/preferences'
import { ApiRequestError } from '@/api/client'
import { DEFAULT_TILE_ORDER, DASHBOARD_TILES } from '@/types/dashboard'
import type { DashboardTileId } from '@/types/dashboard'
const mockFetchPreferences = vi.mocked(fetchPreferences)
const mockUpdatePreferences = vi.mocked(updatePreferences)
const mockFetch = vi.mocked(fetchWritingStats)
const mockMoodDims = vi.mocked(fetchMoodDimensions)
const mockMoodTrends = vi.mocked(fetchMoodTrends)
const mockCalendar = vi.mocked(fetchCalendarHeatmap)
const mockEntityTrends = vi.mocked(fetchEntityTrends)
const mockMoodCorrelation = vi.mocked(fetchMoodEntityCorrelation)
const mockWordDist = vi.mocked(fetchWordCountDistribution)

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
    expect(store.range).toBe('all')
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
    expect(store.selectedMoodDimensions.size).toBe(0)
  })

  it('isMoodDimensionVisible treats empty selection as show-all', () => {
    const store = useDashboardStore()
    expect(store.selectedMoodDimensions.size).toBe(0)
    expect(store.isMoodDimensionVisible('joy_sadness')).toBe(true)
    expect(store.isMoodDimensionVisible('anything')).toBe(true)
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
    // Only agency should be selected (the only-visible).
    expect(store.selectedMoodDimensions.size).toBe(1)
    expect(store.selectedMoodDimensions.has('agency')).toBe(true)
    expect(store.isMoodDimensionVisible('agency')).toBe(true)
    expect(store.isMoodDimensionVisible('joy_sadness')).toBe(false)
  })

  it('loadMoodDimensions starts with empty selection if agency is absent', async () => {
    mockMoodDims.mockResolvedValue({
      dimensions: [{ ...fakeDimensions[0], name: 'joy_sadness' }],
    })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    // No agency — fall through to "show all" (empty selection).
    expect(store.selectedMoodDimensions.size).toBe(0)
    expect(store.isMoodDimensionVisible('joy_sadness')).toBe(true)
  })

  it('loadMoodDimensions does not reapply defaults on subsequent calls', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    // User clears the selection (show all).
    store.showAllMoodDimensions()
    // Second load should not reapply defaults — selection stays empty.
    await store.loadMoodDimensions()
    expect(store.selectedMoodDimensions.size).toBe(0)
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

  it('toggleMoodDimension flips a single dimension independently', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    // Default-isolate selects only agency.
    expect(store.selectedMoodDimensions.has('agency')).toBe(true)
    expect(store.selectedMoodDimensions.has('joy_sadness')).toBe(false)
    expect(store.isMoodDimensionVisible('joy_sadness')).toBe(false)

    // Toggling joy_sadness adds it to the selection (now 2 visible).
    store.toggleMoodDimension('joy_sadness')
    expect(store.selectedMoodDimensions.has('joy_sadness')).toBe(true)
    expect(store.selectedMoodDimensions.has('agency')).toBe(true)

    // Toggling joy_sadness again removes it; agency still selected.
    store.toggleMoodDimension('joy_sadness')
    expect(store.selectedMoodDimensions.has('joy_sadness')).toBe(false)
    expect(store.selectedMoodDimensions.has('agency')).toBe(true)
  })

  it('toggleMoodDimension supports any subset', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    store.showAllMoodDimensions()
    // Build a 2-of-2 selection.
    store.toggleMoodDimension('joy_sadness')
    store.toggleMoodDimension('agency')
    expect(store.selectedMoodDimensions.size).toBe(2)
    // Drop one → exactly one selected.
    store.toggleMoodDimension('agency')
    expect(store.selectedMoodDimensions.has('joy_sadness')).toBe(true)
    expect(store.selectedMoodDimensions.has('agency')).toBe(false)
  })

  it('toggleMoodDimension creates a new Set so Vue reactivity fires', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    const before = store.selectedMoodDimensions
    store.toggleMoodDimension('joy_sadness')
    const after = store.selectedMoodDimensions
    // Must be a different Set instance — mutating in place would
    // not trigger watchers in the DashboardView.
    expect(after).not.toBe(before)
  })

  it('deselecting the last selected dimension falls back to show-all (Bug A regression)', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    // Default selection has only agency.
    expect(store.selectedMoodDimensions.size).toBe(1)
    // Click agency to deselect.
    store.toggleMoodDimension('agency')
    expect(store.selectedMoodDimensions.size).toBe(0)
    // Empty selection means "show all" — every dimension visible.
    expect(store.isMoodDimensionVisible('agency')).toBe(true)
    expect(store.isMoodDimensionVisible('joy_sadness')).toBe(true)
  })

  it('showAllMoodDimensions clears the selection', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    expect(store.selectedMoodDimensions.size).toBeGreaterThan(0)
    store.showAllMoodDimensions()
    expect(store.selectedMoodDimensions.size).toBe(0)
    expect(store.isMoodDimensionVisible('joy_sadness')).toBe(true)
    expect(store.isMoodDimensionVisible('agency')).toBe(true)
  })

  it('moodGroupSelectionState reports tristate correctly', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    // Default selection: only agency.
    expect(store.moodGroupSelectionState(['agency'])).toBe('all')
    expect(store.moodGroupSelectionState(['joy_sadness'])).toBe('none')
    expect(store.moodGroupSelectionState(['agency', 'joy_sadness'])).toBe(
      'some',
    )
    expect(store.moodGroupSelectionState([])).toBe('none')
  })

  it('toggleMoodGroup adds all when none selected, removes all when any selected', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    store.showAllMoodDimensions()
    // None → adds all members.
    store.toggleMoodGroup(['joy_sadness', 'agency'])
    expect(store.selectedMoodDimensions.size).toBe(2)
    // All → removes all.
    store.toggleMoodGroup(['joy_sadness', 'agency'])
    expect(store.selectedMoodDimensions.size).toBe(0)
    // Partial → also removes all (collapses to clean state).
    store.toggleMoodDimension('joy_sadness')
    expect(store.moodGroupSelectionState(['joy_sadness', 'agency'])).toBe(
      'some',
    )
    store.toggleMoodGroup(['joy_sadness', 'agency'])
    expect(store.moodGroupSelectionState(['joy_sadness', 'agency'])).toBe(
      'none',
    )
  })

  it('toggleMoodGroup creates a new Set so Vue reactivity fires', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    const before = store.selectedMoodDimensions
    store.toggleMoodGroup(['joy_sadness'])
    expect(store.selectedMoodDimensions).not.toBe(before)
  })

  it('toggleMoodGroup is a no-op for an empty member list', async () => {
    mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    const before = store.selectedMoodDimensions
    store.toggleMoodGroup([])
    expect(store.selectedMoodDimensions).toBe(before)
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
    expect(store.selectedMoodDimensions.size).toBe(0)
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

describe('useDashboardStore — calendar heatmap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initial calendar state is empty', () => {
    const store = useDashboardStore()
    expect(store.calendarDays).toEqual([])
    expect(store.calendarLoading).toBe(false)
    expect(store.calendarError).toBeNull()
    expect(store.calendarHasLoaded).toBe(false)
  })

  it('loadCalendarHeatmap populates state on success', async () => {
    mockCalendar.mockResolvedValue({
      from: '2026-01-11',
      to: '2026-04-11',
      days: [
        { date: '2026-01-15', entry_count: 2, total_words: 400 },
        { date: '2026-02-03', entry_count: 1, total_words: 150 },
      ],
    })
    const store = useDashboardStore()
    await store.loadCalendarHeatmap()
    expect(store.calendarDays).toHaveLength(2)
    expect(store.calendarHasLoaded).toBe(true)
    expect(store.calendarLoading).toBe(false)
    expect(store.calendarError).toBeNull()
  })

  it('loadCalendarHeatmap surfaces ApiRequestError verbatim', async () => {
    mockCalendar.mockRejectedValue(
      new ApiRequestError(400, 'invalid_range', 'Bad date range'),
    )
    const store = useDashboardStore()
    await store.loadCalendarHeatmap()
    expect(store.calendarError).toBe('Bad date range')
    expect(store.calendarDays).toEqual([])
  })

  it('loadCalendarHeatmap surfaces plain Error messages', async () => {
    mockCalendar.mockRejectedValue(new Error('network down'))
    const store = useDashboardStore()
    await store.loadCalendarHeatmap()
    expect(store.calendarError).toBe('network down')
  })

  it('loadCalendarHeatmap handles non-Error throw', async () => {
    mockCalendar.mockRejectedValue('kaboom')
    const store = useDashboardStore()
    await store.loadCalendarHeatmap()
    expect(store.calendarError).toBe('Failed to load calendar heatmap')
  })

  it('reset clears calendar state', async () => {
    mockCalendar.mockResolvedValue({
      from: '2026-01-11',
      to: '2026-04-11',
      days: [{ date: '2026-01-15', entry_count: 1, total_words: 100 }],
    })
    const store = useDashboardStore()
    await store.loadCalendarHeatmap()
    expect(store.calendarHasLoaded).toBe(true)

    store.reset()
    expect(store.calendarDays).toEqual([])
    expect(store.calendarHasLoaded).toBe(false)
    expect(store.calendarError).toBeNull()
  })
})

describe('useDashboardStore — entity trends', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initial entity trends state is empty', () => {
    const store = useDashboardStore()
    expect(store.entityTrends).toEqual([])
    expect(store.entityTrendEntities).toEqual([])
    expect(store.entityTrendsType).toBe('topic')
    expect(store.entityTrendsLoading).toBe(false)
    expect(store.entityTrendsError).toBeNull()
    expect(store.entityTrendsHasLoaded).toBe(false)
    expect(store.hiddenEntityTrends.size).toBe(0)
  })

  it('toggleEntityTrend flips a single entity independently', async () => {
    mockEntityTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'topic',
      entities: ['meditation', 'running', 'reading'],
      bins: [],
    })
    const store = useDashboardStore()
    await store.loadEntityTrends('topic')

    store.toggleEntityTrend('meditation')
    expect(store.hiddenEntityTrends.has('meditation')).toBe(true)
    expect(store.hiddenEntityTrends.has('running')).toBe(false)

    store.toggleEntityTrend('reading')
    expect(store.hiddenEntityTrends.size).toBe(2)

    store.toggleEntityTrend('meditation')
    expect(store.hiddenEntityTrends.has('meditation')).toBe(false)
    expect(store.hiddenEntityTrends.has('reading')).toBe(true)
  })

  it('toggleEntityTrend creates a new Set so Vue reactivity fires', async () => {
    mockEntityTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'topic',
      entities: ['meditation'],
      bins: [],
    })
    const store = useDashboardStore()
    await store.loadEntityTrends('topic')
    const before = store.hiddenEntityTrends
    store.toggleEntityTrend('meditation')
    expect(store.hiddenEntityTrends).not.toBe(before)
  })

  it('showAllEntityTrends and hideAllEntityTrends bulk-set visibility', async () => {
    mockEntityTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'topic',
      entities: ['a', 'b', 'c'],
      bins: [],
    })
    const store = useDashboardStore()
    await store.loadEntityTrends('topic')

    store.hideAllEntityTrends()
    expect(store.hiddenEntityTrends.size).toBe(3)
    expect(store.hiddenEntityTrends.has('a')).toBe(true)
    expect(store.hiddenEntityTrends.has('b')).toBe(true)
    expect(store.hiddenEntityTrends.has('c')).toBe(true)

    store.showAllEntityTrends()
    expect(store.hiddenEntityTrends.size).toBe(0)
  })

  it('loadEntityTrends prunes stale hidden entries on reload', async () => {
    const store = useDashboardStore()
    mockEntityTrends.mockResolvedValueOnce({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'topic',
      entities: ['a', 'b', 'c'],
      bins: [],
    })
    await store.loadEntityTrends('topic')
    store.toggleEntityTrend('a')
    store.toggleEntityTrend('b')
    expect(store.hiddenEntityTrends.size).toBe(2)

    // Reload with a different entity set — only entities still in
    // the new list should remain hidden.
    mockEntityTrends.mockResolvedValueOnce({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'person',
      entities: ['a', 'd'],
      bins: [],
    })
    await store.loadEntityTrends('person')
    expect(store.hiddenEntityTrends.has('a')).toBe(true)
    expect(store.hiddenEntityTrends.has('b')).toBe(false)
    expect(store.hiddenEntityTrends.size).toBe(1)
  })

  it('loadEntityTrends populates state on success', async () => {
    mockEntityTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'topic',
      entities: ['meditation', 'running'],
      bins: [
        { period: '2026-03-02', entity: 'meditation', mention_count: 5 },
        { period: '2026-03-02', entity: 'running', mention_count: 3 },
      ],
    })
    const store = useDashboardStore()
    await store.loadEntityTrends('topic')
    expect(store.entityTrends).toHaveLength(2)
    expect(store.entityTrendEntities).toEqual(['meditation', 'running'])
    expect(store.entityTrendsType).toBe('topic')
    expect(store.entityTrendsHasLoaded).toBe(true)
    expect(store.entityTrendsLoading).toBe(false)
    expect(store.entityTrendsError).toBeNull()
  })

  it('loadEntityTrends surfaces ApiRequestError verbatim', async () => {
    mockEntityTrends.mockRejectedValue(
      new ApiRequestError(400, 'invalid_type', 'bad entity type'),
    )
    const store = useDashboardStore()
    await store.loadEntityTrends()
    expect(store.entityTrendsError).toBe('bad entity type')
    expect(store.entityTrends).toEqual([])
    expect(store.entityTrendEntities).toEqual([])
  })

  it('loadEntityTrends surfaces plain Error messages', async () => {
    mockEntityTrends.mockRejectedValue(new Error('net fail'))
    const store = useDashboardStore()
    await store.loadEntityTrends()
    expect(store.entityTrendsError).toBe('net fail')
  })

  it('loadEntityTrends handles non-Error throw', async () => {
    mockEntityTrends.mockRejectedValue(null)
    const store = useDashboardStore()
    await store.loadEntityTrends()
    expect(store.entityTrendsError).toBe('Failed to load entity trends')
  })

  it('loadEntityTrends without explicit type uses current', async () => {
    mockEntityTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'activity',
      entities: [],
      bins: [],
    })
    const store = useDashboardStore()
    store.entityTrendsType = 'activity'
    await store.loadEntityTrends()
    expect(store.entityTrendsType).toBe('activity')
  })

  it('reset clears entity trends state', async () => {
    mockEntityTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'topic',
      entities: ['x'],
      bins: [{ period: '2026-03-02', entity: 'x', mention_count: 1 }],
    })
    const store = useDashboardStore()
    await store.loadEntityTrends()
    expect(store.entityTrendsHasLoaded).toBe(true)

    store.toggleEntityTrend('x')
    expect(store.hiddenEntityTrends.size).toBe(1)

    store.reset()
    expect(store.entityTrends).toEqual([])
    expect(store.entityTrendEntities).toEqual([])
    expect(store.entityTrendsType).toBe('topic')
    expect(store.entityTrendsHasLoaded).toBe(false)
    expect(store.hiddenEntityTrends.size).toBe(0)
  })
})

describe('useDashboardStore — mood-entity correlation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initial mood correlation state is empty', () => {
    const store = useDashboardStore()
    expect(store.moodCorrelationItems).toEqual([])
    expect(store.moodCorrelationOverallAvg).toBe(0)
    expect(store.moodCorrelationDimension).toBe('agency')
    expect(store.moodCorrelationType).toBe('person')
    expect(store.moodCorrelationLoading).toBe(false)
    expect(store.moodCorrelationError).toBeNull()
    expect(store.moodCorrelationHasLoaded).toBe(false)
  })

  it('loadMoodEntityCorrelation populates state on success', async () => {
    mockMoodCorrelation.mockResolvedValue({
      dimension: 'agency',
      from: null,
      to: null,
      entity_type: 'person',
      overall_avg: 0.45,
      items: [
        {
          entity: 'Alice',
          entity_type: 'person',
          avg_score: 0.6,
          entry_count: 5,
        },
        {
          entity: 'Bob',
          entity_type: 'person',
          avg_score: 0.3,
          entry_count: 3,
        },
      ],
    })
    const store = useDashboardStore()
    await store.loadMoodEntityCorrelation('agency', 'person')
    expect(store.moodCorrelationItems).toHaveLength(2)
    expect(store.moodCorrelationOverallAvg).toBe(0.45)
    expect(store.moodCorrelationDimension).toBe('agency')
    expect(store.moodCorrelationType).toBe('person')
    expect(store.moodCorrelationHasLoaded).toBe(true)
    expect(store.moodCorrelationLoading).toBe(false)
    expect(store.moodCorrelationError).toBeNull()
  })

  it('loadMoodEntityCorrelation surfaces ApiRequestError verbatim', async () => {
    mockMoodCorrelation.mockRejectedValue(
      new ApiRequestError(400, 'invalid_dim', 'bad dimension'),
    )
    const store = useDashboardStore()
    await store.loadMoodEntityCorrelation()
    expect(store.moodCorrelationError).toBe('bad dimension')
    expect(store.moodCorrelationItems).toEqual([])
    expect(store.moodCorrelationOverallAvg).toBe(0)
  })

  it('loadMoodEntityCorrelation surfaces plain Error messages', async () => {
    mockMoodCorrelation.mockRejectedValue(new Error('net fail'))
    const store = useDashboardStore()
    await store.loadMoodEntityCorrelation()
    expect(store.moodCorrelationError).toBe('net fail')
  })

  it('loadMoodEntityCorrelation handles non-Error throw', async () => {
    mockMoodCorrelation.mockRejectedValue(null)
    const store = useDashboardStore()
    await store.loadMoodEntityCorrelation()
    expect(store.moodCorrelationError).toBe(
      'Failed to load mood-entity correlation',
    )
  })

  it('loadMoodEntityCorrelation uses current dimension when not specified', async () => {
    mockMoodCorrelation.mockResolvedValue({
      dimension: 'joy_sadness',
      from: null,
      to: null,
      entity_type: 'person',
      overall_avg: 0.5,
      items: [],
    })
    const store = useDashboardStore()
    store.moodCorrelationDimension = 'joy_sadness'
    await store.loadMoodEntityCorrelation()
    expect(store.moodCorrelationDimension).toBe('joy_sadness')
  })

  it('reset clears mood correlation state', async () => {
    mockMoodCorrelation.mockResolvedValue({
      dimension: 'agency',
      from: null,
      to: null,
      entity_type: 'person',
      overall_avg: 0.5,
      items: [
        {
          entity: 'Alice',
          entity_type: 'person',
          avg_score: 0.6,
          entry_count: 5,
        },
      ],
    })
    const store = useDashboardStore()
    await store.loadMoodEntityCorrelation()
    expect(store.moodCorrelationHasLoaded).toBe(true)

    store.reset()
    expect(store.moodCorrelationItems).toEqual([])
    expect(store.moodCorrelationOverallAvg).toBe(0)
    expect(store.moodCorrelationDimension).toBe('agency')
    expect(store.moodCorrelationType).toBe('person')
    expect(store.moodCorrelationHasLoaded).toBe(false)
  })
})

describe('useDashboardStore — word count distribution', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initial word count distribution state is empty', () => {
    const store = useDashboardStore()
    expect(store.wordCountBuckets).toEqual([])
    expect(store.wordCountStats).toBeNull()
    expect(store.wordCountLoading).toBe(false)
    expect(store.wordCountError).toBeNull()
    expect(store.wordCountHasLoaded).toBe(false)
  })

  it('loadWordCountDistribution populates state on success', async () => {
    mockWordDist.mockResolvedValue({
      from: null,
      to: null,
      bucket_size: 100,
      buckets: [
        { range_start: 0, range_end: 100, count: 12 },
        { range_start: 100, range_end: 200, count: 8 },
      ],
      stats: { min: 42, max: 980, avg: 350, median: 310, total_entries: 50 },
    })
    const store = useDashboardStore()
    await store.loadWordCountDistribution()
    expect(store.wordCountBuckets).toHaveLength(2)
    expect(store.wordCountStats).toEqual({
      min: 42,
      max: 980,
      avg: 350,
      median: 310,
      total_entries: 50,
    })
    expect(store.wordCountHasLoaded).toBe(true)
    expect(store.wordCountLoading).toBe(false)
    expect(store.wordCountError).toBeNull()
  })

  it('loadWordCountDistribution surfaces ApiRequestError verbatim', async () => {
    mockWordDist.mockRejectedValue(
      new ApiRequestError(400, 'invalid_bucket', 'Bad bucket size'),
    )
    const store = useDashboardStore()
    await store.loadWordCountDistribution()
    expect(store.wordCountError).toBe('Bad bucket size')
    expect(store.wordCountBuckets).toEqual([])
    expect(store.wordCountStats).toBeNull()
  })

  it('loadWordCountDistribution surfaces plain Error messages', async () => {
    mockWordDist.mockRejectedValue(new Error('network down'))
    const store = useDashboardStore()
    await store.loadWordCountDistribution()
    expect(store.wordCountError).toBe('network down')
  })

  it('loadWordCountDistribution handles non-Error throw', async () => {
    mockWordDist.mockRejectedValue('kaboom')
    const store = useDashboardStore()
    await store.loadWordCountDistribution()
    expect(store.wordCountError).toBe('Failed to load word count distribution')
  })

  it('reset clears word count distribution state', async () => {
    mockWordDist.mockResolvedValue({
      from: null,
      to: null,
      bucket_size: 100,
      buckets: [{ range_start: 0, range_end: 100, count: 5 }],
      stats: { min: 10, max: 90, avg: 50, median: 45, total_entries: 5 },
    })
    const store = useDashboardStore()
    await store.loadWordCountDistribution()
    expect(store.wordCountHasLoaded).toBe(true)

    store.reset()
    expect(store.wordCountBuckets).toEqual([])
    expect(store.wordCountStats).toBeNull()
    expect(store.wordCountHasLoaded).toBe(false)
    expect(store.wordCountError).toBeNull()
  })
})

describe('useDashboardStore — tile layout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Default state ──────────────────────────────────────────────

  it('tileOrder defaults to DEFAULT_TILE_ORDER', () => {
    const store = useDashboardStore()
    expect(store.tileOrder).toEqual([...DEFAULT_TILE_ORDER])
  })

  it('hiddenTiles defaults to empty array', () => {
    const store = useDashboardStore()
    expect(store.hiddenTiles).toEqual([])
  })

  it('editingLayout defaults to false', () => {
    const store = useDashboardStore()
    expect(store.editingLayout).toBe(false)
  })

  it('layoutLoaded defaults to false', () => {
    const store = useDashboardStore()
    expect(store.layoutLoaded).toBe(false)
  })

  it('visibleTiles equals tileOrder when nothing is hidden', () => {
    const store = useDashboardStore()
    expect(store.visibleTiles).toEqual([...DEFAULT_TILE_ORDER])
  })

  // ── moveTile ───────────────────────────────────────────────────

  it('moveTile("down") swaps a tile with its next neighbor', () => {
    const store = useDashboardStore()
    const first = store.tileOrder[0]
    const second = store.tileOrder[1]
    store.moveTile(first, 'down')
    expect(store.tileOrder[0]).toBe(second)
    expect(store.tileOrder[1]).toBe(first)
  })

  it('moveTile("up") swaps a tile with its previous neighbor', () => {
    const store = useDashboardStore()
    const first = store.tileOrder[0]
    const second = store.tileOrder[1]
    store.moveTile(second, 'up')
    expect(store.tileOrder[0]).toBe(second)
    expect(store.tileOrder[1]).toBe(first)
  })

  it('moveTile("up") on the first tile is a no-op', () => {
    const store = useDashboardStore()
    const before = [...store.tileOrder]
    store.moveTile(before[0], 'up')
    expect(store.tileOrder).toEqual(before)
  })

  it('moveTile("down") on the last tile is a no-op', () => {
    const store = useDashboardStore()
    const before = [...store.tileOrder]
    const last = before[before.length - 1]
    store.moveTile(last, 'down')
    expect(store.tileOrder).toEqual(before)
  })

  it('moveTile with an unknown ID is a no-op', () => {
    const store = useDashboardStore()
    const before = [...store.tileOrder]
    store.moveTile('nonexistent-tile' as DashboardTileId, 'up')
    expect(store.tileOrder).toEqual(before)
  })

  it('moveTile triggers a debounced persist call', () => {
    mockUpdatePreferences.mockResolvedValue({ preferences: {} })
    const store = useDashboardStore()
    store.moveTile(store.tileOrder[0], 'down')
    // Before the timer fires, updatePreferences should not have been called
    expect(mockUpdatePreferences).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1)
    expect(mockUpdatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboard_layout: expect.objectContaining({
          tileOrder: expect.any(Array),
          hiddenTiles: expect.any(Array),
        }),
      }),
    )
  })

  // ── hideTile / showTile ────────────────────────────────────────

  it('hideTile adds a tile to hiddenTiles', () => {
    const store = useDashboardStore()
    const tile = DEFAULT_TILE_ORDER[0]
    store.hideTile(tile)
    expect(store.hiddenTiles).toContain(tile)
  })

  it('hideTile is idempotent — hiding the same tile twice does not duplicate', () => {
    const store = useDashboardStore()
    const tile = DEFAULT_TILE_ORDER[0]
    store.hideTile(tile)
    store.hideTile(tile)
    expect(store.hiddenTiles.filter((t) => t === tile)).toHaveLength(1)
  })

  it('showTile removes a tile from hiddenTiles', () => {
    const store = useDashboardStore()
    const tile = DEFAULT_TILE_ORDER[0]
    store.hideTile(tile)
    expect(store.hiddenTiles).toContain(tile)
    store.showTile(tile)
    expect(store.hiddenTiles).not.toContain(tile)
  })

  it('showTile on an already-visible tile is a no-op', () => {
    const store = useDashboardStore()
    const before = [...store.hiddenTiles]
    store.showTile(DEFAULT_TILE_ORDER[0])
    expect(store.hiddenTiles).toEqual(before)
  })

  it('hideTile triggers a debounced persist call', () => {
    mockUpdatePreferences.mockResolvedValue({ preferences: {} })
    const store = useDashboardStore()
    store.hideTile(DEFAULT_TILE_ORDER[0])
    vi.advanceTimersByTime(500)
    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1)
  })

  it('showTile triggers a debounced persist call', () => {
    mockUpdatePreferences.mockResolvedValue({ preferences: {} })
    const store = useDashboardStore()
    store.hideTile(DEFAULT_TILE_ORDER[0])
    vi.advanceTimersByTime(500)
    vi.clearAllMocks()
    store.showTile(DEFAULT_TILE_ORDER[0])
    vi.advanceTimersByTime(500)
    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1)
  })

  // ── visibleTiles ───────────────────────────────────────────────

  it('visibleTiles excludes hidden tiles', () => {
    const store = useDashboardStore()
    const hidden = DEFAULT_TILE_ORDER[1]
    store.hideTile(hidden)
    expect(store.visibleTiles).not.toContain(hidden)
    // All others should still be present
    for (const id of DEFAULT_TILE_ORDER) {
      if (id !== hidden) {
        expect(store.visibleTiles).toContain(id)
      }
    }
  })

  it('visibleTiles preserves the order from tileOrder', () => {
    const store = useDashboardStore()
    // Swap first two tiles
    const first = store.tileOrder[0]
    store.moveTile(first, 'down')
    // Hide third tile
    const third = store.tileOrder[2]
    store.hideTile(third)

    const visible = store.visibleTiles
    // The swapped order should be reflected, minus the hidden tile
    const expected = store.tileOrder.filter((id) => id !== third)
    expect(visible).toEqual(expected)
  })

  it('visibleTiles is empty when all tiles are hidden', () => {
    const store = useDashboardStore()
    for (const id of DEFAULT_TILE_ORDER) {
      store.hideTile(id)
    }
    expect(store.visibleTiles).toEqual([])
  })

  // ── resetLayout ────────────────────────────────────────────────

  it('resetLayout restores tileOrder to defaults', () => {
    const store = useDashboardStore()
    store.moveTile(store.tileOrder[0], 'down')
    store.hideTile(DEFAULT_TILE_ORDER[2])
    expect(store.tileOrder).not.toEqual([...DEFAULT_TILE_ORDER])

    store.resetLayout()
    expect(store.tileOrder).toEqual([...DEFAULT_TILE_ORDER])
    expect(store.hiddenTiles).toEqual([])
  })

  it('resetLayout triggers a debounced persist call', () => {
    mockUpdatePreferences.mockResolvedValue({ preferences: {} })
    const store = useDashboardStore()
    store.hideTile(DEFAULT_TILE_ORDER[0])
    vi.advanceTimersByTime(500)
    vi.clearAllMocks()

    store.resetLayout()
    vi.advanceTimersByTime(500)
    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1)
  })

  it('store.reset() does NOT reset tile layout', () => {
    const store = useDashboardStore()
    store.moveTile(store.tileOrder[0], 'down')
    store.hideTile(DEFAULT_TILE_ORDER[2])
    const orderBefore = [...store.tileOrder]
    const hiddenBefore = [...store.hiddenTiles]

    store.reset()

    // Layout should be preserved across reset()
    expect(store.tileOrder).toEqual(orderBefore)
    expect(store.hiddenTiles).toEqual(hiddenBefore)
  })

  // ── loadLayout ─────────────────────────────────────────────────

  it('loadLayout applies saved layout from server', async () => {
    const customOrder: DashboardTileId[] = [
      'word-count',
      'mood-trends',
      'calendar-heatmap',
      'entity-distribution',
      'writing-frequency',
      'topic-trends',
      'mood-entity-correlation',
    ]
    const customHidden: DashboardTileId[] = ['mood-trends', 'word-count']
    mockFetchPreferences.mockResolvedValue({
      preferences: {
        dashboard_layout: {
          tileOrder: customOrder,
          hiddenTiles: customHidden,
        },
      },
    })

    const store = useDashboardStore()
    await store.loadLayout()

    expect(store.tileOrder).toEqual(customOrder)
    expect(store.hiddenTiles).toEqual(customHidden)
    expect(store.layoutLoaded).toBe(true)
  })

  it('loadLayout uses defaults when server returns no dashboard_layout', async () => {
    mockFetchPreferences.mockResolvedValue({
      preferences: {},
    })

    const store = useDashboardStore()
    await store.loadLayout()

    expect(store.tileOrder).toEqual([...DEFAULT_TILE_ORDER])
    expect(store.hiddenTiles).toEqual([])
    expect(store.layoutLoaded).toBe(true)
  })

  it('loadLayout uses defaults when fetchPreferences rejects', async () => {
    mockFetchPreferences.mockRejectedValue(new Error('network down'))

    const store = useDashboardStore()
    await store.loadLayout()

    expect(store.tileOrder).toEqual([...DEFAULT_TILE_ORDER])
    expect(store.hiddenTiles).toEqual([])
    expect(store.layoutLoaded).toBe(true)
  })

  it('loadLayout filters out unknown tile IDs from saved order', async () => {
    mockFetchPreferences.mockResolvedValue({
      preferences: {
        dashboard_layout: {
          tileOrder: ['calendar-heatmap', 'bogus-tile-id', 'word-count'],
          hiddenTiles: ['bogus-hidden-id'],
        },
      },
    })

    const store = useDashboardStore()
    await store.loadLayout()

    // Unknown IDs should be stripped
    expect(store.tileOrder).not.toContain('bogus-tile-id')
    expect(store.hiddenTiles).not.toContain('bogus-hidden-id')
    // Known IDs should be present
    expect(store.tileOrder).toContain('calendar-heatmap')
    expect(store.tileOrder).toContain('word-count')
    expect(store.layoutLoaded).toBe(true)
  })

  it('loadLayout appends missing tiles not present in saved order', async () => {
    // Saved layout only has 3 of the 7 tiles
    mockFetchPreferences.mockResolvedValue({
      preferences: {
        dashboard_layout: {
          tileOrder: ['word-count', 'calendar-heatmap', 'mood-trends'],
          hiddenTiles: [],
        },
      },
    })

    const store = useDashboardStore()
    await store.loadLayout()

    // All 7 default tiles should be present
    expect(store.tileOrder).toHaveLength(DEFAULT_TILE_ORDER.length)
    // The first 3 should be the saved ones in saved order
    expect(store.tileOrder[0]).toBe('word-count')
    expect(store.tileOrder[1]).toBe('calendar-heatmap')
    expect(store.tileOrder[2]).toBe('mood-trends')
    // The remaining tiles should have been appended
    for (const id of DEFAULT_TILE_ORDER) {
      expect(store.tileOrder).toContain(id)
    }
  })

  it('loadLayout handles null tileOrder gracefully', async () => {
    mockFetchPreferences.mockResolvedValue({
      preferences: {
        dashboard_layout: {
          tileOrder: null,
          hiddenTiles: null,
        },
      },
    })

    const store = useDashboardStore()
    await store.loadLayout()

    // Should fall back to all defaults appended
    expect(store.tileOrder).toEqual([...DEFAULT_TILE_ORDER])
    expect(store.hiddenTiles).toEqual([])
    expect(store.layoutLoaded).toBe(true)
  })

  it('loadLayout handles empty arrays gracefully', async () => {
    mockFetchPreferences.mockResolvedValue({
      preferences: {
        dashboard_layout: {
          tileOrder: [],
          hiddenTiles: [],
        },
      },
    })

    const store = useDashboardStore()
    await store.loadLayout()

    // Empty tileOrder means all defaults get appended
    expect(store.tileOrder).toEqual([...DEFAULT_TILE_ORDER])
    expect(store.hiddenTiles).toEqual([])
    expect(store.layoutLoaded).toBe(true)
  })

  // ── Debounce coalescing ────────────────────────────────────────

  it('rapid mutations coalesce into a single persist call', () => {
    mockUpdatePreferences.mockResolvedValue({ preferences: {} })
    const store = useDashboardStore()
    store.moveTile(store.tileOrder[0], 'down')
    store.hideTile(DEFAULT_TILE_ORDER[3])
    store.moveTile(store.tileOrder[2], 'up')
    // Only the last debounced call should fire
    vi.advanceTimersByTime(500)
    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1)
  })

  // ── editingLayout toggle ───────────────────────────────────────

  it('editingLayout can be toggled', () => {
    const store = useDashboardStore()
    expect(store.editingLayout).toBe(false)
    store.editingLayout = true
    expect(store.editingLayout).toBe(true)
    store.editingLayout = false
    expect(store.editingLayout).toBe(false)
  })

  // ── tileDefs computed ──────────────────────────────────────────

  it('tileDefs provides a Map keyed by tile ID', () => {
    const store = useDashboardStore()
    expect(store.tileDefs.size).toBe(DEFAULT_TILE_ORDER.length)
    for (const id of DEFAULT_TILE_ORDER) {
      expect(store.tileDefs.has(id)).toBe(true)
      expect(store.tileDefs.get(id)!.id).toBe(id)
    }
  })

  // ── tileWidths / getTileSpan / setTileWidth ────────────────────

  it('tileWidths defaults to empty object', () => {
    const store = useDashboardStore()
    expect(store.tileWidths).toEqual({})
  })

  it('getTileSpan returns the definition default when no override exists', () => {
    const store = useDashboardStore()
    for (const tile of DASHBOARD_TILES) {
      expect(store.getTileSpan(tile.id)).toBe(tile.span)
    }
  })

  it('setTileWidth sets an override and getTileSpan returns it', () => {
    const store = useDashboardStore()
    // calendar-heatmap defaults to span 1
    expect(store.getTileSpan('calendar-heatmap')).toBe(1)
    store.setTileWidth('calendar-heatmap', 2)
    expect(store.getTileSpan('calendar-heatmap')).toBe(2)
  })

  it('setTileWidth can shrink a full-width tile to half', () => {
    const store = useDashboardStore()
    // topic-trends defaults to span 2
    expect(store.getTileSpan('topic-trends')).toBe(2)
    store.setTileWidth('topic-trends', 1)
    expect(store.getTileSpan('topic-trends')).toBe(1)
  })

  it('setTileWidth triggers a debounced persist call', () => {
    mockUpdatePreferences.mockResolvedValue({ preferences: {} })
    const store = useDashboardStore()
    store.setTileWidth('calendar-heatmap', 2)
    expect(mockUpdatePreferences).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1)
    expect(mockUpdatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboard_layout: expect.objectContaining({
          tileWidths: { 'calendar-heatmap': 2 },
        }),
      }),
    )
  })

  it('persist includes tileWidths alongside tileOrder and hiddenTiles', () => {
    mockUpdatePreferences.mockResolvedValue({ preferences: {} })
    const store = useDashboardStore()
    store.setTileWidth('word-count', 2)
    vi.advanceTimersByTime(500)
    expect(mockUpdatePreferences).toHaveBeenCalledWith({
      dashboard_layout: {
        tileOrder: store.tileOrder,
        hiddenTiles: store.hiddenTiles,
        tileWidths: { 'word-count': 2 },
      },
    })
  })

  it('resetLayout clears tileWidths', () => {
    const store = useDashboardStore()
    store.setTileWidth('calendar-heatmap', 2)
    store.setTileWidth('topic-trends', 1)
    expect(Object.keys(store.tileWidths).length).toBe(2)

    store.resetLayout()
    expect(store.tileWidths).toEqual({})
  })

  it('store.reset() does NOT reset tileWidths', () => {
    const store = useDashboardStore()
    store.setTileWidth('calendar-heatmap', 2)
    const widthsBefore = { ...store.tileWidths }

    store.reset()
    expect(store.tileWidths).toEqual(widthsBefore)
  })

  it('loadLayout restores saved tileWidths', async () => {
    mockFetchPreferences.mockResolvedValue({
      preferences: {
        dashboard_layout: {
          tileOrder: [...DEFAULT_TILE_ORDER],
          hiddenTiles: [],
          tileWidths: { 'calendar-heatmap': 2, 'topic-trends': 1 },
        },
      },
    })

    const store = useDashboardStore()
    await store.loadLayout()

    expect(store.tileWidths).toEqual({
      'calendar-heatmap': 2,
      'topic-trends': 1,
    })
    expect(store.getTileSpan('calendar-heatmap')).toBe(2)
    expect(store.getTileSpan('topic-trends')).toBe(1)
  })

  it('loadLayout ignores invalid tileWidths entries', async () => {
    mockFetchPreferences.mockResolvedValue({
      preferences: {
        dashboard_layout: {
          tileOrder: [...DEFAULT_TILE_ORDER],
          hiddenTiles: [],
          tileWidths: {
            'calendar-heatmap': 2,
            'bogus-tile': 1,
            'word-count': 3,
          },
        },
      },
    })

    const store = useDashboardStore()
    await store.loadLayout()

    // Only valid ID + valid span kept
    expect(store.tileWidths).toEqual({ 'calendar-heatmap': 2 })
  })

  it('loadLayout handles missing tileWidths gracefully', async () => {
    mockFetchPreferences.mockResolvedValue({
      preferences: {
        dashboard_layout: {
          tileOrder: [...DEFAULT_TILE_ORDER],
          hiddenTiles: [],
        },
      },
    })

    const store = useDashboardStore()
    await store.loadLayout()

    expect(store.tileWidths).toEqual({})
  })
})
