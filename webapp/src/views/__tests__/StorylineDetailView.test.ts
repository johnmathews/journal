import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import StorylineDetailView from '../StorylineDetailView.vue'

vi.mock('@/api/storylines', () => ({
  fetchStorylines: vi.fn(),
  fetchStoryline: vi.fn(),
  createStoryline: vi.fn(),
  regenerateStoryline: vi.fn(),
  deleteStoryline: vi.fn(),
}))

// useJobsStore is only used for trackJob/getJobById here. Stub it so we
// don't have to pull in the entire jobs polling machinery.
const trackJob = vi.fn()
const getJobById = vi.fn(() => undefined)
vi.mock('@/stores/jobs', () => ({
  useJobsStore: () => ({ trackJob, getJobById }),
}))

const toastSuccess = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn() }),
}))

import {
  deleteStoryline,
  fetchStoryline,
  regenerateStoryline,
} from '@/api/storylines'
const mockFetchStoryline = vi.mocked(fetchStoryline)
const mockRegenerate = vi.mocked(regenerateStoryline)
const mockDelete = vi.mocked(deleteStoryline)

function mockDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 3,
    user_id: 1,
    entity_id: 513,
    name: 'Running',
    description: '',
    start_date: null,
    end_date: null,
    status: 'active' as const,
    last_generated_at: '2026-05-12T10:00:00Z',
    last_extension_check_at: null,
    created_at: '2026-05-10T00:00:00Z',
    updated_at: '2026-05-12T10:00:00Z',
    panels: {
      curation: {
        panel_kind: 'curation' as const,
        segments: [
          { kind: 'text' as const, text: 'On Monday, ' },
          { kind: 'citation' as const, entry_id: 11, quote: 'I ran 5km.' },
        ],
        source_entry_ids: [11],
        citation_count: 1,
        model_used: 'haiku-4-5',
        generated_at: '2026-05-12T10:00:00Z',
      },
      narrative: {
        panel_kind: 'narrative' as const,
        segments: [
          { kind: 'text' as const, text: 'A consistent runner. ' },
          { kind: 'citation' as const, entry_id: 11, quote: 'x'.repeat(600) },
        ],
        source_entry_ids: [11],
        citation_count: 1,
        model_used: 'opus-4-7',
        generated_at: '2026-05-12T10:00:00Z',
      },
    },
    ...overrides,
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'storylines', component: { template: '<div />' } },
    {
      path: '/storylines/:id',
      name: 'storyline-detail',
      component: StorylineDetailView,
      props: true,
    },
    {
      path: '/entries/:id',
      component: { template: '<div />' },
    },
    {
      path: '/entities/:id',
      component: { template: '<div />' },
    },
  ],
})

function mountComponent(id = '3') {
  return mount(StorylineDetailView, {
    props: { id },
    global: { plugins: [createPinia(), router] },
  })
}

