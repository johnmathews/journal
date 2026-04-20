import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useInsightsStore } from '../insights'
import { ApiRequestError } from '@/api/client'

vi.mock('@/api/insights', () => ({
  fetchMoodDimensions: vi.fn(),
  fetchMoodTrends: vi.fn(),
  fetchMoodDrilldown: vi.fn(),
  fetchEntityDistribution: vi.fn(),
}))

import {
  fetchMoodDimensions,
  fetchMoodTrends,
  fetchMoodDrilldown,
  fetchEntityDistribution,
} from '@/api/insights'

const mockMoodDims = vi.mocked(fetchMoodDimensions)
const mockMoodTrends = vi.mocked(fetchMoodTrends)
const mockDrilldown = vi.mocked(fetchMoodDrilldown)
const mockEntityDist = vi.mocked(fetchEntityDistribution)

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

describe('insights store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('has correct initial state', () => {
    const store = useInsightsStore()
    expect(store.range).toBe('last_3_months')
    expect(store.bin).toBe('week')
    expect(store.moodDimensions).toEqual([])
    expect(store.moodBins).toEqual([])
    expect(store.drillPeriod).toBeNull()
    expect(store.drillDimension).toBeNull()
    expect(store.drillEntries).toEqual([])
    expect(store.entityType).toBe('topic')
    expect(store.entityDistribution).toEqual([])
  })

  describe('loadMoodDimensions', () => {
    it('populates moodDimensions on success', async () => {
      mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
      const store = useInsightsStore()
      await store.loadMoodDimensions()
      expect(store.moodDimensions).toEqual(fakeDimensions)
      expect(store.moodScoringEnabled).toBe(true)
    })

    it('defaults to isolating agency on first load', async () => {
      mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
      const store = useInsightsStore()
      await store.loadMoodDimensions()
      expect(store.hiddenMoodDimensions.has('joy_sadness')).toBe(true)
      expect(store.hiddenMoodDimensions.has('agency')).toBe(false)
    })

    it('swallows errors gracefully', async () => {
      mockMoodDims.mockRejectedValue(new Error('fail'))
      const store = useInsightsStore()
      await store.loadMoodDimensions()
      expect(store.moodDimensions).toEqual([])
      expect(store.moodScoringEnabled).toBe(false)
    })
  })

  describe('loadMoodTrends', () => {
    it('populates moodBins on success', async () => {
      mockMoodTrends.mockResolvedValue({
        from: null,
        to: null,
        bin: 'week',
        bins: [
          {
            period: '2026-04-14',
            dimension: 'agency',
            avg_score: 0.7,
            entry_count: 3,
            score_min: 0.5,
            score_max: 0.9,
          },
        ],
      })
      const store = useInsightsStore()
      await store.loadMoodTrends()
      expect(store.moodBins).toHaveLength(1)
      expect(store.hasMoodData).toBe(true)
      expect(store.moodHasLoaded).toBe(true)
    })

    it('surfaces ApiRequestError message', async () => {
      mockMoodTrends.mockRejectedValue(
        new ApiRequestError(400, 'invalid_bin', 'bad bin'),
      )
      const store = useInsightsStore()
      await store.loadMoodTrends()
      expect(store.moodError).toBe('bad bin')
      expect(store.moodBins).toEqual([])
    })
  })

  describe('loadDrillDown', () => {
    it('populates drill-down state on success', async () => {
      mockDrilldown.mockResolvedValue({
        dimension: 'agency',
        from: '2026-04-14',
        to: '2026-04-20',
        entries: [
          {
            entry_id: 42,
            entry_date: '2026-04-15',
            score: 0.72,
            confidence: 0.88,
            rationale: 'Took initiative.',
          },
        ],
      })
      const store = useInsightsStore()
      await store.loadDrillDown('2026-04-14', 'agency')
      expect(store.drillPeriod).toBe('2026-04-14')
      expect(store.drillDimension).toBe('agency')
      expect(store.drillEntries).toHaveLength(1)
      expect(store.drillEntries[0].rationale).toBe('Took initiative.')
    })

    it('surfaces errors', async () => {
      mockDrilldown.mockRejectedValue(new Error('network error'))
      const store = useInsightsStore()
      await store.loadDrillDown('2026-04-14', 'agency')
      expect(store.drillError).toBe('network error')
      expect(store.drillEntries).toEqual([])
    })
  })

  describe('clearDrillDown', () => {
    it('resets drill-down state', async () => {
      mockDrilldown.mockResolvedValue({
        dimension: 'agency',
        from: '2026-04-14',
        to: '2026-04-20',
        entries: [
          {
            entry_id: 42,
            entry_date: '2026-04-15',
            score: 0.72,
            confidence: null,
            rationale: null,
          },
        ],
      })
      const store = useInsightsStore()
      await store.loadDrillDown('2026-04-14', 'agency')
      store.clearDrillDown()
      expect(store.drillPeriod).toBeNull()
      expect(store.drillDimension).toBeNull()
      expect(store.drillEntries).toEqual([])
    })
  })

  describe('loadEntityDistribution', () => {
    it('populates entity distribution on success', async () => {
      mockEntityDist.mockResolvedValue({
        type: 'topic',
        from: null,
        to: null,
        total: 2,
        items: [
          { canonical_name: 'meditation', entity_type: 'topic', mention_count: 14 },
          { canonical_name: 'running', entity_type: 'topic', mention_count: 9 },
        ],
      })
      const store = useInsightsStore()
      await store.loadEntityDistribution('topic')
      expect(store.entityDistribution).toHaveLength(2)
      expect(store.entityType).toBe('topic')
      expect(store.entityHasLoaded).toBe(true)
    })

    it('surfaces errors', async () => {
      mockEntityDist.mockRejectedValue(
        new ApiRequestError(400, 'invalid_type', 'bad type'),
      )
      const store = useInsightsStore()
      await store.loadEntityDistribution()
      expect(store.entityError).toBe('bad type')
      expect(store.entityDistribution).toEqual([])
    })
  })

  describe('toggleMoodDimension', () => {
    it('isolates clicked dimension', async () => {
      mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
      const store = useInsightsStore()
      await store.loadMoodDimensions()
      // Currently agency is isolated. Click joy_sadness → isolate it.
      store.toggleMoodDimension('joy_sadness')
      expect(store.hiddenMoodDimensions.has('agency')).toBe(true)
      expect(store.hiddenMoodDimensions.has('joy_sadness')).toBe(false)
    })

    it('restores all when clicking isolated dimension', async () => {
      mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
      const store = useInsightsStore()
      await store.loadMoodDimensions()
      // Agency is isolated. Click agency → restore all.
      store.toggleMoodDimension('agency')
      expect(store.hiddenMoodDimensions.size).toBe(0)
    })
  })

  describe('periodEndDate', () => {
    it('computes week end', () => {
      const store = useInsightsStore()
      expect(store.periodEndDate('2026-04-14', 'week')).toBe('2026-04-20')
    })

    it('computes month end', () => {
      const store = useInsightsStore()
      expect(store.periodEndDate('2026-04-01', 'month')).toBe('2026-04-30')
    })

    it('computes quarter end', () => {
      const store = useInsightsStore()
      expect(store.periodEndDate('2026-04-01', 'quarter')).toBe('2026-06-30')
    })

    it('computes year end', () => {
      const store = useInsightsStore()
      expect(store.periodEndDate('2026-01-01', 'year')).toBe('2026-12-31')
    })
  })

  describe('reset', () => {
    it('resets all state', async () => {
      mockMoodDims.mockResolvedValue({ dimensions: fakeDimensions })
      mockMoodTrends.mockResolvedValue({
        from: null,
        to: null,
        bin: 'week',
        bins: [
          {
            period: '2026-04-14',
            dimension: 'agency',
            avg_score: 0.7,
            entry_count: 1,
            score_min: 0.7,
            score_max: 0.7,
          },
        ],
      })
      mockEntityDist.mockResolvedValue({
        type: 'topic',
        from: null,
        to: null,
        total: 1,
        items: [{ canonical_name: 'x', entity_type: 'topic', mention_count: 1 }],
      })
      const store = useInsightsStore()
      await store.loadMoodDimensions()
      await store.loadMoodTrends()
      await store.loadEntityDistribution()
      store.reset()
      expect(store.moodDimensions).toEqual([])
      expect(store.moodBins).toEqual([])
      expect(store.entityDistribution).toEqual([])
      expect(store.entityHasLoaded).toBe(false)
      expect(store.moodHasLoaded).toBe(false)
    })
  })
})
