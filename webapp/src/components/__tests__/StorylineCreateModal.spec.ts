import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import StorylineCreateModal from '../StorylineCreateModal.vue'
import { useStorylinesStore } from '@/stores/storylines'
import { useJobsStore } from '@/stores/jobs'
import type { EntitySummary } from '@/types/entity'

vi.mock('@/api/entities', () => ({
  fetchEntities: vi.fn(),
}))

import { fetchEntities } from '@/api/entities'
const mockFetchEntities = vi.mocked(fetchEntities)

function cleanupBody(): void {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
}

function makeEntity(overrides: Partial<EntitySummary> = {}): EntitySummary {
  return {
    id: 100,
    entity_type: 'activity',
    canonical_name: 'Running',
    aliases: [],
    mention_count: 5,
    first_seen: '2026-01-01',
    last_seen: '2026-05-01',
    ...overrides,
  }
}

function mountModal(open = true) {
  return mount(StorylineCreateModal, {
    props: { modelValue: open },
    attachTo: document.body,
    global: { plugins: [createPinia()] },
  })
}

describe('StorylineCreateModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanupBody()
    vi.restoreAllMocks()
  })

  it('renders nothing while closed', () => {
    mountModal(false)
    expect(
      document.body.querySelector('[data-testid="storyline-create-modal"]'),
    ).toBeNull()
  })

  it('renders the form sections when open', async () => {
    mountModal(true)
    await nextTick()
    expect(
      document.body.querySelector('[data-testid="storyline-create-modal"]'),
    ).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="storyline-entity-search"]'),
    ).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="storyline-create-name"]'),
    ).not.toBeNull()
    expect(
      document.body.querySelector(
        '[data-testid="storyline-create-start-date"]',
      ),
    ).not.toBeNull()
  })

  it('Submit is disabled while no entity is picked', async () => {
    mountModal(true)
    await nextTick()
    const submit = document.body.querySelector(
      '[data-testid="storyline-create-submit"]',
    ) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  it('debounces the entity search before calling fetchEntities', async () => {
    mockFetchEntities.mockResolvedValue({
      items: [makeEntity()],
      total: 1,
      limit: 20,
      offset: 0,
    })
    mountModal(true)
    await nextTick()

    const input = document.body.querySelector(
      '[data-testid="storyline-entity-search"]',
    ) as HTMLInputElement
    input.value = 'run'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    // Not yet called: still inside the 250ms debounce window.
    expect(mockFetchEntities).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(260)
    expect(mockFetchEntities).toHaveBeenCalledWith({
      search: 'run',
      limit: 20,
    })
  })

  it('empty search query does not call fetchEntities', async () => {
    mountModal(true)
    await nextTick()

    const input = document.body.querySelector(
      '[data-testid="storyline-entity-search"]',
    ) as HTMLInputElement
    input.value = '   '
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(260)
    expect(mockFetchEntities).not.toHaveBeenCalled()
  })

  it('picking an entity auto-fills the name field and shows the picked chip', async () => {
    mockFetchEntities.mockResolvedValue({
      items: [makeEntity({ canonical_name: 'Bouldering' })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    mountModal(true)
    await nextTick()

    const input = document.body.querySelector(
      '[data-testid="storyline-entity-search"]',
    ) as HTMLInputElement
    input.value = 'bo'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(260)
    await flushPromises()

    const result = document.body.querySelector(
      '[data-testid="storyline-entity-result"]',
    ) as HTMLElement
    result.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(
      document.body.querySelectorAll('[data-testid="storyline-picked-chip"]')
        .length,
    ).toBe(1)
    const nameInput = document.body.querySelector(
      '[data-testid="storyline-create-name"]',
    ) as HTMLInputElement
    expect(nameInput.value).toBe('Bouldering')
  })

  it('manually editing name then picking another entity preserves the user override', async () => {
    mockFetchEntities.mockResolvedValue({
      items: [makeEntity({ id: 1, canonical_name: 'Alpha' })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    mountModal(true)
    await nextTick()

    const nameInput = document.body.querySelector(
      '[data-testid="storyline-create-name"]',
    ) as HTMLInputElement
    nameInput.value = 'My custom name'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    const input = document.body.querySelector(
      '[data-testid="storyline-entity-search"]',
    ) as HTMLInputElement
    input.value = 'a'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(260)
    await flushPromises()

    const result = document.body.querySelector(
      '[data-testid="storyline-entity-result"]',
    ) as HTMLElement
    result.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(nameInput.value).toBe('My custom name')
  })

  it('Submit is enabled once an entity is picked and name is non-empty', async () => {
    mockFetchEntities.mockResolvedValue({
      items: [makeEntity()],
      total: 1,
      limit: 20,
      offset: 0,
    })
    mountModal(true)
    await nextTick()

    const input = document.body.querySelector(
      '[data-testid="storyline-entity-search"]',
    ) as HTMLInputElement
    input.value = 'r'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(260)
    await flushPromises()
    const result = document.body.querySelector(
      '[data-testid="storyline-entity-result"]',
    ) as HTMLElement
    result.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    const submit = document.body.querySelector(
      '[data-testid="storyline-create-submit"]',
    ) as HTMLButtonElement
    expect(submit.disabled).toBe(false)
  })

  it('Submit calls store.createStoryline with the picked payload and emits created', async () => {
    mockFetchEntities.mockResolvedValue({
      items: [makeEntity({ id: 42, canonical_name: 'Lifting' })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    const wrapper = mountModal(true)
    await nextTick()

    const store = useStorylinesStore()
    const createSpy = vi.spyOn(store, 'createStoryline').mockResolvedValue({
      id: 7,
      user_id: 1,
      entity_ids: [42],
      name: 'Lifting',
      description: '',
      status: 'active',
      created_at: '2026-05-12T00:00:00Z',
      generation_job_id: 'gen-job-1',
    })

    const jobsStore = useJobsStore()
    const trackSpy = vi
      .spyOn(jobsStore, 'trackJob')
      .mockImplementation(() => {})

    // Pick the entity
    const input = document.body.querySelector(
      '[data-testid="storyline-entity-search"]',
    ) as HTMLInputElement
    input.value = 'l'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(260)
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="storyline-entity-result"]',
      ) as HTMLElement
    ).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    // Submit
    const submit = document.body.querySelector(
      '[data-testid="storyline-create-submit"]',
    ) as HTMLElement
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(createSpy).toHaveBeenCalledWith({
      entity_ids: [42],
      name: 'Lifting',
    })
    expect(trackSpy).toHaveBeenCalledWith('gen-job-1', 'storyline_generation', {
      storyline_id: 7,
    })
    expect(wrapper.emitted('created')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
  })

  it('Submit forwards description and dates when provided', async () => {
    mockFetchEntities.mockResolvedValue({
      items: [makeEntity({ id: 12 })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    mountModal(true)
    await nextTick()

    const store = useStorylinesStore()
    const createSpy = vi.spyOn(store, 'createStoryline').mockResolvedValue({
      id: 1,
      user_id: 1,
      entity_ids: [12],
      name: 'Running',
      description: 'desc',
      status: 'active',
      created_at: '2026-05-12T00:00:00Z',
    })

    const input = document.body.querySelector(
      '[data-testid="storyline-entity-search"]',
    ) as HTMLInputElement
    input.value = 'r'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(260)
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="storyline-entity-result"]',
      ) as HTMLElement
    ).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    const desc = document.body.querySelector(
      '[data-testid="storyline-create-description"]',
    ) as HTMLTextAreaElement
    desc.value = 'desc'
    desc.dispatchEvent(new Event('input', { bubbles: true }))
    const start = document.body.querySelector(
      '[data-testid="storyline-create-start-date"]',
    ) as HTMLInputElement
    start.value = '2026-01-01'
    start.dispatchEvent(new Event('input', { bubbles: true }))
    const end = document.body.querySelector(
      '[data-testid="storyline-create-end-date"]',
    ) as HTMLInputElement
    end.value = '2026-05-01'
    end.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    const submit = document.body.querySelector(
      '[data-testid="storyline-create-submit"]',
    ) as HTMLElement
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(createSpy).toHaveBeenCalledWith({
      entity_ids: [12],
      name: 'Running',
      description: 'desc',
      start_date: '2026-01-01',
      end_date: '2026-05-01',
    })
  })

  it('shows the error banner and stays open when createStoryline rejects', async () => {
    mockFetchEntities.mockResolvedValue({
      items: [makeEntity()],
      total: 1,
      limit: 20,
      offset: 0,
    })
    const wrapper = mountModal(true)
    await nextTick()

    const store = useStorylinesStore()
    vi.spyOn(store, 'createStoryline').mockRejectedValue(
      new Error('entity already has a storyline'),
    )
    // Manually set the error since the spy throws before the store body runs.
    store.createError = 'entity already has a storyline'

    const input = document.body.querySelector(
      '[data-testid="storyline-entity-search"]',
    ) as HTMLInputElement
    input.value = 'r'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(260)
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="storyline-entity-result"]',
      ) as HTMLElement
    ).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    const submit = document.body.querySelector(
      '[data-testid="storyline-create-submit"]',
    ) as HTMLElement
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(
      document.body.querySelector('[data-testid="create-error-banner"]'),
    ).not.toBeNull()
    // Modal stays open — should not have emitted `false`.
    const updates = wrapper.emitted('update:modelValue') ?? []
    expect(updates.some((u) => u[0] === false)).toBe(false)
  })

  it('Cancel closes the modal', async () => {
    const wrapper = mountModal(true)
    await nextTick()
    const cancel = document.body.querySelector(
      '[data-testid="storyline-create-cancel"]',
    ) as HTMLElement
    cancel.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
  })

  it('clicking remove on a picked chip drops it from the anchor set', async () => {
    mockFetchEntities.mockResolvedValue({
      items: [makeEntity()],
      total: 1,
      limit: 20,
      offset: 0,
    })
    mountModal(true)
    await nextTick()
    const input = document.body.querySelector(
      '[data-testid="storyline-entity-search"]',
    ) as HTMLInputElement
    input.value = 'r'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(260)
    await flushPromises()
    ;(
      document.body.querySelector(
        '[data-testid="storyline-entity-result"]',
      ) as HTMLElement
    ).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    // Picked chip exists.
    expect(
      document.body.querySelectorAll('[data-testid="storyline-picked-chip"]')
        .length,
    ).toBe(1)

    // Click the × on the chip — it's the only remove-anchor button.
    const remove = document.body.querySelector(
      '[data-testid="storyline-remove-anchor"]',
    ) as HTMLElement
    remove.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    // No picked chips remain, search input stays visible.
    expect(
      document.body.querySelectorAll('[data-testid="storyline-picked-chip"]')
        .length,
    ).toBe(0)
    expect(
      document.body.querySelector('[data-testid="storyline-entity-search"]'),
    ).not.toBeNull()
  })

  it('clicking the same result twice toggles it off (multi-select set semantics)', async () => {
    mockFetchEntities.mockResolvedValue({
      items: [makeEntity()],
      total: 1,
      limit: 20,
      offset: 0,
    })
    mountModal(true)
    await nextTick()
    const input = document.body.querySelector(
      '[data-testid="storyline-entity-search"]',
    ) as HTMLInputElement
    input.value = 'r'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(260)
    await flushPromises()
    const result = document.body.querySelector(
      '[data-testid="storyline-entity-result"]',
    ) as HTMLElement
    result.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(
      document.body.querySelectorAll('[data-testid="storyline-picked-chip"]')
        .length,
    ).toBe(1)
    // Second click on the same result toggles it off.
    result.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(
      document.body.querySelectorAll('[data-testid="storyline-picked-chip"]')
        .length,
    ).toBe(0)
  })

  it('surfaces an inline search error when fetchEntities rejects', async () => {
    mockFetchEntities.mockRejectedValue(new Error('search service down'))
    mountModal(true)
    await nextTick()
    const input = document.body.querySelector(
      '[data-testid="storyline-entity-search"]',
    ) as HTMLInputElement
    input.value = 'r'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(260)
    await flushPromises()
    const err = document.body.querySelector(
      '[data-testid="storyline-entity-search-error"]',
    )
    expect(err?.textContent).toContain('search service down')
  })
})
