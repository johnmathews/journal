import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchCalendarHeatmap,
  fetchEntityTrends,
  fetchMoodDimensions,
  fetchMoodEntityCorrelation,
  fetchMoodTrends,
  fetchWordCountDistribution,
  fetchWritingStats,
} from '../dashboard'

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

describe('mood dashboard API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchMoodDimensions', () => {
    it('calls the mood-dimensions endpoint without params', async () => {
      mockApiFetch.mockResolvedValue({ dimensions: [] })
      await fetchMoodDimensions()
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/dashboard/mood-dimensions',
      )
    })

    it('returns the response body unchanged', async () => {
      const payload = {
        dimensions: [
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
        ],
      }
      mockApiFetch.mockResolvedValue(payload)
      const result = await fetchMoodDimensions()
      expect(result).toEqual(payload)
    })
  })

  describe('fetchMoodTrends', () => {
    it('builds the expected URL with every param set', async () => {
      mockApiFetch.mockResolvedValue({
        from: '2026-01-01',
        to: '2026-04-11',
        bin: 'week',
        bins: [],
      })
      await fetchMoodTrends({
        bin: 'week',
        from: '2026-01-01',
        to: '2026-04-11',
        dimension: 'joy_sadness',
      })
      const url = mockApiFetch.mock.calls[0][0] as string
      expect(url.startsWith('/api/dashboard/mood-trends?')).toBe(true)
      expect(url).toContain('bin=week')
      expect(url).toContain('from=2026-01-01')
      expect(url).toContain('to=2026-04-11')
      expect(url).toContain('dimension=joy_sadness')
    })

    it('omits null dimension from the URL', async () => {
      mockApiFetch.mockResolvedValue({
        from: null,
        to: null,
        bin: 'week',
        bins: [],
      })
      await fetchMoodTrends({ bin: 'week', dimension: null })
      const url = mockApiFetch.mock.calls[0][0] as string
      expect(url).toContain('bin=week')
      expect(url).not.toContain('dimension')
    })

    it('calls the base endpoint when no params are supplied', async () => {
      mockApiFetch.mockResolvedValue({
        from: null,
        to: null,
        bin: 'week',
        bins: [],
      })
      await fetchMoodTrends()
      expect(mockApiFetch).toHaveBeenCalledWith('/api/dashboard/mood-trends')
    })
  })
})

describe('calendar heatmap API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the expected URL with every param set', async () => {
    mockApiFetch.mockResolvedValue({
      from: '2026-01-01',
      to: '2026-04-11',
      days: [],
    })
    await fetchCalendarHeatmap({ from: '2026-01-01', to: '2026-04-11' })
    const url = mockApiFetch.mock.calls[0][0] as string
    expect(url.startsWith('/api/dashboard/calendar-heatmap?')).toBe(true)
    expect(url).toContain('from=2026-01-01')
    expect(url).toContain('to=2026-04-11')
  })

  it('calls the base endpoint with no params when none are supplied', async () => {
    mockApiFetch.mockResolvedValue({
      from: '2026-01-01',
      to: '2026-04-11',
      days: [],
    })
    await fetchCalendarHeatmap()
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/dashboard/calendar-heatmap',
    )
  })

  it('returns the response body unchanged', async () => {
    const payload = {
      from: '2026-01-01',
      to: '2026-04-11',
      days: [{ date: '2026-01-05', entry_count: 2, total_words: 300 }],
    }
    mockApiFetch.mockResolvedValue(payload)
    const result = await fetchCalendarHeatmap({ from: '2026-01-01' })
    expect(result).toEqual(payload)
  })
})

