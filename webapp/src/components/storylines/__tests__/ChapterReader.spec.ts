import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ChapterReader from '../ChapterReader.vue'
import type { ChapterDetail } from '@/types/storyline'

function chapter(overrides: Partial<ChapterDetail> = {}): ChapterDetail {
  return {
    id: 70,
    seq: 1,
    title: 'The Build-Up',
    state: 'published',
    entry_count: 3,
    first_entry_date: '2026-01-01',
    last_entry_date: '2026-02-01',
    published_at: '2026-02-02T00:00:00Z',
    read_at: null,
    citation_count: 1,
    segments: [
      { kind: 'text', text: 'He trained hard. ' },
      { kind: 'citation', entry_id: 11, quote: 'I ran 5km.' },
    ],
    addenda: [],
    model_used: 'opus',
    generated_at: '2026-02-02T00:00:00Z',
    ...overrides,
  }
}

function mountReader(overrides: Partial<ChapterDetail> = {}, isNewest = true) {
  return mount(ChapterReader, {
    props: { chapter: chapter(overrides), isNewest },
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
}

describe('ChapterReader', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders title, date eyebrow, narrative, and footer', () => {
    const wrapper = mountReader()
    expect(wrapper.find('[data-testid="chapter-title"]').text()).toBe(
      'The Build-Up',
    )
    expect(wrapper.find('[data-testid="chapter-date-eyebrow"]').text()).toBe(
      '2026-01-01 – 2026-02-01',
    )
    expect(wrapper.find('[data-testid="storyline-narrative"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="chapter-footer"]').text()).toContain(
      '3 entries',
    )
  })

  it('falls back to Chapter N when the title is empty', () => {
    const wrapper = mountReader({ title: '' })
    expect(wrapper.find('[data-testid="chapter-title"]').text()).toBe(
      'Chapter 1',
    )
  })

  it('renders addenda as distinct blocks', () => {
    const wrapper = mountReader({
      addenda: [
        {
          added_at: '2026-03-01T00:00:00Z',
          segments: [{ kind: 'text', text: 'Later material.' }],
          entry_ids: [40],
        },
      ],
    })
    const addendum = wrapper.find('[data-testid="chapter-addendum-0"]')
    expect(addendum.exists()).toBe(true)
    expect(addendum.text()).toContain('Later')
    expect(addendum.text()).toContain('Later material.')
  })

  it('onVisible emits visible exactly once', () => {
    const wrapper = mountReader()
    const vm = wrapper.vm as unknown as { onVisible: () => void }
    vm.onVisible()
    vm.onVisible()
    expect(wrapper.emitted('visible')).toEqual([[70]])
  })

  it('menu offers Unpublish only on the newest chapter', async () => {
    const newest = mountReader({}, true)
    await newest.find('[data-testid="chapter-menu-button"]').trigger('click')
    expect(newest.find('[data-testid="chapter-menu-unpublish"]').exists()).toBe(
      true,
    )

    const older = mountReader({}, false)
    await older.find('[data-testid="chapter-menu-button"]').trigger('click')
    expect(older.find('[data-testid="chapter-menu-unpublish"]').exists()).toBe(
      false,
    )
  })

  it('menu offers Mark unread only when read', async () => {
    const unreadChapter = mountReader({ read_at: null })
    await unreadChapter
      .find('[data-testid="chapter-menu-button"]')
      .trigger('click')
    expect(
      unreadChapter.find('[data-testid="chapter-menu-unread"]').exists(),
    ).toBe(false)

    const readChapter = mountReader({ read_at: '2026-07-01T00:00:00Z' })
    await readChapter
      .find('[data-testid="chapter-menu-button"]')
      .trigger('click')
    await readChapter
      .find('[data-testid="chapter-menu-unread"]')
      .trigger('click')
    expect(readChapter.emitted('markUnread')).toEqual([[70]])
  })

  it('rename flows through the inline form', async () => {
    const wrapper = mountReader()
    await wrapper.find('[data-testid="chapter-menu-button"]').trigger('click')
    await wrapper.find('[data-testid="chapter-menu-rename"]').trigger('click')
    const input = wrapper.find('[data-testid="chapter-rename-input"]')
    await input.setValue('  New Title  ')
    await wrapper.find('[data-testid="chapter-rename-form"]').trigger('submit')
    expect(wrapper.emitted('rename')).toEqual([[70, 'New Title']])
  })
})

describe('ChapterReader — edge branches', () => {
  it('renders a single-day date range once and hides the eyebrow without dates', () => {
    const single = mountReader({
      first_entry_date: '2026-01-05',
      last_entry_date: '2026-01-05',
    })
    expect(single.find('[data-testid="chapter-date-eyebrow"]').text()).toBe(
      '2026-01-05',
    )
    const none = mountReader({
      first_entry_date: null,
      last_entry_date: null,
    })
    expect(none.find('[data-testid="chapter-date-eyebrow"]').exists()).toBe(
      false,
    )
  })

  it('shows the empty state for a chapter with no segments', () => {
    const wrapper = mountReader({ segments: [] })
    expect(wrapper.find('[data-testid="chapter-empty"]').exists()).toBe(true)
  })

  it('menu toggles closed on a second click and rename cancel restores the title', async () => {
    const wrapper = mountReader()
    const button = wrapper.find('[data-testid="chapter-menu-button"]')
    await button.trigger('click')
    expect(wrapper.find('[data-testid="chapter-menu"]').exists()).toBe(true)
    await button.trigger('click')
    expect(wrapper.find('[data-testid="chapter-menu"]').exists()).toBe(false)

    await button.trigger('click')
    await wrapper.find('[data-testid="chapter-menu-rename"]').trigger('click')
    await wrapper.find('[data-testid="chapter-rename-cancel"]').trigger('click')
    expect(wrapper.find('[data-testid="chapter-title"]').text()).toBe(
      'The Build-Up',
    )
    expect(wrapper.emitted('rename')).toBeUndefined()
  })

  it('rename submit with only whitespace is a no-op', async () => {
    const wrapper = mountReader()
    await wrapper.find('[data-testid="chapter-menu-button"]').trigger('click')
    await wrapper.find('[data-testid="chapter-menu-rename"]').trigger('click')
    await wrapper.find('[data-testid="chapter-rename-input"]').setValue('   ')
    await wrapper.find('[data-testid="chapter-rename-form"]').trigger('submit')
    expect(wrapper.emitted('rename')).toBeUndefined()
  })

  it('document click outside closes the menu', async () => {
    const wrapper = mount(ChapterReader, {
      props: { chapter: chapter(), isNewest: true },
      attachTo: document.body,
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await wrapper.find('[data-testid="chapter-menu-button"]').trigger('click')
    expect(wrapper.find('[data-testid="chapter-menu"]').exists()).toBe(true)
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="chapter-menu"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('footer omits the entry count when zero and formatDate tolerates bad input', () => {
    const wrapper = mountReader({
      entry_count: 0,
      published_at: 'not-a-date',
    })
    const footer = wrapper.find('[data-testid="chapter-footer"]')
    expect(footer.text()).toContain('not-a-date')
    expect(footer.text()).not.toContain('entr')
  })
})
