import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import AliasCollisionDialog from '@/components/entities/AliasCollisionDialog.vue'

vi.mock('@/api/entities', () => ({
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

const collision = {
  error: 'alias already maps to a different entity',
  alias: 'Mum',
  existing_entity_id: 7,
  existing_canonical_name: 'Sarah',
  existing_entity_type: 'person' as const,
}

function mountDialog(open = true) {
  return mount(AliasCollisionDialog, {
    props: {
      modelValue: open,
      collision,
      currentEntityId: 99,
      currentEntityName: 'Mum (duplicate)',
      currentEntityType: 'person' as const,
    },
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('AliasCollisionDialog', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('does not render when closed', () => {
    mountDialog(false)
    expect(
      document.querySelector('[data-testid="alias-collision-dialog"]'),
    ).toBeNull()
  })

  it('renders the existing entity name and the current entity name', async () => {
    mountDialog()
    await flushPromises()
    const body = document.querySelector(
      '[data-testid="alias-collision-dialog"]',
    )
    expect(body?.textContent).toContain('Sarah')
    expect(body?.textContent).toContain('Mum')
  })

  it('confirm calls mergeEntities (existing wins) and routes to survivor', async () => {
    const { mergeEntities } = await import('@/api/entities')
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
      mentions_reassigned: 0,
      relationships_reassigned: 0,
      aliases_added: 1,
    })
    const pushSpy = vi.spyOn(router, 'push')

    mountDialog()
    await flushPromises()
    ;(
      document.querySelector(
        '[data-testid="alias-collision-confirm"]',
      ) as HTMLButtonElement
    ).click()
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

  it('cancel closes the dialog without calling merge', async () => {
    const { mergeEntities } = await import('@/api/entities')
    const wrapper = mountDialog()
    await flushPromises()
    ;(
      document.querySelector(
        '[data-testid="alias-collision-cancel"]',
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    expect(mergeEntities).not.toHaveBeenCalled()
    // emit + parent should set modelValue=false; the wrapper's prop
    // is unchanged but the emitted event is what the parent listens to.
    const events = wrapper.emitted('update:modelValue')
    expect(events?.[events.length - 1]?.[0]).toBe(false)
  })

  it('renders an error message when merge fails', async () => {
    const { mergeEntities } = await import('@/api/entities')
    vi.mocked(mergeEntities).mockRejectedValue(new Error('boom'))

    mountDialog()
    await flushPromises()
    ;(
      document.querySelector(
        '[data-testid="alias-collision-confirm"]',
      ) as HTMLButtonElement
    ).click()
    await flushPromises()

    const err = document.querySelector('[data-testid="alias-collision-error"]')
    expect(err?.textContent).toContain('boom')
  })

  it('confirm does nothing when collision prop is null', async () => {
    const { mergeEntities } = await import('@/api/entities')
    const wrapper = mount(AliasCollisionDialog, {
      props: {
        modelValue: true,
        collision: null,
        currentEntityId: 99,
        currentEntityName: 'X',
        currentEntityType: 'person' as const,
      },
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    ;(
      document.querySelector(
        '[data-testid="alias-collision-confirm"]',
      ) as HTMLButtonElement
    ).click()
    await flushPromises()
    expect(mergeEntities).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
