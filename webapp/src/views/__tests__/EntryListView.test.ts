import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import EntryListView from '../EntryListView.vue'

/** Helper to build a mock entry with new-field defaults. */
function mockEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    entry_date: '2026-03-22',
    source_type: 'photo' as const,
    page_count: 2,
    word_count: 347,
    chunk_count: 5,
    created_at: '2026-03-23T10:30:00Z',
    uncertain_span_count: 0,
    doubts_verified: false,
    language: 'en',
    updated_at: '2026-03-23T11:00:00Z',
    entity_mention_count: 3,
    ...overrides,
  }
}

vi.mock('@/api/entries', () => ({
  fetchEntries: vi.fn().mockResolvedValue({
    items: [
      mockEntry({ id: 1, entry_date: '2026-03-22', word_count: 347 }),
      mockEntry({
        id: 2,
        entry_date: '2026-03-21',
        source_type: 'voice',
        page_count: 0,
        word_count: 120,
        chunk_count: 2,
        created_at: '2026-03-21T15:00:00Z',
        updated_at: '2026-03-21T16:00:00Z',
        entity_mention_count: 1,
      }),
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

function cleanupStorage() {
  localStorage.removeItem('journal-entry-columns')
  localStorage.removeItem('journal-entry-column-order')
}

describe('EntryListView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    cleanupStorage()
    // Restore the default mock before each test (pagination tests override it)
    const { fetchEntries } = await import('@/api/entries')
    vi.mocked(fetchEntries).mockResolvedValue({
      items: [
        mockEntry({ id: 1, entry_date: '2026-03-22', word_count: 347 }),
        mockEntry({
          id: 2,
          entry_date: '2026-03-21',
          source_type: 'voice',
          page_count: 0,
          word_count: 120,
          chunk_count: 2,
          created_at: '2026-03-21T15:00:00Z',
          updated_at: '2026-03-21T16:00:00Z',
          entity_mention_count: 1,
        }),
      ],
      total: 2,
      limit: 20,
      offset: 0,
    })
  })
  afterEach(cleanupStorage)

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
      items: Array.from({ length: 20 }, (_, i) => mockEntry({ id: i + 1 })),
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
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('[data-testid="entry-row"]')
    // descending: 2026-03-22 (Mar) first, 2026-03-21 second
    expect(rows[0].text()).toContain('22 Mar')
    expect(rows[1].text()).toContain('21 Mar')
  })

  it('toggles sort direction on column header click', async () => {
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
      items: Array.from({ length: 20 }, (_, i) => mockEntry({ id: i + 1 })),
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
    cleanupStorage()
    const { fetchEntries } = await import('@/api/entries')
    vi.mocked(fetchEntries).mockResolvedValue({
      items: [
        mockEntry({ id: 1, source_type: 'photo' }),
        mockEntry({
          id: 2,
          entry_date: '2026-03-21',
          source_type: 'voice',
          created_at: '2026-03-21T15:00:00Z',
        }),
      ],
      total: 2,
      limit: 20,
      offset: 0,
    })
  })
  afterEach(cleanupStorage)

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
    cleanupStorage()
    const { fetchEntries } = await import('@/api/entries')
    vi.mocked(fetchEntries).mockResolvedValue({
      items: [mockEntry()],
      total: 1,
      limit: 20,
      offset: 0,
    })
  })
  afterEach(cleanupStorage)

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
    await wrapper.find('[data-testid="col-toggle-source_type"]').setValue(false)

    expect(wrapper.find('[data-testid="sort-source"]').exists()).toBe(false)
  })

  it('persists column visibility to localStorage', async () => {
    const wrapper = mountComponent()
    await wrapper.find('[data-testid="columns-button"]').trigger('click')
    await wrapper.find('[data-testid="col-toggle-source_type"]').setValue(false)

    const stored = JSON.parse(
      localStorage.getItem('journal-entry-columns') ?? '{}',
    )
    expect(stored.source_type).toBe(false)
  })

  it('restores defaults on reset', async () => {
    // Pre-set custom visibility and order
    localStorage.setItem(
      'journal-entry-columns',
      JSON.stringify({ source_type: false, chunk_count: true }),
    )
    localStorage.setItem(
      'journal-entry-column-order',
      JSON.stringify([
        'word_count',
        'entry_date',
        'source_type',
        'created_at',
        'uncertain_span_count',
        'page_count',
        'chunk_count',
        'language',
        'updated_at',
        'entity_mention_count',
      ]),
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
    expect(localStorage.getItem('journal-entry-column-order')).toBeNull()
  })

  it('handles corrupted localStorage gracefully', async () => {
    localStorage.setItem('journal-entry-columns', 'not valid json')
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    // Should fall back to defaults — all default-visible columns shown
    expect(wrapper.find('[data-testid="sort-source"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sort-date"]').exists()).toBe(true)
  })

  it('loads saved visibility from localStorage on mount', async () => {
    localStorage.setItem(
      'journal-entry-columns',
      JSON.stringify({
        entry_date: true,
        source_type: false,
        created_at: true,
        uncertain_span_count: true,
        word_count: true,
        page_count: true,
        chunk_count: true,
      }),
    )
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    // Source hidden, chunks shown (overridden from default)
    expect(wrapper.find('[data-testid="sort-source"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sort-chunks"]').exists()).toBe(true)
  })

  it('chunks column is hidden by default', async () => {
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="sort-chunks"]').exists()).toBe(false)
  })

  it('new columns (language, modified, entities) are hidden by default', async () => {
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="sort-language"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sort-modified"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sort-entities"]').exists()).toBe(false)
  })

  it('shows new columns when toggled on', async () => {
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="columns-button"]').trigger('click')
    await wrapper.find('[data-testid="col-toggle-language"]').setValue(true)
    await wrapper.find('[data-testid="col-toggle-updated_at"]').setValue(true)
    await wrapper
      .find('[data-testid="col-toggle-entity_mention_count"]')
      .setValue(true)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="sort-language"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sort-modified"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sort-entities"]').exists()).toBe(true)
  })
})

