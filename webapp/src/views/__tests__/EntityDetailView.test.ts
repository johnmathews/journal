import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import EntityDetailView from '../EntityDetailView.vue'

vi.mock('@/api/entities', () => ({
  fetchEntity: vi.fn().mockResolvedValue({
    id: 42,
    entity_type: 'person',
    canonical_name: 'Ritsya',
    description: 'my daughter',
    aliases: ['Ritzya'],
    first_seen: '2026-01-02',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  }),
  fetchEntityMentions: vi.fn().mockResolvedValue({
    entity_id: 42,
    mentions: [
      {
        id: 1,
        entity_id: 42,
        entry_id: 5,
        entry_date: '2026-03-22',
        quote: 'walked with Ritsya in the park',
        confidence: 0.92,
        extraction_run_id: 'abc',
        created_at: '2026-03-22T10:00:00Z',
      },
    ],
    total: 1,
  }),
  fetchEntityRelationships: vi.fn().mockResolvedValue({
    entity_id: 42,
    outgoing: [
      {
        id: 10,
        subject_entity_id: 42,
        subject_name: 'Ritsya',
        subject_type: 'person',
        predicate: 'visited',
        object_entity_id: 7,
        object_name: 'Blue Bottle',
        object_type: 'place',
        quote: 'Ritsya visited Blue Bottle',
        entry_id: 5,
        entry_date: '2026-03-22',
        confidence: 0.88,
      },
    ],
    incoming: [],
  }),
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/entities', name: 'entities', component: { template: '<div/>' } },
    {
      path: '/entities/:id',
      name: 'entity-detail',
      component: EntityDetailView,
      props: true,
    },
    {
      path: '/entries/:id',
      name: 'entry-detail',
      component: { template: '<div/>' },
    },
  ],
})

function mountView() {
  return mount(EntityDetailView, {
    props: { id: '42' },
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('EntityDetailView', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mounts without error', () => {
    const wrapper = mountView()
    expect(wrapper.find('[data-testid="entity-detail-view"]').exists()).toBe(
      true,
    )
  })

  it('renders the entity name, type badge, and aliases after loading', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Ritsya')
    expect(wrapper.find('[data-testid="entity-type-badge"]').text()).toContain(
      'person',
    )
    expect(wrapper.find('[data-testid="entity-aliases"]').text()).toContain(
      'Ritzya',
    )
  })

  it('renders mentions in the timeline with quotes', async () => {
    const wrapper = mountView()
    await flushPromises()

    const mentions = wrapper.findAll('[data-testid="mention-row"]')
    expect(mentions).toHaveLength(1)
    expect(mentions[0].find('[data-testid="mention-quote"]').text()).toContain(
      'walked with Ritsya in the park',
    )
  })

  it('renders outgoing relationships with the predicate and object', async () => {
    const wrapper = mountView()
    await flushPromises()

    const outgoing = wrapper.findAll('[data-testid="relationship-outgoing"]')
    expect(outgoing).toHaveLength(1)
    expect(outgoing[0].text()).toContain('visited')
    expect(outgoing[0].text()).toContain('Blue Bottle')
  })

  it('Back button navigates to the entity list', async () => {
    const wrapper = mountView()
    await flushPromises()

    const pushSpy = vi.spyOn(router, 'push')
    await wrapper.find('[data-testid="back-button"]').trigger('click')

    expect(pushSpy).toHaveBeenCalledWith({ name: 'entities' })
  })
})
