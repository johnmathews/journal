import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import EntityDetailView from '../EntityDetailView.vue'

vi.mock('@/api/entities', () => ({
  fetchEntities: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 }),
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
  triggerEntityExtraction: vi.fn(),
  updateEntity: vi.fn(),
  deleteEntity: vi.fn().mockResolvedValue({ deleted: true, id: 42 }),
  mergeEntities: vi.fn(),
  fetchMergeCandidates: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  resolveMergeCandidate: vi.fn(),
  fetchMergeHistory: vi.fn(),
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

  it('renders mentions grouped by entry with quotes', async () => {
    const wrapper = mountView()
    await flushPromises()

    const groups = wrapper.findAll('[data-testid="mention-entry-group"]')
    expect(groups).toHaveLength(1)
    expect(groups[0].find('[data-testid="mention-quote"]').text()).toContain(
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

  it('renders description and first_seen when present', async () => {
    const wrapper = mountView()
    await flushPromises()

    // The description and first_seen v-if paths both evaluate true for
    // the default fixture (description = "my daughter", first_seen set).
    expect(wrapper.text()).toContain('my daughter')
    expect(wrapper.text()).toContain('first seen')
  })

  it('renders incoming relationships and hits typeBadgeClass for each subject type', async () => {
    // Swap in a richer fixture covering every entity_type the switch
    // handles (activity, organization, topic, other) plus an incoming
    // relationship.
    const { fetchEntity, fetchEntityMentions, fetchEntityRelationships } =
      await import('@/api/entities')
    vi.mocked(fetchEntity).mockResolvedValueOnce({
      id: 99,
      entity_type: 'other',
      canonical_name: 'Mystery',
      description: '',
      aliases: [],
      first_seen: '',
      created_at: '',
      updated_at: '',
    })
    vi.mocked(fetchEntityMentions).mockResolvedValueOnce({
      entity_id: 99,
      mentions: [],
      total: 0,
    })
    vi.mocked(fetchEntityRelationships).mockResolvedValueOnce({
      entity_id: 99,
      outgoing: [
        {
          id: 1,
          subject_entity_id: 99,
          subject_name: 'Mystery',
          subject_type: 'other',
          predicate: 'part_of',
          object_entity_id: 2,
          object_name: 'Acme Corp',
          object_type: 'organization',
          quote: '',
          entry_id: 1,
          entry_date: '2026-03-01',
          confidence: 0.8,
        },
        {
          id: 2,
          subject_entity_id: 99,
          subject_name: 'Mystery',
          subject_type: 'other',
          predicate: 'at',
          object_entity_id: 3,
          object_name: 'Running',
          object_type: 'activity',
          quote: '',
          entry_id: 1,
          entry_date: '2026-03-01',
          confidence: 0.8,
        },
      ],
      incoming: [
        {
          id: 3,
          subject_entity_id: 4,
          subject_name: 'AI',
          subject_type: 'topic',
          predicate: 'mentioned',
          object_entity_id: 99,
          object_name: 'Mystery',
          object_type: 'other',
          quote: '',
          entry_id: 1,
          entry_date: '2026-03-01',
          confidence: 0.8,
        },
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    const outgoing = wrapper.findAll('[data-testid="relationship-outgoing"]')
    expect(outgoing).toHaveLength(2)
    // Outgoing badges should show organization (yellow) and activity (emerald).
    expect(outgoing[0].html()).toContain('yellow')
    expect(outgoing[1].html()).toContain('emerald')

    const incoming = wrapper.findAll('[data-testid="relationship-incoming"]')
    expect(incoming).toHaveLength(1)
    // Incoming subject is a topic — hits the `case 'topic'` branch.
    expect(incoming[0].html()).toContain('rose')
    expect(incoming[0].text()).toContain('AI')
    expect(incoming[0].text()).toContain('mentioned')

    // The main entity is `other` — hits the default branch of the
    // outer type badge.
    expect(wrapper.find('[data-testid="entity-type-badge"]').html()).toContain(
      'gray',
    )
  })

  it('shows the empty state for mentions and relationships when none exist', async () => {
    const { fetchEntity, fetchEntityMentions, fetchEntityRelationships } =
      await import('@/api/entities')
    vi.mocked(fetchEntity).mockResolvedValueOnce({
      id: 77,
      entity_type: 'place',
      canonical_name: 'Lonely Café',
      description: '',
      aliases: [],
      first_seen: '',
      created_at: '',
      updated_at: '',
    })
    vi.mocked(fetchEntityMentions).mockResolvedValueOnce({
      entity_id: 77,
      mentions: [],
      total: 0,
    })
    vi.mocked(fetchEntityRelationships).mockResolvedValueOnce({
      entity_id: 77,
      outgoing: [],
      incoming: [],
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('No relationships recorded yet')
    expect(wrapper.text()).toContain('No mentions recorded yet')
  })

  it('shows edit and delete buttons', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="delete-button"]').exists()).toBe(true)
  })

  it('opens edit form when edit button is clicked', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="edit-form"]').exists()).toBe(false)
    await wrapper.find('[data-testid="edit-button"]').trigger('click')
    expect(wrapper.find('[data-testid="edit-form"]').exists()).toBe(true)
    expect(
      (wrapper.find('[data-testid="edit-name-input"]').element as HTMLInputElement).value,
    ).toBe('Ritsya')
  })

  it('closes edit form when cancel is clicked', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-testid="edit-button"]').trigger('click')
    expect(wrapper.find('[data-testid="edit-form"]').exists()).toBe(true)
    await wrapper.find('[data-testid="cancel-edit-button"]').trigger('click')
    expect(wrapper.find('[data-testid="edit-form"]').exists()).toBe(false)
  })

  it('saves edit and updates entity name', async () => {
    const { updateEntity } = await import('@/api/entities')
    vi.mocked(updateEntity).mockResolvedValueOnce({
      id: 42,
      entity_type: 'person',
      canonical_name: 'Ritsya Mathews',
      description: 'my daughter',
      aliases: ['Ritzya'],
      first_seen: '2026-01-02',
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-04-12T00:00:00Z',
    })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-testid="edit-button"]').trigger('click')
    const nameInput = wrapper.find('[data-testid="edit-name-input"]')
    await nameInput.setValue('Ritsya Mathews')
    await wrapper.find('[data-testid="save-edit-button"]').trigger('click')
    await flushPromises()

    expect(updateEntity).toHaveBeenCalledWith(42, {
      canonical_name: 'Ritsya Mathews',
    })
    expect(wrapper.find('[data-testid="edit-form"]').exists()).toBe(false)
  })

  it('confirms and deletes entity, navigating back to list', async () => {
    const { deleteEntity } = await import('@/api/entities')
    window.confirm = vi.fn(() => true)
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-testid="delete-button"]').trigger('click')
    await flushPromises()

    expect(window.confirm).toHaveBeenCalled()
    expect(deleteEntity).toHaveBeenCalledWith(42)
    expect(pushSpy).toHaveBeenCalledWith({ name: 'entities' })
  })

  it('does not delete when confirm is cancelled', async () => {
    const { deleteEntity } = await import('@/api/entities')
    vi.mocked(deleteEntity).mockClear()
    window.confirm = vi.fn(() => false)

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-testid="delete-button"]').trigger('click')
    expect(deleteEntity).not.toHaveBeenCalled()
  })

  it('re-fetches when the :id route param changes (without remounting)', async () => {
    const wrapper = mountView()
    await flushPromises()

    const { fetchEntity } = await import('@/api/entities')
    const spy = vi.mocked(fetchEntity)
    spy.mockClear()
    spy.mockResolvedValueOnce({
      id: 43,
      entity_type: 'person',
      canonical_name: 'Other',
      description: '',
      aliases: [],
      first_seen: '2026-01-01',
      created_at: '',
      updated_at: '',
    })

    await wrapper.setProps({ id: '43' })
    await flushPromises()

    // loadEntity is fired via the props.id watcher (line 22-23),
    // which pulls fetchEntity through.
    expect(spy).toHaveBeenCalled()
  })
})
