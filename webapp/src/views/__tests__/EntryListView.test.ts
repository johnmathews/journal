import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import EntryListView from '../EntryListView.vue'

vi.mock('@/api/entries', () => ({
  fetchEntries: vi.fn().mockResolvedValue({
    items: [
      {
        id: 1,
        entry_date: '2026-03-22',
        source_type: 'ocr',
        page_count: 2,
        word_count: 347,
        chunk_count: 5,
        created_at: '2026-03-23T10:30:00Z',
      },
      {
        id: 2,
        entry_date: '2026-03-21',
        source_type: 'voice',
        page_count: 0,
        word_count: 120,
        chunk_count: 2,
        created_at: '2026-03-21T15:00:00Z',
      },
    ],
    total: 2,
    limit: 20,
    offset: 0,
  }),
  fetchEntry: vi.fn(),
  updateEntryText: vi.fn(),
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'entries', component: EntryListView },
    {
      path: '/entries/:id',
      name: 'entry-detail',
      component: { template: '<div />' },
    },
  ],
})

function mountComponent() {
  return mount(EntryListView, {
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('EntryListView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the heading', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('h1').text()).toBe('Journal Entries')
  })

  it('loads entries on mount', async () => {
    mountComponent()
    await new Promise((r) => setTimeout(r, 50))

    const { fetchEntries } = await import('@/api/entries')
    expect(fetchEntries).toHaveBeenCalled()
  })

  it('displays entry count after loading', async () => {
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const count = wrapper.find('[data-testid="entry-count"]')
    expect(count.exists()).toBe(true)
    expect(count.text()).toContain('2 entries')
  })

  it('renders one row per entry', async () => {
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('[data-testid="entry-row"]')).toHaveLength(2)
  })

  it('navigates to entry-detail when a row is clicked', async () => {
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const pushSpy = vi.spyOn(router, 'push')
    await wrapper.findAll('[data-testid="entry-row"]')[0].trigger('click')

    expect(pushSpy).toHaveBeenCalledWith({
      name: 'entry-detail',
      params: { id: 1 },
    })
  })

  it('shows an error banner when the store load fails', async () => {
    const { fetchEntries } = await import('@/api/entries')
    const mock = vi.mocked(fetchEntries)
    mock.mockRejectedValueOnce(new Error('Network down'))

    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const banner = wrapper.find('[data-testid="error-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('Network down')
  })

  it('shows the empty state when there are no entries', async () => {
    const { fetchEntries } = await import('@/api/entries')
    const mock = vi.mocked(fetchEntries)
    mock.mockResolvedValueOnce({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    })

    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
  })

  it('renders the page indicator text', async () => {
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="page-indicator"]').text()).toMatch(
      /Page 1 of 1/,
    )
  })

  it('disables Prev and Next when there is only one page of data', async () => {
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const prev = wrapper.find('[data-testid="prev-page"]')
      .element as HTMLButtonElement
    const next = wrapper.find('[data-testid="next-page"]')
      .element as HTMLButtonElement
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(true)
  })

  it('Next click refetches with the next offset when multiple pages exist', async () => {
    const { fetchEntries } = await import('@/api/entries')
    const mock = vi.mocked(fetchEntries)
    mock.mockResolvedValue({
      items: Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        entry_date: '2026-01-01',
        source_type: 'ocr' as const,
        page_count: 1,
        word_count: 1,
        chunk_count: 1,
        created_at: '',
      })),
      total: 45,
      limit: 20,
      offset: 0,
    })

    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    mock.mockClear()
    const next = wrapper.find('[data-testid="next-page"]')
    await next.trigger('click')

    expect(mock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 20 }),
    )
  })

  it('sorts by date descending by default', async () => {
    const { fetchEntries } = await import('@/api/entries')
    vi.mocked(fetchEntries).mockResolvedValueOnce({
      items: [
        {
          id: 1,
          entry_date: '2026-03-22',
          source_type: 'ocr',
          page_count: 2,
          word_count: 347,
          chunk_count: 5,
          created_at: '2026-03-23T10:30:00Z',
        },
        {
          id: 2,
          entry_date: '2026-03-21',
          source_type: 'voice',
          page_count: 0,
          word_count: 120,
          chunk_count: 2,
          created_at: '2026-03-21T15:00:00Z',
        },
      ],
      total: 2,
      limit: 20,
      offset: 0,
    })
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('[data-testid="entry-row"]')
    // descending: 2026-03-22 (Mar) first, 2026-03-21 second
    expect(rows[0].text()).toContain('22 Mar')
    expect(rows[1].text()).toContain('21 Mar')
  })

  it('toggles sort direction on column header click', async () => {
    const { fetchEntries } = await import('@/api/entries')
    vi.mocked(fetchEntries).mockResolvedValueOnce({
      items: [
        {
          id: 1,
          entry_date: '2026-03-22',
          source_type: 'ocr',
          page_count: 2,
          word_count: 347,
          chunk_count: 5,
          created_at: '2026-03-23T10:30:00Z',
        },
        {
          id: 2,
          entry_date: '2026-03-21',
          source_type: 'voice',
          page_count: 0,
          word_count: 120,
          chunk_count: 2,
          created_at: '2026-03-21T15:00:00Z',
        },
      ],
      total: 2,
      limit: 20,
      offset: 0,
    })
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="sort-date"]').trigger('click')
    const rows = wrapper.findAll('[data-testid="entry-row"]')
    // toggled to ascending: 2026-03-21 first
    expect(rows[0].text()).toContain('21 Mar')
    expect(rows[1].text()).toContain('22 Mar')
  })

  it('sorts by a different column when its header is clicked', async () => {
    const { fetchEntries } = await import('@/api/entries')
    vi.mocked(fetchEntries).mockResolvedValueOnce({
      items: [
        {
          id: 1,
          entry_date: '2026-03-22',
          source_type: 'ocr',
          page_count: 2,
          word_count: 347,
          chunk_count: 5,
          created_at: '2026-03-23T10:30:00Z',
        },
        {
          id: 2,
          entry_date: '2026-03-21',
          source_type: 'voice',
          page_count: 0,
          word_count: 120,
          chunk_count: 2,
          created_at: '2026-03-21T15:00:00Z',
        },
      ],
      total: 2,
      limit: 20,
      offset: 0,
    })
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="sort-words"]').trigger('click')
    const rows = wrapper.findAll('[data-testid="entry-row"]')
    // ascending by words: 120 first, 347 second
    expect(rows[0].text()).toContain('120')
    expect(rows[1].text()).toContain('347')
  })

  it('changes rows-per-page and refetches from offset 0', async () => {
    const { fetchEntries } = await import('@/api/entries')
    const mock = vi.mocked(fetchEntries)
    mock.mockResolvedValue({
      items: Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        entry_date: '2026-01-01',
        source_type: 'ocr' as const,
        page_count: 1,
        word_count: 1,
        chunk_count: 1,
        created_at: '',
      })),
      total: 100,
      limit: 20,
      offset: 0,
    })

    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    mock.mockClear()
    const select = wrapper.find('#rows-per-page')
    await select.setValue('50')

    expect(mock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 }),
    )
  })
})
