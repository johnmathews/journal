import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import StorylineSegments from '../StorylineSegments.vue'
import type { Segment } from '@/types/storyline'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/entries/:id', component: { template: '<div />' } },
  ],
})

function mountWith(segments: Segment[], inlineQuoteThreshold?: number) {
  return mount(StorylineSegments, {
    props: { segments, inlineQuoteThreshold },
    global: { plugins: [router] },
  })
}

describe('StorylineSegments', () => {
  it('renders text segments as plain prose', () => {
    const wrapper = mountWith([{ kind: 'text', text: 'On a cold morning, ' }])
    const textEl = wrapper.find('[data-testid="segment-text"]')
    expect(textEl.exists()).toBe(true)
    expect(textEl.text()).toBe('On a cold morning,')
  })

  it('renders a citation as a RouterLink to /entries/:id with a footnote label', () => {
    const wrapper = mountWith([
      { kind: 'text', text: 'He ran fast. ' },
      { kind: 'citation', entry_id: 7, quote: 'I ran fast today.' },
    ])
    const link = wrapper.find('[data-testid="segment-citation-7"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/entries/7')
    expect(link.text()).toBe('[1]')
  })

  it('numbers citations sequentially across the panel', () => {
    const wrapper = mountWith([
      { kind: 'citation', entry_id: 1, quote: 'a' },
      { kind: 'text', text: ' and ' },
      { kind: 'citation', entry_id: 5, quote: 'b' },
      { kind: 'text', text: ' and ' },
      { kind: 'citation', entry_id: 9, quote: 'c' },
    ])
    expect(wrapper.find('[data-testid="segment-citation-1"]').text()).toBe(
      '[1]',
    )
    expect(wrapper.find('[data-testid="segment-citation-5"]').text()).toBe(
      '[2]',
    )
    expect(wrapper.find('[data-testid="segment-citation-9"]').text()).toBe(
      '[3]',
    )
  })

  it('shows short citation quotes inline', () => {
    const wrapper = mountWith([
      { kind: 'citation', entry_id: 3, quote: 'one short quote' },
    ])
    const inline = wrapper.find('[data-testid="segment-citation-quote-inline"]')
    expect(inline.exists()).toBe(true)
    expect(inline.text()).toContain('one short quote')
    expect(
      wrapper.find('[data-testid="segment-citation-quote-collapsed"]').exists(),
    ).toBe(false)
  })

  it('collapses long citation quotes behind a disclosure', () => {
    const longQuote = 'x'.repeat(500)
    const wrapper = mountWith([
      { kind: 'citation', entry_id: 4, quote: longQuote },
    ])
    expect(
      wrapper.find('[data-testid="segment-citation-quote-collapsed"]').exists(),
    ).toBe(true)
    const expanded = wrapper.find(
      '[data-testid="segment-citation-quote-expanded"]',
    )
    expect(expanded.exists()).toBe(true)
    expect(expanded.text()).toBe(longQuote)
    expect(
      wrapper.find('[data-testid="segment-citation-quote-inline"]').exists(),
    ).toBe(false)
  })

  it('renders neither inline nor collapsed quote when quote is empty', () => {
    const wrapper = mountWith([{ kind: 'citation', entry_id: 8, quote: '' }])
    // Link is present, but no quote sub-elements.
    expect(wrapper.find('[data-testid="segment-citation-8"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="segment-citation-quote-inline"]').exists(),
    ).toBe(false)
    expect(
      wrapper.find('[data-testid="segment-citation-quote-collapsed"]').exists(),
    ).toBe(false)
  })

  it('respects a custom inlineQuoteThreshold', () => {
    const wrapper = mountWith(
      [{ kind: 'citation', entry_id: 2, quote: '0123456789' }],
      5,
    )
    // 10-char quote is over the threshold of 5 — must collapse.
    expect(
      wrapper.find('[data-testid="segment-citation-quote-collapsed"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="segment-citation-quote-inline"]').exists(),
    ).toBe(false)
  })

  it('handles an empty segment list without crashing', () => {
    const wrapper = mountWith([])
    expect(wrapper.find('[data-testid="storyline-segments"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="segment-text"]').exists()).toBe(false)
  })

  it('puts text and citations in source order', () => {
    const wrapper = mountWith([
      { kind: 'text', text: 'first ' },
      { kind: 'citation', entry_id: 1, quote: 'q' },
      { kind: 'text', text: ' middle ' },
      { kind: 'citation', entry_id: 2, quote: 'q' },
      { kind: 'text', text: ' last' },
    ])
    const text = wrapper.text()
    // Strip the inline italic quotes to make the order assertion robust.
    expect(text.indexOf('first')).toBeLessThan(text.indexOf('[1]'))
    expect(text.indexOf('[1]')).toBeLessThan(text.indexOf('middle'))
    expect(text.indexOf('middle')).toBeLessThan(text.indexOf('[2]'))
    expect(text.indexOf('[2]')).toBeLessThan(text.indexOf('last'))
  })
})