describe('entity trends API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the expected URL with every param set', async () => {
    mockApiFetch.mockResolvedValue({
      from: '2026-01-01',
      to: '2026-04-11',
      bin: 'week',
      entity_type: 'topic',
      entities: [],
      bins: [],
    })
    await fetchEntityTrends({
      bin: 'week',
      from: '2026-01-01',
      to: '2026-04-11',
      type: 'topic',
      limit: 8,
    })
    const url = mockApiFetch.mock.calls[0][0] as string
    expect(url.startsWith('/api/dashboard/entity-trends?')).toBe(true)
    expect(url).toContain('bin=week')
    expect(url).toContain('from=2026-01-01')
    expect(url).toContain('to=2026-04-11')
    expect(url).toContain('type=topic')
    expect(url).toContain('limit=8')
  })

  it('calls the base endpoint with no params when none are supplied', async () => {
    mockApiFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'topic',
      entities: [],
      bins: [],
    })
    await fetchEntityTrends()
    expect(mockApiFetch).toHaveBeenCalledWith('/api/dashboard/entity-trends')
  })

  it('returns the response body unchanged', async () => {
    const payload = {
      from: null,
      to: null,
      bin: 'week' as const,
      entity_type: 'topic',
      entities: ['meditation', 'running'],
      bins: [
        { period: '2026-03-02', entity: 'meditation', mention_count: 5 },
      ],
    }
    mockApiFetch.mockResolvedValue(payload)
    const result = await fetchEntityTrends({ type: 'topic' })
    expect(result).toEqual(payload)
  })
})

describe('mood-entity correlation API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the expected URL with every param set', async () => {
    mockApiFetch.mockResolvedValue({
      dimension: 'agency',
      from: '2026-01-01',
      to: '2026-04-11',
      entity_type: 'person',
      overall_avg: 0.5,
      items: [],
    })
    await fetchMoodEntityCorrelation({
      dimension: 'agency',
      from: '2026-01-01',
      to: '2026-04-11',
      type: 'person',
      limit: 10,
    })
    const url = mockApiFetch.mock.calls[0][0] as string
    expect(url.startsWith('/api/dashboard/mood-entity-correlation?')).toBe(
      true,
    )
    expect(url).toContain('dimension=agency')
    expect(url).toContain('from=2026-01-01')
    expect(url).toContain('to=2026-04-11')
    expect(url).toContain('type=person')
    expect(url).toContain('limit=10')
  })

  it('calls the base endpoint with no params when none are supplied', async () => {
    mockApiFetch.mockResolvedValue({
      dimension: 'agency',
      from: null,
      to: null,
      entity_type: 'person',
      overall_avg: 0,
      items: [],
    })
    await fetchMoodEntityCorrelation()
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/dashboard/mood-entity-correlation',
    )
  })

  it('returns the response body unchanged', async () => {
    const payload = {
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
      ],
    }
    mockApiFetch.mockResolvedValue(payload)
    const result = await fetchMoodEntityCorrelation({ dimension: 'agency' })
    expect(result).toEqual(payload)
  })
})

describe('word count distribution API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the expected URL with every param set', async () => {
    mockApiFetch.mockResolvedValue({
      from: '2026-01-01',
      to: '2026-04-11',
      bucket_size: 100,
      buckets: [],
      stats: { min: 0, max: 0, avg: 0, median: 0, total_entries: 0 },
    })
    await fetchWordCountDistribution({
      from: '2026-01-01',
      to: '2026-04-11',
      bucket_size: 100,
    })
    const url = mockApiFetch.mock.calls[0][0] as string
    expect(url.startsWith('/api/dashboard/word-count-distribution?')).toBe(
      true,
    )
    expect(url).toContain('from=2026-01-01')
    expect(url).toContain('to=2026-04-11')
    expect(url).toContain('bucket_size=100')
  })

  it('calls the base endpoint with no params when none are supplied', async () => {
    mockApiFetch.mockResolvedValue({
      from: null,
      to: null,
      bucket_size: 100,
      buckets: [],
      stats: { min: 0, max: 0, avg: 0, median: 0, total_entries: 0 },
    })
    await fetchWordCountDistribution()
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/dashboard/word-count-distribution',
    )
  })

  it('returns the response body unchanged', async () => {
    const payload = {
      from: null,
      to: null,
      bucket_size: 100,
      buckets: [{ range_start: 0, range_end: 100, count: 12 }],
      stats: { min: 42, max: 980, avg: 350, median: 310, total_entries: 50 },
    }
    mockApiFetch.mockResolvedValue(payload)
    const result = await fetchWordCountDistribution({ bucket_size: 100 })
    expect(result).toEqual(payload)
  })
})
