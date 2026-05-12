import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import StorylineListView from '../StorylineListView.vue'

vi.mock('@/api/storylines', () => ({
  fetchStorylines: vi.fn(),
  fetchStoryline: vi.fn(),
  createStoryline: vi.fn(),
  regenerateStoryline: vi.fn(),
  deleteStoryline: vi.fn(),
}))

import { fetchStorylines } from '@/api/storylines'
const mockFetchStorylines = vi.mocked(fetchStorylines)

function mockSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    user_id: 1,
    entity_id: 100,
    name: 'Running',
    description: '',
    start_date: null,
    end_date: null,
    status: 'active' as const,
    last_generated_at: '2026-05-12T10:00:00Z',
    last_extension_check_at: null,
    created_at: '2026-05-10T00:00:00Z',
    updated_at: '2026-05-12T10:00:00Z',
    ...overrides,
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: StorylineListView },
    {
      path: '/storylines/:id',
      name: 'storyline-detail',
      component: { template: '<div />' },
    },
    {
      path: '/entities/:id',
      component: { template: '<div />' },
    },
  ],
})

function mountComponent() {
  return mount(StorylineListView, {
    global: { plugins: [createPinia(), router] },
  })
}

describe('StorylineListView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockFetchStorylines.mockResolvedValue({
      items: [
        mockSummary({ id: 1, name: 'Running', entity_id: 513 }),
        mockSummary({
          id: 2,
          name: 'Atlas',
          entity_id: 511,
          last_generated_at: '2026-05-11T10:00:00Z',
        }),
      ],
      total: 2,
      limit: 20,
      offset: 0,
    })
  })

  it('renders the heading', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('h1').text()).toBe('Storylines')
  })

  it('loads storylines on mount and renders rows', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    expect(mockFetchStorylines).toHaveBeenCalled()
    const rows = wrapper.findAll('[data-testid="storyline-row"]')
    expect(rows.length).toBe(2)
  })

  it('displays the storyline count after loading', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.find('[data-testid="storyline-count"]').text()).toContain(
      '2 storylines',
    )
  })

  it('renders the empty state when there are no storylines', async () => {
    mockFetchStorylines.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    })
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
  })

  it('shows the error banner when the API fails', async () => {
    mockFetchStorylines.mockRejectedValue(new Error('Backend exploded'))
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.find('[data-testid="error-banner"]').text()).toBe(
      'Backend exploded',
    )
  })

  it('navigates to the detail view when a row is clicked', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    const push = vi.spyOn(router, 'push')
    await wrapper.find('[data-testid="storyline-row"]').trigger('click')
    expect(push).toHaveBeenCalledWith({
      name: 'storyline-detail',
      params: { id: 1 },
    })
  })

  it('toggles sort direction when the same header is clicked twice', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    // Clicking the name header sorts asc (default for "name"); a second
    // click flips to desc.
    await wrapper.find('[data-testid="sort-name"]').trigger('click')
    expect(wrapper.find('[data-testid="sort-name"]').text()).toContain('▲')
    await wrapper.find('[data-testid="sort-name"]').trigger('click')
    expect(wrapper.find('[data-testid="sort-name"]').text()).toContain('▼')
  })

  it('sort indicator is empty for inactive columns', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    // last_generated_at is the default sort; created_at should have no indicator.
    expect(wrapper.find('[data-testid="sort-created"]').text()).toBe('Created')
  })

  it('renders an em dash when last_generated_at is null', async () => {
    mockFetchStorylines.mockResolvedValue({
      items: [
        mockSummary({
          id: 99,
          name: 'Fresh',
          last_generated_at: null,
        }),
      ],
      total: 1,
      limit: 20,
      offset: 0,
    })
    const wrapper = mountComponent()
    await flushPromises()
    const cell = wrapper.find('[data-testid="storyline-last-generated-cell"]')
    expect(cell.text()).toBe('—')
  })

  it('pagination Next button advances the offset', async () => {
    mockFetchStorylines.mockResolvedValue({
      items: Array.from({ length: 20 }, (_, i) =>
        mockSummary({ id: i + 1, name: `S${i}` }),
      ),
      total: 45,
      limit: 20,
      offset: 0,
    })
    const wrapper = mountComponent()
    await flushPromises()
    mockFetchStorylines.mockClear()
    await wrapper.find('[data-testid="next-page"]').trigger('click')
    expect(mockFetchStorylines).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 20 }),
    )
  })

  it('rows-per-page select reloads with the new limit', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    mockFetchStorylines.mockClear()
    const select = wrapper.find('select')
    await select.setValue('50')
    expect(mockFetchStorylines).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 }),
    )
  })
})
