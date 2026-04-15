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

  it('submitting with an empty query does not fire a request', async () => {
    const wrapper = mountView()
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('submitting a query calls the API with keyword mode by default', async () => {
    mockSearch.mockResolvedValue({
      query: 'vienna',
      mode: 'keyword',
      limit: 20,
      offset: 0,
      items: [
        {
          entry_id: 1,
          entry_date: '2026-03-22',
          text: 'Vienna trip',
          score: 1.0,
          snippet: 'today was \x02Vienna\x03 trip',
          matching_chunks: [],
        },
      ],
    })

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('vienna')
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    expect(mockSearch).toHaveBeenCalledTimes(1)
    const call = mockSearch.mock.calls[0][0]
    expect(call.q).toBe('vienna')
    expect(call.mode).toBe('keyword')

    const rows = wrapper.findAll('[data-testid="search-result-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('2026-03-22')
    expect(rows[0].text()).toContain('100%')
  })

  it('switching to semantic mode runs a semantic search', async () => {
    mockSearch.mockResolvedValue({
      query: 'vienna',
      mode: 'semantic',
      limit: 20,
      offset: 0,
      items: [
        {
          entry_id: 2,
          entry_date: '2026-03-23',
          text: 'Vienna today',
          score: 0.85,
          snippet: null,
          matching_chunks: [
            {
              text: 'Vienna today was great',
              score: 0.85,
              chunk_index: 0,
              char_start: 0,
              char_end: 22,
            },
          ],
        },
      ],
    })

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('vienna')
    await wrapper.find('[data-testid="search-mode-semantic"]').trigger('click')
    await flushPromises()

    const call = mockSearch.mock.calls[0][0]
    expect(call.mode).toBe('semantic')
  })

  it('renders the empty state when the server returns zero items', async () => {
    mockSearch.mockResolvedValue({
      query: 'nothing',
      mode: 'semantic',
      limit: 20,
      offset: 0,
      items: [],
    })

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
    mockSearch.mockResolvedValue({
      query: 'vienna',
      mode: 'semantic',
      limit: 20,
      offset: 0,
      items: [],
    })

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

  it('result click-through links include ?chunk=N for semantic hits', async () => {
    mockSearch.mockResolvedValue({
      query: 'vienna',
      mode: 'semantic',
      limit: 20,
      offset: 0,
      items: [
        {
          entry_id: 42,
          entry_date: '2026-03-22',
          text: 'Vienna',
          score: 0.9,
          snippet: null,
          matching_chunks: [
            {
              text: 'Vienna',
              score: 0.9,
              chunk_index: 3,
              char_start: 10,
              char_end: 16,
            },
          ],
        },
      ],
    })

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('vienna')
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    const link = wrapper.find('[data-testid="search-result-link"]')
    const href = link.attributes('href') as string
    expect(href).toContain('/entries/42')
    expect(href).toContain('chunk=3')
  })

  it('keyword result click-through has no ?chunk param (no per-chunk match)', async () => {
    mockSearch.mockResolvedValue({
      query: 'vienna',
      mode: 'keyword',
      limit: 20,
      offset: 0,
      items: [
        {
          entry_id: 7,
          entry_date: '2026-03-22',
          text: 'Vienna',
          score: 1.0,
          snippet: '\x02Vienna\x03',
          matching_chunks: [],
        },
      ],
    })

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

  it('clicking a mode button triggers a search when there is a query', async () => {
    mockSearch.mockResolvedValue({
      query: 'vienna',
      mode: 'semantic',
      limit: 20,
      offset: 0,
      items: [],
    })

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('vienna')
    await wrapper.find('[data-testid="search-mode-semantic"]').trigger('click')
    await flushPromises()

    expect(mockSearch).toHaveBeenCalledTimes(1)
    expect(mockSearch.mock.calls[0][0].mode).toBe('semantic')
  })

  it('clicking a mode button does not trigger a search when query is empty', async () => {
    const wrapper = mountView()
    await wrapper.find('[data-testid="search-mode-semantic"]').trigger('click')
    await flushPromises()

    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('shows semantic match explanation for semantic results', async () => {
    mockSearch.mockResolvedValue({
      query: 'travel',
      mode: 'semantic',
      limit: 20,
      offset: 0,
      items: [
        {
          entry_id: 10,
          entry_date: '2026-03-22',
          text: 'We went on a trip to Vienna',
          score: 0.82,
          snippet: null,
          matching_chunks: [
            {
              text: 'We went on a trip to Vienna',
              score: 0.82,
              chunk_index: 0,
              char_start: 0,
              char_end: 27,
            },
          ],
        },
      ],
    })

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('travel')
    await wrapper.find('[data-testid="search-mode-semantic"]').trigger('click')
    await flushPromises()

    const explanation = wrapper.find('[data-testid="semantic-explanation"]')
    expect(explanation.exists()).toBe(true)
    expect(explanation.text()).toContain('Matched by meaning')
    expect(explanation.text()).toContain('82%')
  })

  it('does not show semantic explanation for keyword results', async () => {
    mockSearch.mockResolvedValue({
      query: 'vienna',
      mode: 'keyword',
      limit: 20,
      offset: 0,
      items: [
        {
          entry_id: 10,
          entry_date: '2026-03-22',
          text: 'Vienna trip',
          score: 1.0,
          snippet: '\x02Vienna\x03 trip',
          matching_chunks: [],
        },
      ],
    })

    const wrapper = mountView()
    await wrapper.find('[data-testid="search-query-input"]').setValue('vienna')
    await wrapper.find('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="semantic-explanation"]').exists()).toBe(
      false,
    )
  })

  it('Next button fires a new search with the advanced offset', async () => {
    // Return exactly `limit` items so canNext flips on.
    const twentyItems = Array.from({ length: 20 }, (_, i) => ({
      entry_id: i + 1,
      entry_date: `2026-03-${String(i + 1).padStart(2, '0')}`,
      text: `Entry ${i + 1}`,
      score: 0.5,
      snippet: null,
      matching_chunks: [
        {
          text: `Entry ${i + 1}`,
          score: 0.5,
          chunk_index: 0,
          char_start: 0,
          char_end: 10,
        },
      ],
    }))
    mockSearch.mockResolvedValue({
      query: 'e',
      mode: 'semantic',
      limit: 20,
      offset: 0,
      items: twentyItems,
    })

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
