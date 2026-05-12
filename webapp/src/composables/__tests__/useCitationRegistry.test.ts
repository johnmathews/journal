import { describe, it, expect } from 'vitest'
import { buildCitationRegistry } from '../useCitationRegistry'
import type { StorylineDetail } from '@/types/storyline'

type Panels = StorylineDetail['panels']

function panel(
  kind: 'curation' | 'narrative',
  segments: Panels[keyof Panels] extends infer P
    ? P extends { segments: infer S }
      ? S
      : never
    : never,
) {
  return {
    panel_kind: kind,
    segments,
    source_entry_ids: [],
    citation_count: 0,
    model_used: null,
    generated_at: null,
  }
}

describe('buildCitationRegistry', () => {
  it('assigns [1] [2] [3] in narrative walking order', () => {
    const panels: Panels = {
      narrative: panel('narrative', [
        { kind: 'text', text: 'a ' },
        { kind: 'citation', entry_id: 11, quote: 'q1' },
        { kind: 'text', text: ' b ' },
        { kind: 'citation', entry_id: 22, quote: 'q2' },
        { kind: 'text', text: ' c ' },
        { kind: 'citation', entry_id: 33, quote: 'q3' },
      ]),
    }
    const reg = buildCitationRegistry(panels)
    expect(reg.get(11)).toBe(1)
    expect(reg.get(22)).toBe(2)
    expect(reg.get(33)).toBe(3)
  })

  it('dedups repeated entry_ids within the narrative', () => {
    const panels: Panels = {
      narrative: panel('narrative', [
        { kind: 'citation', entry_id: 7, quote: 'q' },
        { kind: 'text', text: ' then ' },
        { kind: 'citation', entry_id: 9, quote: 'q' },
        { kind: 'text', text: ' then ' },
        { kind: 'citation', entry_id: 7, quote: 'q again' },
      ]),
    }
    const reg = buildCitationRegistry(panels)
    expect(reg.get(7)).toBe(1)
    expect(reg.get(9)).toBe(2)
    expect(reg.size).toBe(2)
  })

  it('appends curation-only entry_ids after narrative numbers', () => {
    const panels: Panels = {
      narrative: panel('narrative', [
        { kind: 'citation', entry_id: 1, quote: 'q' },
        { kind: 'citation', entry_id: 2, quote: 'q' },
      ]),
      curation: panel('curation', [
        { kind: 'citation', entry_id: 5, quote: 'q' },
        { kind: 'citation', entry_id: 2, quote: 'shared' },
        { kind: 'citation', entry_id: 9, quote: 'q' },
      ]),
    }
    const reg = buildCitationRegistry(panels)
    expect(reg.get(1)).toBe(1)
    expect(reg.get(2)).toBe(2) // already assigned by narrative; curation reuses
    expect(reg.get(5)).toBe(3) // first curation-only
    expect(reg.get(9)).toBe(4) // second curation-only
    expect(reg.size).toBe(4)
  })

  it('handles narrative-only storylines', () => {
    const panels: Panels = {
      narrative: panel('narrative', [
        { kind: 'citation', entry_id: 100, quote: 'q' },
      ]),
    }
    const reg = buildCitationRegistry(panels)
    expect(reg.get(100)).toBe(1)
    expect(reg.size).toBe(1)
  })

  it('handles curation-only storylines (curation drives when narrative absent)', () => {
    const panels: Panels = {
      curation: panel('curation', [
        { kind: 'citation', entry_id: 50, quote: 'q' },
        { kind: 'citation', entry_id: 60, quote: 'q' },
      ]),
    }
    const reg = buildCitationRegistry(panels)
    expect(reg.get(50)).toBe(1)
    expect(reg.get(60)).toBe(2)
  })

  it('returns an empty registry for empty panels', () => {
    expect(buildCitationRegistry({}).size).toBe(0)
  })

  it('returns an empty registry when both panels have only text', () => {
    const panels: Panels = {
      narrative: panel('narrative', [{ kind: 'text', text: 'just prose' }]),
      curation: panel('curation', [{ kind: 'text', text: 'just prose' }]),
    }
    expect(buildCitationRegistry(panels).size).toBe(0)
  })
})
