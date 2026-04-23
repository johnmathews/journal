import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
        source_type: 'photo',
        page_count: 2,
        word_count: 347,
        chunk_count: 5,
        created_at: '2026-03-23T10:30:00Z',
        uncertain_span_count: 0,
        doubts_verified: false,
      },
      {
        id: 2,
        entry_date: '2026-03-21',
        source_type: 'voice',
        page_count: 0,
        word_count: 120,
        chunk_count: 2,
        created_at: '2026-03-21T15:00:00Z',
        uncertain_span_count: 0,
        doubts_verified: false,
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
        source_type: 'photo' as const,
        page_count: 1,
        word_count: 1,
        chunk_count: 1,
        created_at: '',
        uncertain_span_count: 0,
        doubts_verified: false,
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
          source_type: 'photo',
          page_count: 2,
          word_count: 347,
          chunk_count: 5,
          created_at: '2026-03-23T10:30:00Z',
          uncertain_span_count: 0,
          doubts_verified: false,
        },
        {
          id: 2,
          entry_date: '2026-03-21',
          source_type: 'voice',
          page_count: 0,
          word_count: 120,
          chunk_count: 2,
          created_at: '2026-03-21T15:00:00Z',
          uncertain_span_count: 0,
          doubts_verified: false,
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
          source_type: 'photo',
          page_count: 2,
          word_count: 347,
          chunk_count: 5,
          created_at: '2026-03-23T10:30:00Z',
          uncertain_span_count: 0,
          doubts_verified: false,
        },
        {
          id: 2,
          entry_date: '2026-03-21',
          source_type: 'voice',
          page_count: 0,
          word_count: 120,
          chunk_count: 2,
          created_at: '2026-03-21T15:00:00Z',
          uncertain_span_count: 0,
          doubts_verified: false,
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
          source_type: 'photo',
          page_count: 2,
          word_count: 347,
          chunk_count: 5,
          created_at: '2026-03-23T10:30:00Z',
          uncertain_span_count: 0,
          doubts_verified: false,
        },
        {
          id: 2,
          entry_date: '2026-03-21',
          source_type: 'voice',
          page_count: 0,
          word_count: 120,
          chunk_count: 2,
          created_at: '2026-03-21T15:00:00Z',
          uncertain_span_count: 0,
          doubts_verified: false,
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
        source_type: 'photo' as const,
        page_count: 1,
        word_count: 1,
        chunk_count: 1,
        created_at: '',
        uncertain_span_count: 0,
        doubts_verified: false,
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

describe('Source type column', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.removeItem('journal-entry-columns')
    const { fetchEntries } = await import('@/api/entries')
    vi.mocked(fetchEntries).mockResolvedValue({
      items: [
        {
          id: 1,
          entry_date: '2026-03-22',
          source_type: 'photo',
          page_count: 2,
          word_count: 347,
          chunk_count: 5,
          created_at: '2026-03-23T10:30:00Z',
          uncertain_span_count: 0,
          doubts_verified: false,
        },
        {
          id: 2,
          entry_date: '2026-03-21',
          source_type: 'voice',
          page_count: 0,
          word_count: 120,
          chunk_count: 2,
          created_at: '2026-03-21T15:00:00Z',
          uncertain_span_count: 0,
          doubts_verified: false,
        },
      ],
      total: 2,
      limit: 20,
      offset: 0,
    })
  })

  it('displays human-readable source labels', async () => {
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const cells = wrapper.findAll('[data-testid="source-cell"]')
    expect(cells.length).toBe(2)
    // Default sort is date desc: id=1 (photo) first, id=2 (voice) second
    expect(cells[0].text()).toBe('OCR')
    expect(cells[1].text()).toBe('Audio')
  })
})

