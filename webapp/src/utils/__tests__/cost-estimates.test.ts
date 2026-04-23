import { describe, it, expect } from 'vitest'
import {
  ocrCostPerPage,
  ocrCostPer1000Words,
  transcriptionCostPerMinute,
  audioCostPer1000Words,
  chunkingCostPerEntry,
  moodScoringCostPerEntry,
  entityExtractionCostPerEntry,
  formatCost,
} from '../cost-estimates'

describe('cost-estimates', () => {
  describe('ocrCostPerPage', () => {
    it('computes Gemini 2.5 Pro cost per page', () => {
      const cost = ocrCostPerPage('gemini-2.5-pro')!
      // 2100 * 1.25/1M + 800 * 10.0/1M = 0.002625 + 0.008 = 0.010625
      expect(cost).toBeCloseTo(0.010625, 4)
    })

    it('computes Claude Opus cost per page', () => {
      const cost = ocrCostPerPage('claude-opus-4-6')!
      // 2100 * 5.0/1M + 800 * 25.0/1M = 0.0105 + 0.02 = 0.0305
      expect(cost).toBeCloseTo(0.0305, 4)
    })

    it('returns null for unknown model', () => {
      expect(ocrCostPerPage('unknown-model')).toBeNull()
    })
  })

  describe('transcriptionCostPerMinute', () => {
    it('returns gpt-4o-transcribe pricing', () => {
      expect(transcriptionCostPerMinute('gpt-4o-transcribe')).toBe(0.006)
    })

    it('returns null for unknown model', () => {
      expect(transcriptionCostPerMinute('unknown')).toBeNull()
    })
  })

  describe('chunkingCostPerEntry', () => {
    it('computes embedding cost for chunking', () => {
      const cost = chunkingCostPerEntry('text-embedding-3-large')!
      // (650 + 850) * 0.13/1M = 0.000195
      expect(cost).toBeCloseTo(0.000195, 6)
    })

    it('returns null for unknown model', () => {
      expect(chunkingCostPerEntry('unknown')).toBeNull()
    })
  })

  describe('moodScoringCostPerEntry', () => {
    it('computes Sonnet 4.5 mood scoring cost', () => {
      const cost = moodScoringCostPerEntry('claude-sonnet-4-5')!
      // 1750 * 3.0/1M + 200 * 15.0/1M = 0.00525 + 0.003 = 0.00825
      expect(cost).toBeCloseTo(0.00825, 5)
    })

    it('returns null for unknown model', () => {
      expect(moodScoringCostPerEntry('unknown')).toBeNull()
    })
  })

  describe('entityExtractionCostPerEntry', () => {
    it('computes Opus extraction + embedding dedup cost', () => {
      const cost = entityExtractionCostPerEntry(
        'claude-opus-4-6',
        'text-embedding-3-large',
      )!
      // LLM: 1550 * 5.0/1M + 500 * 25.0/1M = 0.00775 + 0.0125 = 0.02025
      // Dedup: 30 * 0.13/1M = 0.0000039
      expect(cost).toBeCloseTo(0.02025, 4)
    })

    it('returns null if extraction model is unknown', () => {
      expect(
        entityExtractionCostPerEntry('unknown', 'text-embedding-3-large'),
      ).toBeNull()
    })

    it('returns null if embedding model is unknown', () => {
      expect(
        entityExtractionCostPerEntry('claude-opus-4-6', 'unknown'),
      ).toBeNull()
    })
  })

  describe('ocrCostPer1000Words', () => {
    it('scales page cost by words-per-page factor', () => {
      const perPage = ocrCostPerPage('gemini-2.5-pro')!
      const per1k = ocrCostPer1000Words('gemini-2.5-pro')!
      // 1000 / 300 words per page ≈ 3.333 pages
      expect(per1k).toBeCloseTo(perPage * (1000 / 300), 4)
    })

    it('returns null for unknown model', () => {
      expect(ocrCostPer1000Words('unknown')).toBeNull()
    })
  })

  describe('audioCostPer1000Words', () => {
    it('computes transcription-only cost without formatting', () => {
      const cost = audioCostPer1000Words('gpt-4o-transcribe', false, null)!
      // 1000/150 minutes * $0.006/min ≈ $0.04
      expect(cost).toBeCloseTo(0.04, 2)
    })

    it('adds formatting cost when enabled', () => {
      const withoutFormatting = audioCostPer1000Words(
        'gpt-4o-transcribe',
        false,
        null,
      )!
      const withFormatting = audioCostPer1000Words(
        'gpt-4o-transcribe',
        true,
        'claude-haiku-4-5',
      )!
      expect(withFormatting).toBeGreaterThan(withoutFormatting)
    })

    it('returns transcription-only cost when formatting model is unknown', () => {
      const cost = audioCostPer1000Words(
        'gpt-4o-transcribe',
        true,
        'unknown-model',
      )!
      const baseOnly = audioCostPer1000Words('gpt-4o-transcribe', false, null)!
      expect(cost).toBeCloseTo(baseOnly, 4)
    })

    it('returns null for unknown transcription model', () => {
      expect(audioCostPer1000Words('unknown', false, null)).toBeNull()
    })
  })

  describe('formatCost', () => {
    it('formats null as dash', () => {
      expect(formatCost(null)).toBe('—')
    })

    it('formats sub-0.001 costs', () => {
      expect(formatCost(0.0001)).toBe('<$0.001')
    })

    it('formats small costs with 3 decimals', () => {
      expect(formatCost(0.008)).toBe('~$0.008')
    })

    it('formats larger costs with 2 decimals', () => {
      expect(formatCost(0.02)).toBe('~$0.02')
    })
  })
})
