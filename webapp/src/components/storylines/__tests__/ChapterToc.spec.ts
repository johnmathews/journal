import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChapterToc from '../ChapterToc.vue'
import type { ChapterMeta } from '@/types/storyline'

function meta(overrides: Partial<ChapterMeta> = {}): ChapterMeta {
  return {
    id: 1,
    seq: 1,
    title: 'One',
    state: 'published',
    entry_count: 2,
    first_entry_date: '2026-01-01',
    last_entry_date: '2026-01-20',
    published_at: '2026-01-21T00:00:00Z',
    read_at: '2026-01-22T00:00:00Z',
    citation_count: 3,
    ...overrides,
  }
}

const chapters: ChapterMeta[] = [
  meta({ id: 1, title: 'One' }),
  meta({ id: 2, seq: 2, title: 'Two', read_at: null }),
  meta({
    id: 3,
    seq: 3,
    state: 'draft',
    title: '',
    published_at: null,
    read_at: null,
    first_entry_date: '2026-02-01',
    last_entry_date: '2026-02-01',
  }),
]

describe('ChapterToc', () => {
  it('renders newest chapter first (reverse chronological)', () => {
    const wrapper = mount(ChapterToc, {
      props: { chapters, activeId: null },
    })
    const ids = wrapper
      .findAll('[data-testid^="toc-item-"]')
      .map((b) => b.attributes('data-testid'))
    expect(ids).toEqual(['toc-item-3', 'toc-item-2', 'toc-item-1'])
  })

  it('renders a row per chapter with unread dots on unread published only', () => {
    const wrapper = mount(ChapterToc, {
      props: { chapters, activeId: null },
    })
    expect(wrapper.findAll('[data-testid^="toc-item-"]')).toHaveLength(3)
    // Only chapter 2 (published + unread) carries a dot — never the draft.
    expect(wrapper.findAll('[data-testid="toc-unread-dot"]')).toHaveLength(1)
    expect(
      wrapper
        .find('[data-testid="toc-item-2"]')
        .find('[data-testid="toc-unread-dot"]')
        .exists(),
    ).toBe(true)
  })

  it('labels the draft as In progress and single-day ranges once', () => {
    const wrapper = mount(ChapterToc, {
      props: { chapters, activeId: null },
    })
    const draft = wrapper.find('[data-testid="toc-item-3"]')
    expect(draft.text()).toContain('In progress')
    expect(draft.text()).toContain('2026-02-01')
    expect(draft.text()).not.toContain('2026-02-01 – 2026-02-01')
  })

  it('marks the active row and emits select on click', async () => {
    const wrapper = mount(ChapterToc, {
      props: { chapters, activeId: 1 },
    })
    expect(
      wrapper.find('[data-testid="toc-item-1"]').attributes('aria-current'),
    ).toBe('true')
    await wrapper.find('[data-testid="toc-item-2"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[2]])
  })
})
