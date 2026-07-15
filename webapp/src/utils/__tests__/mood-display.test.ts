import { describe, expect, it } from 'vitest'

import {
  DISPLAY_INVERTED_DIMENSIONS,
  displayLabel,
  displayPolarLabel,
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
  it('lists frustration and the two fatigue facets as inverted', () => {
    expect(DISPLAY_INVERTED_DIMENSIONS).toEqual({
      frustration: 'calm',
      physical_fatigue: 'physically fresh',
      mental_fatigue: 'mentally fresh',
    })
  })

  it('isDisplayInverted is true only for inverted dimensions', () => {
    expect(isDisplayInverted('frustration')).toBe(true)
    expect(isDisplayInverted('physical_fatigue')).toBe(true)
    expect(isDisplayInverted('mental_fatigue')).toBe(true)
    expect(isDisplayInverted('joy_sadness')).toBe(false)
    expect(isDisplayInverted('agency')).toBe(false)
    // Already high = good, so not inverted.
    expect(isDisplayInverted('energy_vigor')).toBe(false)
    expect(isDisplayInverted('tension_calm')).toBe(false)
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

  it('displayScore inverts unipolar fatigue facets via score_max - score', () => {
    const physical = {
      name: 'physical_fatigue',
      scale_type: 'unipolar' as const,
      score_max: 1,
    }
    const mental = {
      name: 'mental_fatigue',
      scale_type: 'unipolar' as const,
      score_max: 1,
    }
    expect(displayScore(physical, 0.8)).toBeCloseTo(0.2)
    expect(displayScore(physical, 0.0)).toBe(1.0)
    expect(displayScore(mental, 0.3)).toBeCloseTo(0.7)
    expect(displayScore(mental, null)).toBeNull()
  })

  it('displayScore passes energy_vigor and tension_calm through unchanged', () => {
    const vigor = { name: 'energy_vigor', score_max: 1 }
    const tension = { name: 'tension_calm', score_max: 1 }
    expect(displayScore(vigor, 0.6)).toBe(0.6)
    expect(displayScore(tension, -0.4)).toBe(-0.4)
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

  it('displayPolarLabel renders both poles for a bipolar dimension', () => {
    const joySad = {
      name: 'joy_sadness',
      positive_pole: 'joy',
      negative_pole: 'sadness',
      scale_type: 'bipolar' as const,
    }
    expect(displayPolarLabel(joySad)).toBe('joy ↔ sadness')
  })

  it('displayPolarLabel returns a single pole for a unipolar dimension', () => {
    const agency = {
      name: 'agency',
      positive_pole: 'agency',
      negative_pole: 'apathy',
      scale_type: 'unipolar' as const,
    }
    // Single pole is honest for unipolar (0 = absence, not the opposite).
    expect(displayPolarLabel(agency)).toBe('agency')
    // Inverted unipolar still uses the display label, no arrow.
    const frustrationUni = {
      name: 'frustration',
      positive_pole: 'frustrated',
      negative_pole: 'calm',
      scale_type: 'unipolar' as const,
    }
    expect(displayPolarLabel(frustrationUni)).toBe('calm')
  })

  it('displayPolarLabel swaps pole order for an inverted bipolar dimension', () => {
    // Hypothetical: a bipolar dimension that is also display-inverted.
    // frustration is in the inverted map, so treat it as bipolar here.
    const invertedBipolar = {
      name: 'frustration',
      positive_pole: 'frustrated',
      negative_pole: 'calm',
      scale_type: 'bipolar' as const,
    }
    // The displayed-good pole (negative_pole after inversion) reads first.
    expect(displayPolarLabel(invertedBipolar)).toBe('calm ↔ frustrated')
  })
})