describe('Source type label mapping', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    cleanupStorage()
    const { fetchEntries } = await import('@/api/entries')
    vi.mocked(fetchEntries).mockResolvedValue({
      items: [
        mockEntry({
          id: 1,
          source_type: 'text_entry',
          word_count: 100,
          chunk_count: 1,
        }),
        mockEntry({
          id: 2,
          entry_date: '2026-03-21',
          source_type: 'imported_text_file',
          word_count: 200,
          chunk_count: 2,
          created_at: '2026-03-21T15:00:00Z',
        }),
        mockEntry({
          id: 3,
          entry_date: '2026-03-20',
          source_type: 'imported_audio_file',
          word_count: 150,
          chunk_count: 1,
          created_at: '2026-03-20T12:00:00Z',
        }),
      ],
      total: 3,
      limit: 20,
      offset: 0,
    })
  })
  afterEach(cleanupStorage)

  it('maps all source types to readable labels', async () => {
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const cells = wrapper.findAll('[data-testid="source-cell"]')
    expect(cells.length).toBe(3)
    // Date desc: id=1 first, id=2 second, id=3 third
    expect(cells[0].text()).toBe('Text')
    expect(cells[1].text()).toBe('File')
    expect(cells[2].text()).toBe('Audio (file)')
  })
})

describe('OCR Doubts column', () => {
  afterEach(cleanupStorage)

  it('renders uncertain_span_count with color coding', async () => {
    const { fetchEntries } = await import('@/api/entries')
    ;(fetchEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        mockEntry({
          id: 10,
          entry_date: '2026-04-01',
          uncertain_span_count: 0,
        }),
        mockEntry({
          id: 11,
          entry_date: '2026-04-02',
          uncertain_span_count: 2,
        }),
        mockEntry({
          id: 12,
          entry_date: '2026-04-03',
          uncertain_span_count: 5,
        }),
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

describe('New columns rendering', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    cleanupStorage()
    const { fetchEntries } = await import('@/api/entries')
    vi.mocked(fetchEntries).mockResolvedValue({
      items: [
        mockEntry({
          id: 1,
          language: 'nl',
          updated_at: '2026-03-24T09:00:00Z',
          entity_mention_count: 7,
        }),
      ],
      total: 1,
      limit: 20,
      offset: 0,
    })
  })
  afterEach(cleanupStorage)

  it('renders language column in uppercase when visible', async () => {
    // Enable the language column
    localStorage.setItem(
      'journal-entry-columns',
      JSON.stringify({
        entry_date: true,
        source_type: true,
        created_at: true,
        uncertain_span_count: true,
        word_count: true,
        page_count: true,
        chunk_count: false,
        language: true,
        updated_at: false,
        entity_mention_count: false,
      }),
    )
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="sort-language"]').exists()).toBe(true)
    // Check that the cell contains the uppercase language
    expect(wrapper.text()).toContain('NL')
  })

  it('renders modified column with formatted datetime when visible', async () => {
    localStorage.setItem(
      'journal-entry-columns',
      JSON.stringify({
        entry_date: true,
        source_type: true,
        created_at: true,
        uncertain_span_count: true,
        word_count: true,
        page_count: true,
        chunk_count: false,
        language: false,
        updated_at: true,
        entity_mention_count: false,
      }),
    )
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="sort-modified"]').exists()).toBe(true)
    // Should contain formatted date
    expect(wrapper.text()).toContain('24 Mar')
  })

  it('renders entities column with count when visible', async () => {
    localStorage.setItem(
      'journal-entry-columns',
      JSON.stringify({
        entry_date: true,
        source_type: true,
        created_at: true,
        uncertain_span_count: true,
        word_count: true,
        page_count: true,
        chunk_count: false,
        language: false,
        updated_at: false,
        entity_mention_count: true,
      }),
    )
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="sort-entities"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('7')
  })
})

