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
    expect(
      wrapper.find('[data-testid="storyline-narrative"]').exists(),
    ).toBe(true)
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
    expect(
      newest.find('[data-testid="chapter-menu-unpublish"]').exists(),
    ).toBe(true)

    const older = mountReader({}, false)
    await older.find('[data-testid="chapter-menu-button"]').trigger('click')
    expect(
      older.find('[data-testid="chapter-menu-unpublish"]').exists(),
    ).toBe(false)
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
