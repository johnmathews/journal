import { describe, it, expect } from 'vitest'
import { groupDimensions, MOOD_GROUPS } from '@/utils/mood-groups'
import type { MoodDimension } from '@/types/dashboard'

function dim(
  name: string,
  scale: 'bipolar' | 'unipolar' = 'bipolar',
): MoodDimension {
  return {
    name,
    positive_pole: name,
    negative_pole: 'opposite',
    scale_type: scale,
    score_min: scale === 'bipolar' ? -1 : 0,
    score_max: 1,
    notes: '',
  }
}

describe('groupDimensions', () => {
  it('preserves the four canonical groups in toml order', () => {
    const dimensions = [
      dim('joy_sadness'),
      dim('energy_fatigue'),
      dim('agency', 'unipolar'),
      dim('fulfillment', 'unipolar'),
      dim('connection', 'unipolar'),
      dim('frustration', 'unipolar'),
      dim('proactive_reactive'),
    ]
    const result = groupDimensions(dimensions)
    expect(result.map((g) => g.group.id)).toEqual([
      'affect',
      'needs',
      'negative',
      'stance',
    ])
    expect(result[0].members.map((d) => d.name)).toEqual([
      'joy_sadness',
      'energy_fatigue',
    ])
    expect(result[1].members.map((d) => d.name)).toEqual([
      'agency',
      'fulfillment',
      'connection',
    ])
    expect(result[2].members.map((d) => d.name)).toEqual(['frustration'])
    expect(result[3].members.map((d) => d.name)).toEqual(['proactive_reactive'])
  })

  it('omits groups whose members are absent from the input', () => {
    const result = groupDimensions([
      dim('joy_sadness'),
      dim('agency', 'unipolar'),
    ])
    expect(result.map((g) => g.group.id)).toEqual(['affect', 'needs'])
    expect(result[0].members).toHaveLength(1)
    expect(result[1].members).toHaveLength(1)
  })

  it('drops missing members from a partially-present group', () => {
    const result = groupDimensions([dim('agency', 'unipolar')])
    expect(result).toHaveLength(1)
    expect(result[0].group.id).toBe('needs')
    expect(result[0].members.map((d) => d.name)).toEqual(['agency'])
  })

  it('places ungrouped dimensions in a trailing "other" bucket', () => {
    const result = groupDimensions([
      dim('agency', 'unipolar'),
      dim('mystery_facet'),
    ])
    expect(result.map((g) => g.group.id)).toEqual(['needs', 'other'])
    expect(result[1].members.map((d) => d.name)).toEqual(['mystery_facet'])
    expect(result[1].group.label).toBe('')
  })

  it('does not produce an "other" bucket when every dimension is mapped', () => {
    const result = groupDimensions([
      dim('joy_sadness'),
      dim('proactive_reactive'),
    ])
    expect(result.some((g) => g.group.id === 'other')).toBe(false)
  })

  it('returns an empty array for an empty input', () => {
    expect(groupDimensions([])).toEqual([])
  })
})

describe('MOOD_GROUPS constant', () => {
  it('has exactly four canonical groups', () => {
    expect(MOOD_GROUPS).toHaveLength(4)
    expect(MOOD_GROUPS.map((g) => g.id)).toEqual([
      'affect',
      'needs',
      'negative',
      'stance',
    ])
  })

  it('every member name appears in exactly one group', () => {
    const seen = new Set<string>()
    for (const g of MOOD_GROUPS) {
      for (const name of g.members) {
        expect(seen.has(name)).toBe(false)
        seen.add(name)
      }
    }
  })
})
