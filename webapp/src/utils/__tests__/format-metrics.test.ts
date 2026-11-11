import { describe, it, expect } from 'vitest'
import {
  formatDurationSeconds,
  formatTokens,
  formatUsd,
} from '../format-metrics'

describe('formatDurationSeconds', () => {
  it('shows seconds only for durations under a minute', () => {
    expect(formatDurationSeconds(0)).toBe('0s')
    expect(formatDurationSeconds(12)).toBe('12s')
    expect(formatDurationSeconds(59)).toBe('59s')
  })

  it('floors fractional seconds', () => {
    expect(formatDurationSeconds(12.9)).toBe('12s')
  })

  it('shows minutes and zero-padded seconds at or above a minute', () => {
    expect(formatDurationSeconds(60)).toBe('1m 00s')
    expect(formatDurationSeconds(64)).toBe('1m 04s')
    expect(formatDurationSeconds(125)).toBe('2m 05s')
    expect(formatDurationSeconds(659)).toBe('10m 59s')
  })

  it('returns a dash for negative or NaN input', () => {
    expect(formatDurationSeconds(-1)).toBe('-')
    expect(formatDurationSeconds(NaN)).toBe('-')
  })
})

describe('formatTokens', () => {
  it('returns an em dash for null or undefined', () => {
    expect(formatTokens(null)).toBe('—')
    expect(formatTokens(undefined)).toBe('—')
  })

  it('shows the raw integer under 1000', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(1)).toBe('1')
    expect(formatTokens(999)).toBe('999')
  })

  it('shows one-decimal thousands at or above 1000', () => {
    expect(formatTokens(1000)).toBe('1.0k')
    expect(formatTokens(1200)).toBe('1.2k')
    expect(formatTokens(15400)).toBe('15.4k')
  })
})

describe('formatUsd', () => {
  it('returns an em dash for null or undefined', () => {
    expect(formatUsd(null)).toBe('—')
    expect(formatUsd(undefined)).toBe('—')
  })

  it('shows $0.00 for exactly zero', () => {
    expect(formatUsd(0)).toBe('$0.00')
  })

  it('shows four decimals for costs under a dollar', () => {
    expect(formatUsd(0.0123)).toBe('$0.0123')
    expect(formatUsd(0.5)).toBe('$0.5000')
  })

  it('shows two decimals for costs at or above a dollar', () => {
    expect(formatUsd(1)).toBe('$1.00')
    expect(formatUsd(1.23)).toBe('$1.23')
    expect(formatUsd(12.5)).toBe('$12.50')
  })
})
