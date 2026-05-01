import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import SearchView from '../SearchView.vue'

vi.mock('@/api/search', () => ({
  searchEntries: vi.fn(),
}))

import { searchEntries } from '@/api/search'
const mockSearch = vi.mocked(searchEntries)

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/search', name: 'search', component: SearchView },
    {
      path: '/entries/:id',
      name: 'entry-detail',
      component: { template: '<div />' },
    },
  ],
})

function mountView() {
  return mount(SearchView, {
    global: {
      plugins: [createPinia(), router],
    },
  })
}

interface ItemOpts {
  entry_id?: number
  entry_date?: string
  text?: string
  score?: number
  snippet?: string | null
  matching_chunks?: Array<{
    text: string
    score: number
    chunk_index: number | null
    char_start: number | null
    char_end: number | null
  }>
}

function fakeItem(o: ItemOpts = {}) {
  return {
    entry_id: o.entry_id ?? 1,
    entry_date: o.entry_date ?? '2026-03-22',
    text: o.text ?? 'Vienna trip',
    score: o.score ?? 0.9,
    snippet: o.snippet ?? null,
    matching_chunks: o.matching_chunks ?? [],
  }
}

function fakeResponse(items: ReturnType<typeof fakeItem>[]) {
  return {
    query: 'vienna',
    reranker: 'AnthropicReranker',
    limit: 20,
    offset: 0,
    items,
  }
}

describe('SearchView', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('mounts and shows the initial state before any search', () => {
    const wrapper = mountView()
    expect(wrapper.find('[data-testid="search-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="initial-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="search-results"]').exists()).toBe(false)
  })

  it('does not render the retired mode toggle', () => {
    const wrapper = mountView()
    expect(wrapper.find('[data-testid="search-mode-keyword"]').exists()).toBe(
      false,
    )
    expect(wrapper.find('[data-testid="search-mode-semantic"]').exists()).toBe(
      false,
    )
  })

  it('submitting with an empty query does not fire a request', async () => {
    const wrapper = mountView()
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('submitting a query calls the API without a mode parameter', async () => {
    mockSearch.mockResolvedValue(
      fakeResponse([
        fakeItem({
          entry_id: 1,
          entry_date: '2026-03-22',
          score: 1.0,
          snippet: 'today was \x02Vienna\x03 trip',
        }),
      ]),
    )

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('vienna')
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    expect(mockSearch).toHaveBeenCalledTimes(1)
    const call = mockSearch.mock.calls[0][0]
    expect(call.q).toBe('vienna')
    // `mode` was retired — the request must not include it.
    expect(call).not.toHaveProperty('mode')

    const rows = wrapper.findAll('[data-testid="search-result-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('2026-03-22')
    expect(rows[0].text()).toContain('100%')
  })

  it('renders the empty state when the server returns zero items', async () => {
    mockSearch.mockResolvedValue(fakeResponse([]))

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('nothing')
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="search-results"]').exists()).toBe(false)
  })

  it('renders the server error in an error banner', async () => {
    const { ApiRequestError } = await import('@/api/client')
    mockSearch.mockRejectedValueOnce(
      new ApiRequestError(400, 'invalid_query', 'Query could not be parsed'),
    )

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('"')
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    const banner = wrapper.find('[data-testid="error-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('Query could not be parsed')
  })

  it('applies a date range filter when submitting', async () => {
    mockSearch.mockResolvedValue(fakeResponse([]))

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('vienna')
    await wrapper
      .find('[data-testid="search-start-date"]')
      .setValue('2026-03-01')
    await wrapper.find('[data-testid="search-end-date"]').setValue('2026-03-31')
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    const call = mockSearch.mock.calls[0][0]
    expect(call.start_date).toBe('2026-03-01')
    expect(call.end_date).toBe('2026-03-31')
  })

  it('result link includes ?chunk=N when the dense retriever found a chunk', async () => {
    mockSearch.mockResolvedValue(
      fakeResponse([
        fakeItem({
          entry_id: 42,
          matching_chunks: [
            {
              text: 'Vienna',
              score: 0.9,
              chunk_index: 3,
              char_start: 10,
              char_end: 16,
            },
          ],
        }),
      ]),
    )

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('vienna')
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    const href = wrapper
      .find('[data-testid="search-result-link"]')
      .attributes('href') as string
    expect(href).toContain('/entries/42')
    expect(href).toContain('chunk=3')
  })

  it('result link omits ?chunk= when only BM25 hit (no per-chunk match)', async () => {
    mockSearch.mockResolvedValue(
      fakeResponse([
        fakeItem({
          entry_id: 7,
          score: 1.0,
          snippet: '\x02Vienna\x03',
          matching_chunks: [],
        }),
      ]),
    )

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('vienna')
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    const href = wrapper
      .find('[data-testid="search-result-link"]')
      .attributes('href') as string
    expect(href).toContain('/entries/7')
    expect(href).not.toContain('chunk=')
  })

  it('renders "Matched by keywords" when only BM25 contributed', async () => {
    mockSearch.mockResolvedValue(
      fakeResponse([
        fakeItem({
          score: 1.0,
          snippet: '\x02Vienna\x03 trip',
          matching_chunks: [],
        }),
      ]),
    )

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('vienna')
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    const explanation = wrapper.find('[data-testid="match-explanation"]')
    expect(explanation.exists()).toBe(true)
    expect(explanation.text()).toContain('Matched by keywords')
  })

  it('renders "Matched by meaning" when only dense contributed', async () => {
    mockSearch.mockResolvedValue(
      fakeResponse([
        fakeItem({
          entry_id: 10,
          score: 0.82,
          snippet: null,
          matching_chunks: [
            {
              text: 'Trip to Vienna',
              score: 0.82,
              chunk_index: 0,
              char_start: 0,
              char_end: 14,
            },
          ],
        }),
      ]),
    )

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('travel')
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    const explanation = wrapper.find('[data-testid="match-explanation"]')
    expect(explanation.exists()).toBe(true)
    expect(explanation.text()).toContain('Matched by meaning')
    expect(explanation.text()).toContain('82%')
  })

  it('renders combined "keywords and meaning" when both signals are present', async () => {
    mockSearch.mockResolvedValue(
      fakeResponse([
        fakeItem({
          score: 0.95,
          snippet: '\x02Vienna\x03 trip',
          matching_chunks: [
            {
              text: 'Vienna trip yesterday',
              score: 0.88,
              chunk_index: 0,
              char_start: 0,
              char_end: 21,
            },
          ],
        }),
      ]),
    )

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('vienna')
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    const explanation = wrapper.find('[data-testid="match-explanation"]')
    expect(explanation.exists()).toBe(true)
    expect(explanation.text()).toContain('keywords and meaning')
  })

  it('Next button fires a new search with the advanced offset', async () => {
    const twentyItems = Array.from({ length: 20 }, (_, i) =>
      fakeItem({
        entry_id: i + 1,
        entry_date: `2026-03-${String(i + 1).padStart(2, '0')}`,
        text: `Entry ${i + 1}`,
        score: 0.5,
        matching_chunks: [
          {
            text: `Entry ${i + 1}`,
            score: 0.5,
            chunk_index: 0,
            char_start: 0,
            char_end: 10,
          },
        ],
      }),
    )
    mockSearch.mockResolvedValue(fakeResponse(twentyItems))

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('e')
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    mockSearch.mockClear()
    await wrapper.find('[data-testid="search-next-page"]').trigger('click')
    await flushPromises()

    const call = mockSearch.mock.calls[0][0]
    expect(call.offset).toBe(20)
  })
})
