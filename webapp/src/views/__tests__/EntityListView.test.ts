import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import EntityListView from '../EntityListView.vue'

vi.mock('@/api/entities', () => ({
  fetchEntities: vi.fn().mockResolvedValue({
    items: [
      {
        id: 1,
        entity_type: 'person',
        canonical_name: 'Ritsya',
        aliases: ['Ritzya'],
        mention_count: 12,
        first_seen: '2026-01-02',
      },
      {
        id: 2,
        entity_type: 'place',
        canonical_name: 'Blue Bottle',
        aliases: [],
        mention_count: 4,
        first_seen: '2026-02-15',
      },
    ],
    total: 2,
    limit: 50,
    offset: 0,
  }),
  fetchEntity: vi.fn(),
  fetchEntityMentions: vi.fn(),
  fetchEntityRelationships: vi.fn(),
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/entities', name: 'entities', component: EntityListView },
    {
      path: '/entities/:id',
      name: 'entity-detail',
      component: { template: '<div />' },
    },
  ],
})

function mountView() {
  return mount(EntityListView, {
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('EntityListView', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mounts without error', () => {
    const wrapper = mountView()
    expect(wrapper.find('[data-testid="entity-list-view"]').exists()).toBe(true)
  })

  it('loads entities on mount and renders rows', async () => {
    const wrapper = mountView()
    await flushPromises()

    const { fetchEntities } = await import('@/api/entities')
    expect(fetchEntities).toHaveBeenCalled()

    const rows = wrapper.findAll('[data-testid="entity-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('Ritsya')
    expect(rows[0].text()).toContain('Ritzya') // alias shown
    expect(rows[0].text()).toContain('12')
    expect(rows[1].text()).toContain('Blue Bottle')
  })

  it('filters by type when a type tab is clicked', async () => {
    const wrapper = mountView()
    await flushPromises()

    const { fetchEntities } = await import('@/api/entities')
    const spy = vi.mocked(fetchEntities)
    spy.mockClear()

    await wrapper.find('[data-testid="entity-type-person"]').trigger('click')
    await flushPromises()

    expect(spy).toHaveBeenCalled()
    const lastCall = spy.mock.calls[spy.mock.calls.length - 1][0]
    expect(lastCall?.type).toBe('person')
  })

  it('switching back to All clears the type filter', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-testid="entity-type-person"]').trigger('click')
    await flushPromises()

    const { fetchEntities } = await import('@/api/entities')
    const spy = vi.mocked(fetchEntities)
    spy.mockClear()

    await wrapper.find('[data-testid="entity-type-all"]').trigger('click')
    await flushPromises()

    const lastCall = spy.mock.calls[spy.mock.calls.length - 1][0]
    expect(lastCall?.type).toBeUndefined()
  })

  it('shows the empty state when no entities exist', async () => {
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValueOnce({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="entity-table"]').exists()).toBe(false)
  })
})