describe('StorylineDetailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockFetchStoryline.mockResolvedValue(mockDetail())
  })

  it('shows a loading state before the storyline arrives', () => {
    // Never resolve so the loading branch is observable.
    mockFetchStoryline.mockImplementation(() => new Promise(() => {}))
    const wrapper = mountComponent()
    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(true)
  })

  it('loads the storyline on mount and renders both panels', async () => {
    const wrapper = mountComponent('3')
    await flushPromises()
    expect(mockFetchStoryline).toHaveBeenCalledWith(3)
    expect(wrapper.find('[data-testid="storyline-name-heading"]').text()).toBe(
      'Running',
    )
    expect(wrapper.find('[data-testid="curation-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="narrative-panel"]').exists()).toBe(true)
  })

  it('renders the narrative panel BEFORE the curation panel in DOM order (W4)', async () => {
    // Post-W4 layout: narrative section is the first child of the
    // flex row so it lands on the left at the lg: breakpoint. Reading
    // order matters too — narrative is the prose users skim, curation
    // is the supporting index. Locking DOM order here means a future
    // refactor that re-swaps the sections will fail loudly.
    const wrapper = mountComponent('3')
    await flushPromises()
    const sections = wrapper.findAll('section[data-testid$="-panel"]')
    expect(sections.length).toBe(2)
    expect(sections[0].attributes('data-testid')).toBe('narrative-panel')
    expect(sections[1].attributes('data-testid')).toBe('curation-panel')
  })

  it('renders an em dash when last_generated_at is null', async () => {
    mockFetchStoryline.mockResolvedValue(
      mockDetail({ last_generated_at: null }),
    )
    const wrapper = mountComponent()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="storyline-last-generated"]').text(),
    ).toContain('never')
  })

  it('renders the citation count when the narrative panel has citations', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="storyline-citation-count"]').text(),
    ).toContain('1 citation')
  })

  it('hides the citation count badge when there are zero citations', async () => {
    const detail = mockDetail()
    detail.panels.narrative.citation_count = 0
    mockFetchStoryline.mockResolvedValue(detail)
    const wrapper = mountComponent()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="storyline-citation-count"]').exists(),
    ).toBe(false)
  })

  it('renders an empty-state message when a panel has zero segments', async () => {
    const detail = mockDetail()
    detail.panels.curation.segments = []
    mockFetchStoryline.mockResolvedValue(detail)
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.find('[data-testid="curation-empty"]').exists()).toBe(true)
  })

  it('hides the curation date toggle when no citation carries entry_date', async () => {
    // Legacy storylines stored before the server stamped entry_date
    // have no absolute dates available — switching to "Absolute"
    // would silently fall back to the relative label. Hide the
    // toggle entirely rather than showing a broken-looking control.
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.find('[data-testid="curation-date-toggle"]').exists()).toBe(
      false,
    )
  })

  it('shows the curation date toggle when at least one citation has entry_date', async () => {
    const detail = mockDetail()
    detail.panels.curation.segments = [
      { kind: 'text' as const, text: 'It begins:' },
      {
        kind: 'citation' as const,
        entry_id: 11,
        quote: 'q',
        entry_date: '2026-02-15',
      } as never,
    ]
    mockFetchStoryline.mockResolvedValue(detail)
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.find('[data-testid="curation-date-toggle"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="curation-date-toggle-relative"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="curation-date-toggle-absolute"]').exists(),
    ).toBe(true)
  })

  it('clicking the Absolute toggle switches the curation panel to absolute dates', async () => {
    const detail = mockDetail()
    detail.panels.curation.segments = [
      { kind: 'text' as const, text: 'It begins on 2026-02-15:' },
      {
        kind: 'citation' as const,
        entry_id: 11,
        quote: 'q',
        entry_date: '2026-02-15',
      } as never,
    ]
    mockFetchStoryline.mockResolvedValue(detail)
    const wrapper = mountComponent()
    await flushPromises()
    // Default mode is relative — date column shows the LLM phrase.
    expect(wrapper.get('[data-testid="curation-row-date-1"]').text()).toBe(
      'It begins on 2026-02-15',
    )
    await wrapper
      .find('[data-testid="curation-date-toggle-absolute"]')
      .trigger('click')
    expect(wrapper.get('[data-testid="curation-row-date-1"]').text()).toBe(
      '2026-02-15',
    )
  })

  it('clicking Regenerate calls the API and tracks the job', async () => {
    mockRegenerate.mockResolvedValue({ job_id: 'job-99', status: 'queued' })
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="regenerate-button"]').trigger('click')
    await flushPromises()
    expect(mockRegenerate).toHaveBeenCalledWith(3, undefined)
    expect(trackJob).toHaveBeenCalledWith('job-99', 'storyline_generation', {
      storyline_id: 3,
    })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('clicking Regenerate surfaces a banner on failure', async () => {
    mockRegenerate.mockRejectedValue(new Error('service down'))
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="regenerate-button"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="regenerate-error-banner"]').text()).toBe(
      'service down',
    )
  })

  it('Back button navigates to the storylines list', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    const push = vi.spyOn(router, 'push')
    await wrapper.find('[data-testid="back-button"]').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'storylines' })
  })

  // happy-dom doesn't provide window.confirm, so we stub it directly
  // (vi.spyOn refuses to spy an undefined property).
  function stubConfirm(value: boolean): {
    confirmMock: ReturnType<typeof vi.fn>
    restore: () => void
  } {
    const originalConfirm = window.confirm
    const confirmMock = vi.fn().mockReturnValue(value)
    window.confirm = confirmMock as unknown as typeof window.confirm
    return {
      confirmMock,
      restore: () => {
        window.confirm = originalConfirm
      },
    }
  }

  it('Delete button confirms then navigates back on success', async () => {
    mockDelete.mockResolvedValue({ deleted: true })
    const { confirmMock, restore } = stubConfirm(true)
    const wrapper = mountComponent()
    await flushPromises()
    const push = vi.spyOn(router, 'push')
    await wrapper.find('[data-testid="delete-button"]').trigger('click')
    await flushPromises()
    expect(confirmMock).toHaveBeenCalled()
    expect(mockDelete).toHaveBeenCalledWith(3)
    expect(push).toHaveBeenCalledWith({ name: 'storylines' })
    restore()
  })

  it('Delete button is a no-op when the user cancels', async () => {
    mockDelete.mockResolvedValue({ deleted: true })
    const { restore } = stubConfirm(false)
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="delete-button"]').trigger('click')
    await flushPromises()
    expect(mockDelete).not.toHaveBeenCalled()
    restore()
  })

  it('Delete shows an error banner when the API fails', async () => {
    mockDelete.mockRejectedValue(new Error('forbidden'))
    const { restore } = stubConfirm(true)
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="delete-button"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="delete-error-banner"]').text()).toBe(
      'forbidden',
    )
    restore()
  })

  it('shows the error banner when the storyline fetch fails', async () => {
    mockFetchStoryline.mockRejectedValue(new Error('not found'))
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.find('[data-testid="error-banner"]').text()).toBe(
      'not found',
    )
  })

  it('shares citation numbering across panels (narrative drives)', async () => {
    // Narrative cites entry 7 first → that's [1]. Curation also cites
    // entry 7; it must show [1] too (shared registry). Curation-only
    // entry 99 picks up [2].
    const detail = mockDetail()
    detail.panels.narrative.segments = [
      { kind: 'text' as const, text: 'first ' },
      { kind: 'citation' as const, entry_id: 7, quote: 'shared quote' },
    ]
    detail.panels.curation.segments = [
      { kind: 'text' as const, text: 'On Monday' },
      { kind: 'citation' as const, entry_id: 7, quote: 'curation-side quote' },
      { kind: 'text' as const, text: 'On Tuesday' },
      { kind: 'citation' as const, entry_id: 99, quote: 'q' },
    ]
    mockFetchStoryline.mockResolvedValue(detail)
    const wrapper = mountComponent()
    await flushPromises()
    // Narrative footnote [1] exists; [2] does not (narrative only cites 7).
    expect(wrapper.find('[data-testid="narrative-footnote-1"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="narrative-footnote-2"]').exists()).toBe(
      false,
    )
    // Curation row for entry 7 carries the same [1]; entry 99 → [2].
    expect(
      wrapper.find('[data-testid="curation-row-link-1"]').text(),
    ).toContain('[1]')
    expect(
      wrapper.find('[data-testid="curation-row-link-2"]').text(),
    ).toContain('[2]')
  })
})
