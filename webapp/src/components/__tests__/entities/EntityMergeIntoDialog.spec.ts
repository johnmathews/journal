import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import EntityMergeIntoDialog from '@/components/entities/EntityMergeIntoDialog.vue'

vi.mock('@/api/entities', () => ({
  fetchEntities: vi.fn(),
  mergeEntities: vi.fn(),
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/entities/:id',
      name: 'entity-detail',
      component: { template: '<div/>' },
      props: true,
    },
  ],
})

function mountDialog(open = true) {
  return mount(EntityMergeIntoDialog, {
    props: {
      modelValue: open,
      currentEntityId: 99,
      currentEntityName: 'Sarah Duplicate',
      currentEntityType: 'person' as const,
    },
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('EntityMergeIntoDialog', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('does not render when closed', () => {
    mountDialog(false)
    expect(
      document.querySelector('[data-testid="merge-into-dialog"]'),
    ).toBeNull()
  })

  it('searches and lists candidates filtered by entity_type', async () => {
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValue({
      items: [
        {
          id: 7,
          entity_type: 'person',
          canonical_name: 'Sarah',
          aliases: [],
          mention_count: 12,
          first_seen: '2026-01-01',
          last_seen: '2026-04-01',
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    })

    mountDialog()
    await flushPromises()

    const input = document.querySelector(
      '[data-testid="merge-into-search"]',
    ) as HTMLInputElement
    input.value = 'Sarah'
    input.dispatchEvent(new Event('input'))
    // Debounce of 200ms in the component.
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()

    expect(fetchEntities).toHaveBeenCalledWith({
      search: 'Sarah',
      type: 'person',
      limit: 10,
    })
    expect(
      document.querySelector('[data-testid="merge-into-radio-7"]'),
    ).toBeTruthy()
  })

  it('hides the current entity from the candidate list', async () => {
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValue({
      items: [
        {
          id: 99, // same id as currentEntityId — must be filtered out
          entity_type: 'person',
          canonical_name: 'Sarah Duplicate',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
          last_seen: '',
        },
        {
          id: 7,
          entity_type: 'person',
          canonical_name: 'Sarah',
          aliases: [],
          mention_count: 12,
          first_seen: '2026-01-01',
          last_seen: '',
        },
      ],
      total: 2,
      limit: 10,
      offset: 0,
    })

    mountDialog()
    const input2 = document.querySelector(
      '[data-testid="merge-into-search"]',
    ) as HTMLInputElement
    input2.value = 'Sarah'
    input2.dispatchEvent(new Event('input'))
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()

    expect(
      document.querySelector('[data-testid="merge-into-radio-99"]'),
    ).toBeNull()
    expect(
      document.querySelector('[data-testid="merge-into-radio-7"]'),
    ).toBeTruthy()
  })

  it('confirms the merge and routes to the survivor', async () => {
    const { fetchEntities, mergeEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValue({
      items: [
        {
          id: 7,
          entity_type: 'person',
          canonical_name: 'Sarah',
          aliases: [],
          mention_count: 12,
          first_seen: '2026-01-01',
          last_seen: '',
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    })
    vi.mocked(mergeEntities).mockResolvedValue({
      survivor: {
        id: 7,
        entity_type: 'person',
        canonical_name: 'Sarah',
        description: '',
        aliases: [],
        first_seen: '2026-01-01',
        created_at: '',
        updated_at: '',
      },
      absorbed_ids: [99],
      mentions_reassigned: 1,
      relationships_reassigned: 0,
      aliases_added: 1,
    })

    const pushSpy = vi.spyOn(router, 'push')

    mountDialog()
    const input3 = document.querySelector(
      '[data-testid="merge-into-search"]',
    ) as HTMLInputElement
    input3.value = 'Sarah'
    input3.dispatchEvent(new Event('input'))
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()

    const radio = document.querySelector(
      '[data-testid="merge-into-radio-7"]',
    ) as HTMLInputElement
    radio.click()
    await flushPromises()

    const confirm = document.querySelector(
      '[data-testid="merge-into-confirm"]',
    ) as HTMLButtonElement
    confirm.click()
    await flushPromises()

    expect(mergeEntities).toHaveBeenCalledWith({
      survivor_id: 7,
      absorbed_ids: [99],
    })
    expect(pushSpy).toHaveBeenCalledWith({
      name: 'entity-detail',
      params: { id: 7 },
    })
  })

  it('confirm button is disabled until a candidate is selected', async () => {
    mountDialog()
    await flushPromises()
    const confirm = document.querySelector(
      '[data-testid="merge-into-confirm"]',
    ) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
  })

  it('shows an empty-state when no candidates match', async () => {
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValue({
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
    })

    mountDialog()
    const input4 = document.querySelector(
      '[data-testid="merge-into-search"]',
    ) as HTMLInputElement
    input4.value = 'Nope'
    input4.dispatchEvent(new Event('input'))
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()

    expect(
      document.querySelector('[data-testid="merge-into-empty"]'),
    ).toBeTruthy()
  })

  it('surfaces server errors during merge', async () => {
    const { fetchEntities, mergeEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValue({
      items: [
        {
          id: 7,
          entity_type: 'person',
          canonical_name: 'Sarah',
          aliases: [],
          mention_count: 0,
          first_seen: '2026-01-01',
          last_seen: '',
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    })
    vi.mocked(mergeEntities).mockRejectedValue(new Error('boom'))

    mountDialog()
    const input5 = document.querySelector(
      '[data-testid="merge-into-search"]',
    ) as HTMLInputElement
    input5.value = 'Sarah'
    input5.dispatchEvent(new Event('input'))
    await new Promise((r) => setTimeout(r, 250))
    await flushPromises()
    ;(
      document.querySelector(
        '[data-testid="merge-into-radio-7"]',
      ) as HTMLInputElement
    ).click()
    await flushPromises()
    ;(
      document.querySelector(
        '[data-testid="merge-into-confirm"]',
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    const err = document.querySelector('[data-testid="merge-into-error"]')
    expect(err?.textContent).toContain('boom')
  })
})
