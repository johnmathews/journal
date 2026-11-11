import { describe, it, expect } from 'vitest'
import { buildCitationRegistry } from '../useCitationRegistry'
import type { Segment } from '@/types/storyline'

describe('buildCitationRegistry', () => {
  it('assigns [1] [2] [3] in walking order', () => {
    const segments: Segment[] = [
      { kind: 'text', text: 'a ' },
      { kind: 'citation', entry_id: 11, quote: 'q1' },
      { kind: 'text', text: ' b ' },
      { kind: 'citation', entry_id: 22, quote: 'q2' },
      { kind: 'text', text: ' c ' },
      { kind: 'citation', entry_id: 33, quote: 'q3' },
    ]
    const reg = buildCitationRegistry([segments])
    expect(reg.get(11)).toBe(1)
    expect(reg.get(22)).toBe(2)
    expect(reg.get(33)).toBe(3)
  })

  it('dedups repeated entry_ids within one list', () => {
    const segments: Segment[] = [
      { kind: 'citation', entry_id: 7, quote: 'q' },
      { kind: 'text', text: ' then ' },
      { kind: 'citation', entry_id: 9, quote: 'q' },
      { kind: 'text', text: ' then ' },
      { kind: 'citation', entry_id: 7, quote: 'q again' },
    ]
    const reg = buildCitationRegistry([segments])
    expect(reg.get(7)).toBe(1)
    expect(reg.get(9)).toBe(2)
    expect(reg.size).toBe(2)
  })

  it('numbers addendum-only entry_ids after the narrative', () => {
    const narrative: Segment[] = [
      { kind: 'citation', entry_id: 1, quote: 'q' },
      { kind: 'citation', entry_id: 2, quote: 'q' },
    ]
    const addendum: Segment[] = [
      { kind: 'citation', entry_id: 5, quote: 'q' },
      { kind: 'citation', entry_id: 2, quote: 'shared' },
      { kind: 'citation', entry_id: 9, quote: 'q' },
    ]
    const reg = buildCitationRegistry([narrative, addendum])
    expect(reg.get(1)).toBe(1)
    expect(reg.get(2)).toBe(2) // already assigned by narrative; addendum reuses
    expect(reg.get(5)).toBe(3) // first addendum-only
    expect(reg.get(9)).toBe(4) // second addendum-only
    expect(reg.size).toBe(4)
  })

  it('returns an empty registry for no lists', () => {
    expect(buildCitationRegistry([]).size).toBe(0)
  })

  it('returns an empty registry for text-only lists', () => {
    const reg = buildCitationRegistry([
      [{ kind: 'text', text: 'just prose' }],
      [{ kind: 'text', text: 'more prose' }],
    ])
    expect(reg.size).toBe(0)
  })
})
