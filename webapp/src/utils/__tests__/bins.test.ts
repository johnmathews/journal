import { describe, it, expect, vi, afterEach } from 'vitest'
import { fillBins, fillPeriods, alignToPeriodStart } from '../bins'
import type { WritingFrequencyBin } from '@/types/dashboard'

function bin(
  bin_start: string,
  entry_count = 1,
  total_words = 100,
): WritingFrequencyBin {
  return { bin_start, entry_count, total_words }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('alignToPeriodStart', () => {
  it('aligns a mid-week date down to its Monday', () => {
    // 2026-01-08 is a Thursday; its ISO week starts Monday 2026-01-05.
    expect(alignToPeriodStart('2026-01-08', 'week')).toBe('2026-01-05')
  })

  it('leaves a Monday unchanged for week bins', () => {
    expect(alignToPeriodStart('2026-01-05', 'week')).toBe('2026-01-05')
  })

  it('aligns a Sunday down to the previous Monday', () => {
    // 2026-01-11 is a Sunday — ISO weeks end on Sunday.
    expect(alignToPeriodStart('2026-01-11', 'week')).toBe('2026-01-05')
  })

  it('aligns month bins to the 1st', () => {
    expect(alignToPeriodStart('2026-03-17', 'month')).toBe('2026-03-01')
  })

  it('aligns quarter bins to the quarter start', () => {
    expect(alignToPeriodStart('2026-05-20', 'quarter')).toBe('2026-04-01')
    expect(alignToPeriodStart('2026-12-31', 'quarter')).toBe('2026-10-01')
  })

  it('aligns year bins to January 1st', () => {
    expect(alignToPeriodStart('2026-08-09', 'year')).toBe('2026-01-01')
  })
})

describe('fillPeriods', () => {
  it('fills missing weeks between from and to', () => {
    const result = fillPeriods(
      ['2026-01-05', '2026-02-02'],
      '2026-01-05',
      '2026-02-02',
      'week',
    )
    expect(result).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
      '2026-02-02',
    ])
  })

  it('aligns a mid-week from down to Monday so the grid matches server bins', () => {
    // from = Thursday 2026-01-08; the server's week bins are
    // Monday-aligned so the grid must start at 2026-01-05.
    const result = fillPeriods(
      ['2026-01-12'],
      '2026-01-08',
      '2026-01-19',
      'week',
    )
    expect(result).toEqual(['2026-01-05', '2026-01-12', '2026-01-19'])
  })

  it('extends past from/to to cover out-of-window server periods', () => {
    // Server periods may spill outside the requested window (a week
    // bucket whose Monday precedes `from`). Nothing is ever dropped.
    const result = fillPeriods(
      ['2025-12-29', '2026-01-26'],
      '2026-01-05',
      '2026-01-12',
      'week',
    )
    expect(result).toEqual([
      '2025-12-29',
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
    ])
  })

  it('preserves periods that do not fall on the generated grid', () => {
    // Defensive: if the server's alignment ever disagrees with ours,
    // its periods are unioned in rather than silently dropped.
    const result = fillPeriods(
      ['2026-01-07'],
      '2026-01-05',
      '2026-01-12',
      'week',
    )
    expect(result).toEqual(['2026-01-05', '2026-01-07', '2026-01-12'])
  })

  it('fills missing months', () => {
    const result = fillPeriods(
      ['2026-01-01', '2026-04-01'],
      '2026-01-15',
      '2026-04-30',
      'month',
    )
    expect(result).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ])
  })

  it('fills missing quarters', () => {
    const result = fillPeriods(
      ['2025-10-01'],
      '2025-10-01',
      '2026-05-20',
      'quarter',
    )
    expect(result).toEqual(['2025-10-01', '2026-01-01', '2026-04-01'])
  })

  it('fills missing years', () => {
    const result = fillPeriods(
      ['2024-01-01'],
      '2024-06-01',
      '2026-02-01',
      'year',
    )
    expect(result).toEqual(['2024-01-01', '2025-01-01', '2026-01-01'])
  })

  it('returns [] for empty input with a null from (range "all", no data)', () => {
    expect(fillPeriods([], null, '2026-01-05', 'week')).toEqual([])
  })

  it('generates the zero grid for empty input when from is given', () => {
    expect(fillPeriods([], '2026-01-05', '2026-01-19', 'week')).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
    ])
  })

  it('anchors at the earliest period when from is null (range "all")', () => {
    const result = fillPeriods(
      ['2026-01-19', '2026-01-05'],
      null,
      '2026-01-26',
      'week',
    )
    expect(result).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
    ])
  })

  it('defaults to today when to is null', () => {
    vi.useFakeTimers({
      now: new Date('2026-01-21T12:00:00Z'),
      toFake: ['Date'],
    })
    // Today (Wed 2026-01-21) is in the week of Monday 2026-01-19.
    const result = fillPeriods(['2026-01-05'], null, null, 'week')
    expect(result).toEqual(['2026-01-05', '2026-01-12', '2026-01-19'])
  })

  it('returns the lone period when from and to land in the same bucket', () => {
    expect(
      fillPeriods(['2026-01-05'], '2026-01-05', '2026-01-11', 'week'),
    ).toEqual(['2026-01-05'])
  })
})

