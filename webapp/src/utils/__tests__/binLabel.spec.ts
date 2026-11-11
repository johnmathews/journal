import { describe, it, expect } from 'vitest'
import { formatBinLabel } from '../binLabel'

describe('formatBinLabel', () => {
  it('formats week bins as day + short month (default bin)', () => {
    // Locale-dependent order ("21 Apr" vs "Apr 21"), so assert the parts
    // rather than an exact string.
    const label = formatBinLabel('2026-04-21', 'week')
    expect(label).toMatch(/Apr/)
    expect(label).toMatch(/21/)
    expect(label).not.toBe('2026-04-21')
    // 'week' is the default granularity.
    expect(formatBinLabel('2026-04-21')).toBe(label)
  })

  it('formats month bins as short month + year', () => {
    const label = formatBinLabel('2026-04-01', 'month')
    expect(label).toMatch(/Apr/)
    expect(label).toMatch(/2026/)
    expect(label).not.toMatch(/\b1\b/) // no day-of-month
  })

  it('formats quarter bins as Q<n> <year>, locale-independent', () => {
    expect(formatBinLabel('2026-01-15', 'quarter')).toBe('Q1 2026')
    expect(formatBinLabel('2026-04-01', 'quarter')).toBe('Q2 2026')
    expect(formatBinLabel('2026-07-31', 'quarter')).toBe('Q3 2026')
    expect(formatBinLabel('2026-12-01', 'quarter')).toBe('Q4 2026')
  })

  it('formats year bins as the bare year', () => {
    expect(formatBinLabel('2026-06-15', 'year')).toBe('2026')
  })

  it('renders in UTC so the day never drifts by timezone', () => {
    // Parsed at 00:00Z: a naive local parse could roll back to 30 Apr for
    // viewers west of UTC. Pinning UTC keeps it on 1 May.
    const label = formatBinLabel('2026-05-01', 'week')
    expect(label).toMatch(/May/)
    expect(label).toMatch(/\b1\b/)
  })
})
