import { describe, expect, it } from 'vitest'

import {
  DISPLAY_INVERTED_DIMENSIONS,
  displayLabel,
  displayScore,
  isDisplayInverted,
} from '@/utils/mood-display'

const frustration = {
  name: 'frustration',
  positive_pole: 'frustrated',
  score_max: 1.0,
}

const joy = {
  name: 'joy_sadness',
  positive_pole: 'joy',
  score_max: 1.0,
}

describe('mood-display', () => {
  it('lists frustration as the only inverted dimension', () => {
    expect(DISPLAY_INVERTED_DIMENSIONS).toEqual({ frustration: 'calm' })
  })

  it('isDisplayInverted is true only for inverted dimensions', () => {
    expect(isDisplayInverted('frustration')).toBe(true)
    expect(isDisplayInverted('joy_sadness')).toBe(false)
    expect(isDisplayInverted('agency')).toBe(false)
  })

  it('displayLabel overrides positive_pole for inverted dimensions', () => {
    expect(displayLabel(frustration)).toBe('calm')
  })

  it('displayLabel returns positive_pole unchanged for non-inverted', () => {
    expect(displayLabel(joy)).toBe('joy')
  })

  it('displayScore inverts unipolar frustration scores', () => {
    expect(displayScore(frustration, 0.0)).toBe(1.0)
    expect(displayScore(frustration, 0.25)).toBe(0.75)
    expect(displayScore(frustration, 1.0)).toBe(0.0)
  })

  it('displayScore passes non-inverted dimensions through', () => {
    expect(displayScore(joy, 0.4)).toBe(0.4)
    expect(displayScore(joy, -0.7)).toBe(-0.7)
    expect(displayScore(joy, 0)).toBe(0)
  })

  it('displayScore preserves null in both branches', () => {
    expect(displayScore(frustration, null)).toBeNull()
    expect(displayScore(joy, null)).toBeNull()
  })
})
