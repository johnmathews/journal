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

vi.mock('@/api/entities', () => ({
  fetchEntities: vi.fn().mockResolvedValue({
    items: [],
    total: 0,
    limit: 20,
    offset: 0,
  }),
}))

import {
  deleteStoryline,
  fetchStorylines,
  regenerateStoryline,
} from '@/api/storylines'
const mockFetchStorylines = vi.mocked(fetchStorylines)
const mockDeleteStoryline = vi.mocked(deleteStoryline)
const mockRegenerateStoryline = vi.mocked(regenerateStoryline)

function mockSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    user_id: 1,
    anchors: [{ id: 100, canonical_name: 'Running' }],
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
        mockSummary({
          id: 1,
          name: 'Running',
          anchors: [{ id: 513, canonical_name: 'Vienna' }],
        }),
        mockSummary({
          id: 2,
          name: 'Atlas',
          anchors: [{ id: 511, canonical_name: 'Atlas' }],
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

  // --- W9: New storyline button + create modal ---

  it('renders the New storyline button', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.find('[data-testid="new-storyline-button"]').exists()).toBe(
      true,
    )
  })

  it('clicking the New storyline button opens the create modal', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="new-storyline-button"]').trigger('click')
    await flushPromises()
    // Modal renders via <Teleport to="body">.
    expect(
      document.body.querySelector('[data-testid="storyline-create-modal"]'),
    ).not.toBeNull()
    // Clean up teleported nodes so they don't bleed into other tests.
    document.body.innerHTML = ''
  })

  // --- W10: per-row + bulk delete + selection toolbar ---

  it('header checkbox toggles selection for all rows on the current page', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    const headerCheckbox = wrapper.find('[data-testid="select-all-checkbox"]')
    await headerCheckbox.trigger('change')
    await flushPromises()
    expect(wrapper.find('[data-testid="selection-toolbar"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="selection-toolbar"]').text()).toContain(
      '2 selected',
    )
  })

  it('per-row checkbox toggles a single selection', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    const checkboxes = wrapper.findAll('[data-testid="storyline-checkbox"]')
    await checkboxes[0].trigger('change')
    await flushPromises()
    expect(wrapper.find('[data-testid="selection-toolbar"]').text()).toContain(
      '1 selected',
    )
  })

  it('per-row Delete button calls window.confirm and store.removeStoryline on accept', async () => {
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    mockDeleteStoryline.mockResolvedValue({ deleted: true })

    const wrapper = mountComponent()
    await flushPromises()
    const deleteButtons = wrapper.findAll('[data-testid="row-delete-button"]')
    await deleteButtons[0].trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalled()
    expect(mockDeleteStoryline).toHaveBeenCalledWith(1)
    vi.unstubAllGlobals()
  })

  it('per-row Delete button does nothing when confirm is cancelled', async () => {
    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper
      .findAll('[data-testid="row-delete-button"]')[0]
      .trigger('click')
    await flushPromises()
    expect(mockDeleteStoryline).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('bulk Delete iterates removeStoryline for each selected id', async () => {
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    mockDeleteStoryline.mockResolvedValue({ deleted: true })

    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="select-all-checkbox"]').trigger('change')
    await flushPromises()
    await wrapper.find('[data-testid="bulk-delete-button"]').trigger('click')
    await flushPromises()
    expect(mockDeleteStoryline).toHaveBeenCalledTimes(2)
    expect(mockDeleteStoryline).toHaveBeenCalledWith(1)
    expect(mockDeleteStoryline).toHaveBeenCalledWith(2)
    vi.unstubAllGlobals()
  })

  it('shows the delete-error banner when a delete fails', async () => {
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    mockDeleteStoryline.mockRejectedValue(new Error('forbidden'))

    const wrapper = mountComponent()
    await flushPromises()
    await wrapper
      .findAll('[data-testid="row-delete-button"]')[0]
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="delete-error-banner"]').text()).toBe(
      'forbidden',
    )
    vi.unstubAllGlobals()
  })

  it('bulk delete with mixed failure surfaces the partial-failure banner', async () => {
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    mockDeleteStoryline.mockImplementation((id: number) => {
      if (id === 1) return Promise.reject(new Error('nope'))
      return Promise.resolve({ deleted: true })
    })

    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="select-all-checkbox"]').trigger('change')
    await flushPromises()
    await wrapper.find('[data-testid="bulk-delete-button"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="delete-error-banner"]').exists()).toBe(
      true,
    )
    vi.unstubAllGlobals()
  })

  it('clear-selection button empties the selection set', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="select-all-checkbox"]').trigger('change')
    await flushPromises()
    expect(wrapper.find('[data-testid="selection-toolbar"]').exists()).toBe(
      true,
    )
    await wrapper.find('[data-testid="clear-selection"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="selection-toolbar"]').exists()).toBe(
      false,
    )
  })

  // --- W11: regenerate modal ---

  it('per-row Regenerate button opens the regenerate modal with that id', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    const regenButtons = wrapper.findAll(
      '[data-testid="row-regenerate-button"]',
    )
    await regenButtons[0].trigger('click')
    await flushPromises()
    expect(
      document.body.querySelector('[data-testid="storyline-regenerate-modal"]'),
    ).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="storyline-regenerate-count"]')
        ?.textContent,
    ).toContain('1 storyline')
    document.body.innerHTML = ''
  })

  it('selection-toolbar Regenerate opens the modal with all selected ids', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="select-all-checkbox"]').trigger('change')
    await flushPromises()
    await wrapper
      .find('[data-testid="bulk-regenerate-button"]')
      .trigger('click')
    await flushPromises()
    expect(
      document.body.querySelector('[data-testid="storyline-regenerate-count"]')
        ?.textContent,
    ).toContain('2 storyline')

    // Confirm that submitting hits the API for each selected id.
    mockRegenerateStoryline.mockResolvedValue({
      job_id: 'job-x',
      status: 'queued',
    })
    const submit = document.body.querySelector(
      '[data-testid="storyline-regenerate-submit"]',
    ) as HTMLElement
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(mockRegenerateStoryline).toHaveBeenCalledTimes(2)
    document.body.innerHTML = ''
  })
})
