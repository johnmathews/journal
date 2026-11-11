import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import StorylineNarrative from '../StorylineNarrative.vue'
import type { Segment } from '@/types/storyline'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/entries/:id', component: { template: '<div />' } },
  ],
})

// happy-dom doesn't implement scrollIntoView — stub it so click handlers
// don't crash.
const scrollSpy = vi.fn()
beforeEach(() => {
  scrollSpy.mockClear()
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: scrollSpy,
  })
})

function mountWith(segments: Segment[], registry: Map<number, number>) {
  return mount(StorylineNarrative, {
    props: { segments, registry },
    global: { plugins: [router] },
  })
}

describe('StorylineNarrative', () => {
  it('renders text and citation markers in source order', () => {
    const reg = new Map([
      [1, 1],
      [2, 2],
    ])
    const wrapper = mountWith(
      [
        { kind: 'text', text: 'first ' },
        { kind: 'citation', entry_id: 1, quote: 'q1' },
        { kind: 'text', text: ' middle ' },
        { kind: 'citation', entry_id: 2, quote: 'q2' },
        { kind: 'text', text: ' last' },
      ],
      reg,
    )
    const body = wrapper.get('[data-testid="narrative-body"]')
    const text = body.text()
    expect(text.indexOf('first')).toBeLessThan(text.indexOf('[1]'))
    expect(text.indexOf('[1]')).toBeLessThan(text.indexOf('middle'))
    expect(text.indexOf('middle')).toBeLessThan(text.indexOf('[2]'))
    expect(text.indexOf('[2]')).toBeLessThan(text.indexOf('last'))
  })

  it('does NOT render inline quotes in the body', () => {
    const reg = new Map([[1, 1]])
    const wrapper = mountWith(
      [
        { kind: 'text', text: 'He ran fast' },
        { kind: 'citation', entry_id: 1, quote: 'I RAN FAST TODAY.' },
      ],
      reg,
    )
    const body = wrapper.get('[data-testid="narrative-body"]')
    expect(body.text()).not.toContain('I RAN FAST TODAY')
  })

  it('uses the registry-assigned number for each marker', () => {
    // Registry assigns non-sequential numbers (narrative is not the first
    // panel walked in some hypothetical setup). Component must trust the
    // registry, not re-number locally.
    const reg = new Map([
      [11, 5],
      [22, 7],
    ])
    const wrapper = mountWith(
      [
        { kind: 'citation', entry_id: 11, quote: 'q' },
        { kind: 'text', text: ' and ' },
        { kind: 'citation', entry_id: 22, quote: 'q' },
      ],
      reg,
    )
    const body = wrapper.get('[data-testid="narrative-body"]')
    expect(body.text()).toContain('[5]')
    expect(body.text()).toContain('[7]')
  })

  it('renders the Sources section with one row per unique entry_id', () => {
    const reg = new Map([
      [1, 1],
      [2, 2],
    ])
    const wrapper = mountWith(
      [
        { kind: 'citation', entry_id: 1, quote: 'a' },
        { kind: 'citation', entry_id: 2, quote: 'b' },
        { kind: 'citation', entry_id: 1, quote: 'a-again' },
      ],
      reg,
    )
    expect(
      wrapper.findAll('[data-testid^="narrative-footnote-"]').length,
    ).toBeGreaterThan(0)
    expect(wrapper.find('[data-testid="narrative-footnote-1"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="narrative-footnote-2"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="narrative-footnote-3"]').exists()).toBe(
      false,
    )
  })

  it('footnote entry link points at /entries/:id', () => {
    const reg = new Map([[42, 1]])
    const wrapper = mountWith(
      [{ kind: 'citation', entry_id: 42, quote: 'q' }],
      reg,
    )
    const link = wrapper.get('[data-testid="narrative-footnote-link-1"]')
    expect(link.attributes('href')).toBe('/entries/42')
  })

  it('lists footnotes in ascending numeric order', () => {
    // Non-sequential registry: citations cited in narrative as 5 then 3.
    // Footnotes section should still list them as [3] [5].
    const reg = new Map([
      [10, 3],
      [20, 5],
    ])
    const wrapper = mountWith(
      [
        { kind: 'citation', entry_id: 20, quote: 'first cited' },
        { kind: 'citation', entry_id: 10, quote: 'second cited' },
      ],
      reg,
    )
    const text = wrapper.get('[data-testid="narrative-footnotes"]').text()
    expect(text.indexOf('[3]')).toBeLessThan(text.indexOf('[5]'))
  })

  it('clicking a body marker scrolls the matching footnote into view', async () => {
    const reg = new Map([[1, 1]])
    const wrapper = mountWith(
      [{ kind: 'citation', entry_id: 1, quote: 'q' }],
      reg,
    )
    document.body.appendChild(wrapper.element)
    const marker = wrapper.get('[data-testid="narrative-body-marker-1-0"]')
    await marker.trigger('click')
    expect(scrollSpy).toHaveBeenCalled()
  })

  it('clicking a footnote backref scrolls back to the first body marker', async () => {
    const reg = new Map([[1, 1]])
    const wrapper = mountWith(
      [
        { kind: 'citation', entry_id: 1, quote: 'q' },
        { kind: 'text', text: ' then ' },
        { kind: 'citation', entry_id: 1, quote: 'q' },
      ],
      reg,
    )
    document.body.appendChild(wrapper.element)
    const backref = wrapper.get('[data-testid="narrative-footnote-backref-1"]')
    await backref.trigger('click')
    expect(scrollSpy).toHaveBeenCalled()
  })

  it('renders [?] when an entry_id is missing from the registry', () => {
    const reg = new Map<number, number>() // empty
    const wrapper = mountWith(
      [{ kind: 'citation', entry_id: 99, quote: 'q' }],
      reg,
    )
    expect(wrapper.get('[data-testid="narrative-body"]').text()).toContain(
      '[?]',
    )
  })

  it('renders a date eyebrow above the first citation-bearing paragraph', () => {
    const reg = new Map([[1, 1]])
    const wrapper = mountWith(
      [
        { kind: 'text', text: 'Opening line. ' },
        {
          kind: 'citation',
          entry_id: 1,
          quote: 'q',
          entry_date: '2026-02-15',
        },
      ],
      reg,
    )
    const eyebrow = wrapper.find('[data-testid="narrative-date-eyebrow-0"]')
    expect(eyebrow.exists()).toBe(true)
    // en-GB formatting: "15 Feb 2026"
    expect(eyebrow.text()).toMatch(/15\s+Feb\s+2026/)
  })

  it('suppresses the eyebrow on follow-up paragraphs within the threshold', () => {
    // Two paragraphs only 3 days apart — first gets the anchor eyebrow,
    // second does not.
    const reg = new Map([
      [1, 1],
      [2, 2],
    ])
    const wrapper = mountWith(
      [
        { kind: 'text', text: 'First paragraph. ' },
        {
          kind: 'citation',
          entry_id: 1,
          quote: 'q1',
          entry_date: '2026-02-15',
        },
        { kind: 'text', text: '\n\nSecond paragraph. ' },
        {
          kind: 'citation',
          entry_id: 2,
          quote: 'q2',
          entry_date: '2026-02-18',
        },
      ],
      reg,
    )
    expect(
      wrapper.find('[data-testid="narrative-date-eyebrow-0"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="narrative-date-eyebrow-1"]').exists(),
    ).toBe(false)
  })

  it('renders an eyebrow on a later paragraph when the date jump exceeds the threshold', () => {
    // First paragraph anchors; second paragraph cites an entry ~30
    // days later, so it earns its own eyebrow.
    const reg = new Map([
      [1, 1],
      [2, 2],
    ])
    const wrapper = mountWith(
      [
        { kind: 'text', text: 'First paragraph. ' },
        {
          kind: 'citation',
          entry_id: 1,
          quote: 'q1',
          entry_date: '2026-02-15',
        },
        { kind: 'text', text: '\n\nSecond paragraph. ' },
        {
          kind: 'citation',
          entry_id: 2,
          quote: 'q2',
          entry_date: '2026-03-15',
        },
      ],
      reg,
    )
    expect(
      wrapper.find('[data-testid="narrative-date-eyebrow-0"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="narrative-date-eyebrow-1"]').exists(),
    ).toBe(true)
  })

  it('omits the eyebrow entirely when no citation carries entry_date', () => {
    // Older stored panels predate entry_date — render cleanly without
    // surfacing any eyebrow.
    const reg = new Map([[1, 1]])
    const wrapper = mountWith(
      [
        { kind: 'text', text: 'Opening line. ' },
        { kind: 'citation', entry_id: 1, quote: 'q' },
      ],
      reg,
    )
    expect(
      wrapper.find('[data-testid="narrative-date-eyebrow-0"]').exists(),
    ).toBe(false)
  })

  it('hides the Sources section when there are no citations', () => {
    const reg = new Map<number, number>()
    const wrapper = mountWith([{ kind: 'text', text: 'just prose' }], reg)
    expect(wrapper.find('[data-testid="narrative-footnotes"]').exists()).toBe(
      false,
    )
  })
})
