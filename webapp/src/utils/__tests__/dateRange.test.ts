import { describe, it, expect } from 'vitest'
import { presetToDates, SEARCH_RANGE_OPTIONS } from '../dateRange'

describe('SEARCH_RANGE_OPTIONS', () => {
  it('starts with All time and ends with Custom', () => {
    expect(SEARCH_RANGE_OPTIONS[0].value).toBe('all')
    expect(SEARCH_RANGE_OPTIONS[SEARCH_RANGE_OPTIONS.length - 1].value).toBe(
      'custom',
    )
  })

  it('has the documented preset set', () => {
    expect(SEARCH_RANGE_OPTIONS.map((o) => o.value)).toEqual([
      'all',
      'last_1_month',
      'last_3_months',
      'last_6_months',
      'last_1_year',
      'custom',
    ])
  })
})

describe('presetToDates', () => {
  // Mid-month anchor — avoids any month-end edge cases (e.g. Mar 31
  // - 1 month would clamp to Mar 3 in JS Date arithmetic).
  const NOW = new Date('2026-05-15T12:00:00Z')

  it('returns null/null for "all"', () => {
    expect(presetToDates('all', NOW)).toEqual({ from: null, to: null })
  })

  it('returns null/null for "custom" — caller owns the dates', () => {
    expect(presetToDates('custom', NOW)).toEqual({ from: null, to: null })
  })

  it('walks back one calendar month for last_1_month', () => {
    const { from, to } = presetToDates('last_1_month', NOW)
    expect(to).toBe('2026-05-15')
    expect(from).toBe('2026-04-15')
  })

  it('walks back three calendar months for last_3_months', () => {
    expect(presetToDates('last_3_months', NOW)).toEqual({
      from: '2026-02-15',
      to: '2026-05-15',
    })
  })

  it('walks back six calendar months for last_6_months', () => {
    expect(presetToDates('last_6_months', NOW)).toEqual({
      from: '2025-11-15',
      to: '2026-05-15',
    })
  })

  it('walks back one year for last_1_year', () => {
    expect(presetToDates('last_1_year', NOW)).toEqual({
      from: '2025-05-15',
      to: '2026-05-15',
    })
  })

  it('zero-pads single-digit months and days', () => {
    const { from, to } = presetToDates(
      'last_1_month',
      new Date('2026-02-05T12:00:00Z'),
    )
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