describe('Edit mode', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    cleanupStorage()
    const { fetchEntries } = await import('@/api/entries')
    vi.mocked(fetchEntries).mockResolvedValue({
      items: [mockEntry()],
      total: 1,
      limit: 20,
      offset: 0,
    })
  })
  afterEach(cleanupStorage)

  it('shows edit mode toggle button', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('[data-testid="edit-mode-toggle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="edit-mode-toggle"]').text()).toBe('Edit')
  })

  it('toggles edit mode on button click', async () => {
    const wrapper = mountComponent()
    const toggle = wrapper.find('[data-testid="edit-mode-toggle"]')

    await toggle.trigger('click')
    expect(toggle.text()).toBe('Done')

    await toggle.trigger('click')
    expect(toggle.text()).toBe('Edit')
  })

  it('shows drag handles in column menu only when in edit mode', async () => {
    const wrapper = mountComponent()

    // Open column menu — no drag handles yet
    await wrapper.find('[data-testid="columns-button"]').trigger('click')
    expect(wrapper.findAll('[data-testid="drag-handle"]').length).toBe(0)

    // Enter edit mode
    await wrapper.find('[data-testid="edit-mode-toggle"]').trigger('click')
    expect(
      wrapper.findAll('[data-testid="drag-handle"]').length,
    ).toBeGreaterThan(0)

    // Exit edit mode
    await wrapper.find('[data-testid="edit-mode-toggle"]').trigger('click')
    expect(wrapper.findAll('[data-testid="drag-handle"]').length).toBe(0)
  })

  it('menu items are draggable only in edit mode', async () => {
    const wrapper = mountComponent()
    await wrapper.find('[data-testid="columns-button"]').trigger('click')

    const firstItem = wrapper.find('[data-testid="col-item-entry_date"]')
    expect(firstItem.attributes('draggable')).toBe('false')

    await wrapper.find('[data-testid="edit-mode-toggle"]').trigger('click')
    expect(
      wrapper
        .find('[data-testid="col-item-entry_date"]')
        .attributes('draggable'),
    ).toBe('true')
  })
})

describe('Column order', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    cleanupStorage()
    const { fetchEntries } = await import('@/api/entries')
    vi.mocked(fetchEntries).mockResolvedValue({
      items: [mockEntry()],
      total: 1,
      limit: 20,
      offset: 0,
    })
  })
  afterEach(cleanupStorage)

  it('renders columns in default order', async () => {
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const headers = wrapper.findAll('th')
    // Default visible: Date, Source, Ingested, Doubts, Words, Pages
    expect(headers[0].text()).toContain('Date')
    expect(headers[1].text()).toContain('Source')
    expect(headers[2].text()).toContain('Ingested')
  })

  it('loads saved column order from localStorage', async () => {
    // Set order with Source first
    localStorage.setItem(
      'journal-entry-column-order',
      JSON.stringify([
        'source_type',
        'entry_date',
        'created_at',
        'uncertain_span_count',
        'word_count',
        'page_count',
        'chunk_count',
        'language',
        'updated_at',
        'entity_mention_count',
      ]),
    )

    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const headers = wrapper.findAll('th')
    expect(headers[0].text()).toContain('Source')
    expect(headers[1].text()).toContain('Date')
  })

  it('handles corrupted column order localStorage gracefully', async () => {
    localStorage.setItem('journal-entry-column-order', 'not valid json')
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    // Should fall back to defaults
    const headers = wrapper.findAll('th')
    expect(headers[0].text()).toContain('Date')
  })

  it('adds missing columns to the end when new columns are added', async () => {
    // Simulate an old order that doesn't include the new columns
    localStorage.setItem(
      'journal-entry-column-order',
      JSON.stringify([
        'entry_date',
        'source_type',
        'created_at',
        'uncertain_span_count',
        'word_count',
        'page_count',
        'chunk_count',
      ]),
    )

    const wrapper = mountComponent()
    await wrapper.find('[data-testid="columns-button"]').trigger('click')

    // The menu should still include all columns
    expect(wrapper.find('[data-testid="col-item-language"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="col-item-updated_at"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="col-item-entity_mention_count"]').exists(),
    ).toBe(true)
  })

  it('reset restores default column order', async () => {
    localStorage.setItem(
      'journal-entry-column-order',
      JSON.stringify([
        'word_count',
        'entry_date',
        'source_type',
        'created_at',
        'uncertain_span_count',
        'page_count',
        'chunk_count',
        'language',
        'updated_at',
        'entity_mention_count',
      ]),
    )

    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    // Words should be first with custom order
    let headers = wrapper.findAll('th')
    expect(headers[0].text()).toContain('Words')

    // Open menu and reset
    await wrapper.find('[data-testid="columns-button"]').trigger('click')
    await wrapper.find('[data-testid="columns-reset"]').trigger('click')
    await wrapper.vm.$nextTick()

    // Date should be back to first
    headers = wrapper.findAll('th')
    expect(headers[0].text()).toContain('Date')
    expect(localStorage.getItem('journal-entry-column-order')).toBeNull()
  })
})