describe('Column visibility', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.removeItem('journal-entry-columns')
    const { fetchEntries } = await import('@/api/entries')
    vi.mocked(fetchEntries).mockResolvedValue({
      items: [
        {
          id: 1,
          entry_date: '2026-03-22',
          source_type: 'photo',
          page_count: 2,
          word_count: 347,
          chunk_count: 5,
          created_at: '2026-03-23T10:30:00Z',
          uncertain_span_count: 0,
          doubts_verified: false,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    })
  })
  afterEach(() => {
    localStorage.removeItem('journal-entry-columns')
  })

  it('shows the Columns button', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('[data-testid="columns-button"]').exists()).toBe(true)
  })

  it('toggles the column menu on button click', async () => {
    const wrapper = mountComponent()
    expect(wrapper.find('[data-testid="columns-menu"]').exists()).toBe(false)

    await wrapper.find('[data-testid="columns-button"]').trigger('click')
    expect(wrapper.find('[data-testid="columns-menu"]').exists()).toBe(true)
  })

  it('hides a column when its checkbox is unchecked', async () => {
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    // Source column should be visible by default
    expect(wrapper.find('[data-testid="sort-source"]').exists()).toBe(true)

    // Open menu and uncheck source
    await wrapper.find('[data-testid="columns-button"]').trigger('click')
    await wrapper
      .find('[data-testid="col-toggle-source_type"]')
      .setValue(false)

    expect(wrapper.find('[data-testid="sort-source"]').exists()).toBe(false)
  })

  it('persists column visibility to localStorage', async () => {
    const wrapper = mountComponent()
    await wrapper.find('[data-testid="columns-button"]').trigger('click')
    await wrapper
      .find('[data-testid="col-toggle-source_type"]')
      .setValue(false)

    const stored = JSON.parse(
      localStorage.getItem('journal-entry-columns') ?? '{}',
    )
    expect(stored.source_type).toBe(false)
  })

  it('restores defaults on reset', async () => {
    // Pre-set custom visibility
    localStorage.setItem(
      'journal-entry-columns',
      JSON.stringify({ source_type: false, chunk_count: true }),
    )

    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    // Source should be hidden based on localStorage
    expect(wrapper.find('[data-testid="sort-source"]').exists()).toBe(false)

    // Open menu and click reset
    await wrapper.find('[data-testid="columns-button"]').trigger('click')
    await wrapper.find('[data-testid="columns-reset"]').trigger('click')
    await wrapper.vm.$nextTick()

    // Source back, chunks hidden (default)
    expect(wrapper.find('[data-testid="sort-source"]').exists()).toBe(true)
    expect(localStorage.getItem('journal-entry-columns')).toBeNull()
  })

  it('chunks column is hidden by default', async () => {
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="sort-chunks"]').exists()).toBe(false)
  })
})

describe('OCR Doubts column', () => {
  it('renders uncertain_span_count with color coding', async () => {
    const { fetchEntries } = await import('@/api/entries')
    ;(fetchEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        {
          id: 10,
          entry_date: '2026-04-01',
          source_type: 'photo',
          page_count: 1,
          word_count: 50,
          chunk_count: 1,
          created_at: '2026-04-01T10:00:00Z',
          uncertain_span_count: 0,
          doubts_verified: false,
        },
        {
          id: 11,
          entry_date: '2026-04-02',
          source_type: 'photo',
          page_count: 1,
          word_count: 50,
          chunk_count: 1,
          created_at: '2026-04-02T10:00:00Z',
          uncertain_span_count: 2,
          doubts_verified: false,
        },
        {
          id: 12,
          entry_date: '2026-04-03',
          source_type: 'photo',
          page_count: 1,
          word_count: 50,
          chunk_count: 1,
          created_at: '2026-04-03T10:00:00Z',
          uncertain_span_count: 5,
          doubts_verified: false,
        },
      ],
      total: 3,
      limit: 20,
      offset: 0,
    })

    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const cells = wrapper.findAll('[data-testid="doubts-cell"]')
    expect(cells.length).toBe(3)

    // Default sort is date descending, so order is: id=12, id=11, id=10
    // 5 = red (2026-04-03)
    expect(cells[0].text()).toBe('5')
    expect(cells[0].classes().join(' ')).toContain('red')

    // 2 = amber (2026-04-02)
    expect(cells[1].text()).toBe('2')
    expect(cells[1].classes().join(' ')).toContain('amber')

    // 0 = green (2026-04-01)
    expect(cells[2].text()).toBe('0')
    expect(cells[2].classes().join(' ')).toContain('emerald')
  })
})