describe('fillBins', () => {
  it('zero-fills empty middle weeks', () => {
    const result = fillBins(
      [bin('2026-01-05', 2, 250), bin('2026-02-02', 1, 80)],
      '2026-01-05',
      '2026-02-02',
      'week',
    )
    expect(result).toEqual([
      { bin_start: '2026-01-05', entry_count: 2, total_words: 250 },
      { bin_start: '2026-01-12', entry_count: 0, total_words: 0 },
      { bin_start: '2026-01-19', entry_count: 0, total_words: 0 },
      { bin_start: '2026-01-26', entry_count: 0, total_words: 0 },
      { bin_start: '2026-02-02', entry_count: 1, total_words: 80 },
    ])
  })

  it('zero-fills month bins', () => {
    const result = fillBins(
      [bin('2026-01-01', 5, 1000)],
      '2026-01-01',
      '2026-03-31',
      'month',
    )
    expect(result).toEqual([
      { bin_start: '2026-01-01', entry_count: 5, total_words: 1000 },
      { bin_start: '2026-02-01', entry_count: 0, total_words: 0 },
      { bin_start: '2026-03-01', entry_count: 0, total_words: 0 },
    ])
  })

  it('pads leading and trailing range edges with zero bins', () => {
    const result = fillBins(
      [bin('2026-01-19', 3, 300)],
      '2026-01-05',
      '2026-02-02',
      'week',
    )
    expect(result.map((b) => b.bin_start)).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
      '2026-02-02',
    ])
    expect(result.map((b) => b.entry_count)).toEqual([0, 0, 3, 0, 0])
  })

  it('returns [] for empty input with a null from', () => {
    expect(fillBins([], null, null, 'week')).toEqual([])
  })

  it('uses the earliest bin_start as the anchor when from is null', () => {
    vi.useFakeTimers({
      now: new Date('2026-01-23T12:00:00Z'),
      toFake: ['Date'],
    })
    const result = fillBins([bin('2026-01-05', 1, 50)], null, null, 'week')
    expect(result.map((b) => b.bin_start)).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
    ])
    expect(result[0]).toEqual({
      bin_start: '2026-01-05',
      entry_count: 1,
      total_words: 50,
    })
  })

  it('does not mutate the input array', () => {
    const input = [bin('2026-02-02'), bin('2026-01-05')]
    const snapshot = JSON.parse(JSON.stringify(input))
    fillBins(input, '2026-01-05', '2026-02-02', 'week')
    expect(input).toEqual(snapshot)
  })
})
