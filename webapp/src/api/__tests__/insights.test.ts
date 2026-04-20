import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchMoodDrilldown, fetchEntityDistribution } from '../insights'

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

describe('insights API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchMoodDrilldown', () => {
    it('builds the expected URL with all params', async () => {
      mockApiFetch.mockResolvedValue({
        dimension: 'agency',
        from: '2026-04-14',
        to: '2026-04-20',
        entries: [],
      })
      await fetchMoodDrilldown({
        dimension: 'agency',
        from: '2026-04-14',
        to: '2026-04-20',
      })
      const url = mockApiFetch.mock.calls[0][0] as string
      expect(url.startsWith('/api/dashboard/mood-drilldown?')).toBe(true)
      expect(url).toContain('dimension=agency')
      expect(url).toContain('from=2026-04-14')
      expect(url).toContain('to=2026-04-20')
    })

    it('returns the response body unchanged', async () => {
      const payload = {
        dimension: 'agency',
        from: '2026-04-14',
        to: '2026-04-20',
        entries: [
          {
            entry_id: 42,
            entry_date: '2026-04-15',
            score: 0.72,
            confidence: 0.88,
            rationale: 'Took initiative on the project.',
          },
        ],
      }
      mockApiFetch.mockResolvedValue(payload)
      const result = await fetchMoodDrilldown({
        dimension: 'agency',
        from: '2026-04-14',
        to: '2026-04-20',
      })
      expect(result).toEqual(payload)
    })
  })

  describe('fetchEntityDistribution', () => {
    it('builds the expected URL with all params', async () => {
      mockApiFetch.mockResolvedValue({
        type: 'topic',
        from: '2026-01-01',
        to: '2026-04-20',
        total: 0,
        items: [],
      })
      await fetchEntityDistribution({
        type: 'topic',
        from: '2026-01-01',
        to: '2026-04-20',
        limit: 30,
      })
      const url = mockApiFetch.mock.calls[0][0] as string
      expect(url.startsWith('/api/dashboard/entity-distribution?')).toBe(true)
      expect(url).toContain('type=topic')
      expect(url).toContain('from=2026-01-01')
      expect(url).toContain('to=2026-04-20')
      expect(url).toContain('limit=30')
    })

    it('calls base endpoint when no params supplied', async () => {
      mockApiFetch.mockResolvedValue({
        type: null,
        from: null,
        to: null,
        total: 0,
        items: [],
      })
      await fetchEntityDistribution()
      expect(mockApiFetch).toHaveBeenCalledWith('/api/dashboard/entity-distribution')
    })

    it('returns the response body unchanged', async () => {
      const payload = {
        type: 'topic',
        from: '2026-01-01',
        to: '2026-04-20',
        total: 2,
        items: [
          { canonical_name: 'meditation', entity_type: 'topic', mention_count: 14 },
          { canonical_name: 'running', entity_type: 'topic', mention_count: 9 },
        ],
      }
      mockApiFetch.mockResolvedValue(payload)
      const result = await fetchEntityDistribution({ type: 'topic' })
      expect(result).toEqual(payload)
    })
  })
})
