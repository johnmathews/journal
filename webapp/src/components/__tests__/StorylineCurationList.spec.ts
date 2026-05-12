import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import StorylineCurationList from '../StorylineCurationList.vue'
import type { Segment } from '@/types/storyline'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/entries/:id', component: { template: '<div />' } },
  ],
})

function mountWith(
  segments: Segment[],
  registry: Map<number, number>,
  dateMode: 'relative' | 'absolute' = 'relative',
) {
  return mount(StorylineCurationList, {
    props: { segments, registry, dateMode },
    global: { plugins: [router] },
  })
}

describe('StorylineCurationList', () => {
  it('emits one row per citation segment', () => {
    const reg = new Map([
      [1, 1],
      [2, 2],
      [3, 3],
    ])
    const wrapper = mountWith(
      [
        { kind: 'text', text: 'It begins on 2026-03-15:' },
        { kind: 'citation', entry_id: 1, quote: 'q1' },
        { kind: 'text', text: 'Two days later:' },
        { kind: 'citation', entry_id: 2, quote: 'q2' },
        { kind: 'text', text: 'Three days later:' },
        { kind: 'citation', entry_id: 3, quote: 'q3' },
      ],
      reg,
    )
    expect(wrapper.findAll('li.curation-row').length).toBe(3)
  })

  it('uses the most recent text segment as the row date label', () => {
    const reg = new Map([
      [1, 1],
      [2, 2],
    ])
    const wrapper = mountWith(
      [
        { kind: 'text', text: 'It begins on 2026-03-15:' },
        { kind: 'citation', entry_id: 1, quote: 'q1' },
        { kind: 'text', text: 'Two days later:' },
        { kind: 'citation', entry_id: 2, quote: 'q2' },
      ],
      reg,
    )
    expect(wrapper.get('[data-testid="curation-row-date-1"]').text()).toBe(
      'It begins on 2026-03-15',
    )
    expect(wrapper.get('[data-testid="curation-row-date-2"]').text()).toBe(
      'Two days later',
    )
  })

  it('strips trailing colons and whitespace from the date label', () => {
    const reg = new Map([[1, 1]])
    const wrapper = mountWith(
      [
        { kind: 'text', text: '  Some date label:   ' },
        { kind: 'citation', entry_id: 1, quote: 'q' },
      ],
      reg,
    )
    expect(wrapper.get('[data-testid="curation-row-date-1"]').text()).toBe(
      'Some date label',
    )
  })

  it('renders the row entry link to /entries/:id', () => {
    const reg = new Map([[42, 1]])
    const wrapper = mountWith(
      [{ kind: 'citation', entry_id: 42, quote: 'q' }],
      reg,
    )
    const link = wrapper.get('[data-testid="curation-row-link-1"]')
    expect(link.attributes('href')).toBe('/entries/42')
    expect(link.text()).toContain('[1]')
  })

  it('uses the registry-assigned [N] (non-sequential allowed)', () => {
    // Curation rows show whatever number the registry hands them. With
    // narrative-driven numbering, curation-only entries get trailing
    // numbers, so the visible [N] sequence down the list can jump around.
    const reg = new Map([
      [10, 5],
      [20, 3],
    ])
    const wrapper = mountWith(
      [
        { kind: 'text', text: 'first' },
        { kind: 'citation', entry_id: 10, quote: 'q' },
        { kind: 'text', text: 'second' },
        { kind: 'citation', entry_id: 20, quote: 'q' },
      ],
      reg,
    )
    expect(wrapper.get('[data-testid="curation-row-link-5"]').text()).toContain(
      '[5]',
    )
    expect(wrapper.get('[data-testid="curation-row-link-3"]').text()).toContain(
      '[3]',
    )
  })

  it('renders the citation quote on the row', () => {
    const reg = new Map([[1, 1]])
    const wrapper = mountWith(
      [{ kind: 'citation', entry_id: 1, quote: 'a precise short quote' }],
      reg,
    )
    expect(
      wrapper.get('[data-testid="curation-row-quote-1"]').text(),
    ).toContain('a precise short quote')
  })

  it('renders zero rows for empty segments without crashing', () => {
    const wrapper = mountWith([], new Map())
    expect(wrapper.findAll('li.curation-row').length).toBe(0)
  })

  it('renders empty date label when a citation has no preceding text', () => {
    const reg = new Map([[1, 1]])
    const wrapper = mountWith(
      [{ kind: 'citation', entry_id: 1, quote: 'q' }],
      reg,
    )
    const date = wrapper.find('[data-testid="curation-row-date-1"]')
    expect(date.exists()).toBe(true)
    expect(date.text()).toBe('')
  })

  it('clears the pending date label after a row is emitted', () => {
    // After the first citation consumes "Two days later", the second
    // citation should NOT inherit the same label; it gets its own.
    const reg = new Map([
      [1, 1],
      [2, 2],
    ])
    const wrapper = mountWith(
      [
        { kind: 'text', text: 'Two days later:' },
        { kind: 'citation', entry_id: 1, quote: 'q1' },
        { kind: 'citation', entry_id: 2, quote: 'q2' },
      ],
      reg,
    )
    expect(wrapper.get('[data-testid="curation-row-date-1"]').text()).toBe(
      'Two days later',
    )
    expect(wrapper.get('[data-testid="curation-row-date-2"]').text()).toBe('')
  })

  it('shows entry_date when dateMode is absolute', () => {
    const reg = new Map([
      [1, 1],
      [2, 2],
    ])
    const wrapper = mountWith(
      [
        { kind: 'text', text: 'It begins on 2026-02-15:' },
        {
          kind: 'citation',
          entry_id: 1,
          quote: 'q1',
          entry_date: '2026-02-15',
        },
        { kind: 'text', text: 'Nearly a month later:' },
        {
          kind: 'citation',
          entry_id: 2,
          quote: 'q2',
          entry_date: '2026-03-12',
        },
      ],
      reg,
      'absolute',
    )
    expect(wrapper.get('[data-testid="curation-row-date-1"]').text()).toBe(
      '2026-02-15',
    )
    expect(wrapper.get('[data-testid="curation-row-date-2"]').text()).toBe(
      '2026-03-12',
    )
  })

  it('falls back to the relative label in absolute mode when entry_date is missing', () => {
    // Older panels stored before the server stamped entry_date must
    // still render — they fall back to the LLM-authored phrase.
    const reg = new Map([[1, 1]])
    const wrapper = mountWith(
      [
        { kind: 'text', text: 'It begins on 2026-02-15:' },
        { kind: 'citation', entry_id: 1, quote: 'q1' },
      ],
      reg,
      'absolute',
    )
    expect(wrapper.get('[data-testid="curation-row-date-1"]').text()).toBe(
      'It begins on 2026-02-15',
    )
  })

  it('falls back to [?] when an entry_id is missing from the registry', () => {
    const reg = new Map<number, number>()
    const wrapper = mountWith(
      [
        { kind: 'text', text: 'On Monday:' },
        { kind: 'citation', entry_id: 99, quote: 'q' },
      ],
      reg,
    )
    // Row still renders; link still points at the entry.
    const links = wrapper.findAll('a')
    expect(links.length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('[?]')
    expect(wrapper.text()).toContain('On Monday')
  })
})
