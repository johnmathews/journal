import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import EntityDetailView from '../EntityDetailView.vue'

vi.mock('@/api/entities', () => ({
  fetchEntities: vi
    .fn()
    .mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 }),
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
  addEntityAlias: vi.fn(),
  removeEntityAlias: vi.fn(),
  lookupAliasOwner: vi.fn(),
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
  fetchQuarantinedEntities: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  quarantineEntity: vi.fn(),
  releaseQuarantine: vi.fn().mockResolvedValue({}),
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
      (
        wrapper.find('[data-testid="edit-name-input"]')
          .element as HTMLInputElement
      ).value,
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

  describe('alias editing', () => {
    function entityWithAliases(aliases: string[]) {
      return {
        id: 42,
        entity_type: 'person' as const,
        canonical_name: 'Ritsya',
        description: 'my daughter',
        aliases,
        first_seen: '2026-01-02',
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
      }
    }

    it('renders an alias chip with a remove button per alias', async () => {
      const wrapper = mountView()
      await flushPromises()

      const chips = wrapper.findAll('[data-testid="entity-alias-chip"]')
      expect(chips).toHaveLength(1)
      expect(chips[0].text()).toContain('Ritzya')
      expect(
        chips[0].find('[data-testid="entity-alias-remove"]').exists(),
      ).toBe(true)
    })

    it('renders an empty-state message when the entity has no aliases', async () => {
      const { fetchEntity } = await import('@/api/entities')
      vi.mocked(fetchEntity).mockResolvedValueOnce(entityWithAliases([]))

      const wrapper = mountView()
      await flushPromises()

      expect(
        wrapper.find('[data-testid="entity-aliases-empty"]').exists(),
      ).toBe(true)
    })

    it('submits the add-alias form, calls the API, and updates the chip list', async () => {
      const { addEntityAlias } = await import('@/api/entities')
      vi.mocked(addEntityAlias).mockResolvedValueOnce(
        entityWithAliases(['Ritzya', 'Rits']),
      )

      const wrapper = mountView()
      await flushPromises()

      await wrapper.find('[data-testid="entity-alias-input"]').setValue('Rits')
      await wrapper.find('[data-testid="entity-alias-form"]').trigger('submit')
      await flushPromises()

      expect(addEntityAlias).toHaveBeenCalledWith(42, 'Rits')
      // Chip list should now show two aliases.
      expect(wrapper.findAll('[data-testid="entity-alias-chip"]')).toHaveLength(
        2,
      )
    })

    it('does not call the API when the input is whitespace', async () => {
      const { addEntityAlias } = await import('@/api/entities')
      vi.mocked(addEntityAlias).mockClear()

      const wrapper = mountView()
      await flushPromises()

      await wrapper.find('[data-testid="entity-alias-input"]').setValue('   ')
      await wrapper.find('[data-testid="entity-alias-form"]').trigger('submit')
      await flushPromises()

      expect(addEntityAlias).not.toHaveBeenCalled()
    })

    it('clicking remove on a chip calls the API and refreshes the list', async () => {
      const { removeEntityAlias } = await import('@/api/entities')
      vi.mocked(removeEntityAlias).mockResolvedValueOnce(entityWithAliases([]))

      const wrapper = mountView()
      await flushPromises()

      await wrapper.find('[data-testid="entity-alias-remove"]').trigger('click')
      await flushPromises()

      expect(removeEntityAlias).toHaveBeenCalledWith(42, 'Ritzya')
      expect(
        wrapper.find('[data-testid="entity-aliases-empty"]').exists(),
      ).toBe(true)
    })

    it('renders an inline error when the add fails with a non-409', async () => {
      const { ApiRequestError } = await import('@/api/client')
      const { addEntityAlias } = await import('@/api/entities')
      vi.mocked(addEntityAlias).mockRejectedValueOnce(
        new ApiRequestError(500, 'server_error', 'Boom'),
      )

      const wrapper = mountView()
      await flushPromises()

      await wrapper.find('[data-testid="entity-alias-input"]').setValue('Rits')
      await wrapper.find('[data-testid="entity-alias-form"]').trigger('submit')
      await flushPromises()

      const err = wrapper.find('[data-testid="entity-alias-error"]')
      expect(err.exists()).toBe(true)
      expect(err.text()).toContain('Boom')
    })

    it('clicking "Merge into…" opens the merge-into dialog', async () => {
      const wrapper = mountView()
      await flushPromises()

      await wrapper.find('[data-testid="merge-into-button"]').trigger('click')
      await flushPromises()

      expect(
        document.querySelector('[data-testid="merge-into-dialog"]'),
      ).toBeTruthy()
    })

    it('opens the collision dialog with the existing entity context on a 409', async () => {
      const { ApiRequestError } = await import('@/api/client')
      const { addEntityAlias } = await import('@/api/entities')
      const collisionBody = {
        error: 'alias already maps to a different entity',
        alias: 'Mum',
        existing_entity_id: 7,
        existing_canonical_name: 'Sarah',
        existing_entity_type: 'person',
      }
      vi.mocked(addEntityAlias).mockRejectedValueOnce(
        new ApiRequestError(
          409,
          'collision',
          'alias already maps to a different entity',
          collisionBody,
        ),
      )

      const wrapper = mountView()
      await flushPromises()

      await wrapper.find('[data-testid="entity-alias-input"]').setValue('Mum')
      await wrapper.find('[data-testid="entity-alias-form"]').trigger('submit')
      await flushPromises()

      expect(
        document.querySelector('[data-testid="alias-collision-dialog"]'),
      ).toBeTruthy()
      expect(
        document.querySelector('[data-testid="alias-collision-dialog"]')
          ?.textContent,
      ).toContain('Sarah')
    })
  })

  describe('quarantine banner', () => {
    function quarantinedEntity() {
      return {
        id: 42,
        entity_type: 'person' as const,
        canonical_name: 'Ritsya',
        description: 'my daughter',
        aliases: ['Ritzya'],
        first_seen: '2026-01-02',
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
        is_quarantined: true,
        quarantine_reason: 'merged duplicate',
        quarantined_at: '2026-04-01T08:00:00Z',
      }
    }

    it('renders the warning banner with reason and timestamp when the entity is quarantined', async () => {
      const { fetchEntity } = await import('@/api/entities')
      vi.mocked(fetchEntity).mockResolvedValueOnce(quarantinedEntity())

      const wrapper = mountView()
      await flushPromises()

      const banner = wrapper.find('[data-testid="quarantine-banner"]')
      expect(banner.exists()).toBe(true)
      expect(banner.text()).toContain('Quarantined')
      expect(banner.text()).toContain('merged duplicate')
      // Timestamp formatter renders the year as a sanity check.
      expect(
        wrapper.find('[data-testid="quarantine-banner-when"]').text(),
      ).toContain('2026')

      const releaseBtn = wrapper.find(
        '[data-testid="release-quarantine-button"]',
      )
      expect(releaseBtn.exists()).toBe(true)
      expect(releaseBtn.text()).toContain('Release')
    })

    it('does not render the banner for a non-quarantined entity', async () => {
      // Default fixture has no quarantine flags.
      const wrapper = mountView()
      await flushPromises()

      expect(wrapper.find('[data-testid="quarantine-banner"]').exists()).toBe(
        false,
      )
    })

    it('clicking Release calls the API and hides the banner without a refetch', async () => {
      const { fetchEntity, releaseQuarantine } = await import('@/api/entities')
      vi.mocked(fetchEntity).mockResolvedValueOnce(quarantinedEntity())
      vi.mocked(releaseQuarantine).mockResolvedValueOnce({
        id: 42,
        entity_type: 'person',
        canonical_name: 'Ritsya',
        description: '',
        aliases: [],
        first_seen: '2026-01-02',
        created_at: '',
        updated_at: '',
        is_quarantined: false,
        quarantine_reason: '',
        quarantined_at: '',
      })

      const wrapper = mountView()
      await flushPromises()

      expect(wrapper.find('[data-testid="quarantine-banner"]').exists()).toBe(
        true,
      )

      await wrapper
        .find('[data-testid="release-quarantine-button"]')
        .trigger('click')
      await flushPromises()

      expect(releaseQuarantine).toHaveBeenCalledWith(42)
      expect(wrapper.find('[data-testid="quarantine-banner"]').exists()).toBe(
        false,
      )
    })

    it('renders banner without timestamp when quarantined_at is empty', async () => {
      const { fetchEntity } = await import('@/api/entities')
      vi.mocked(fetchEntity).mockResolvedValueOnce({
        ...quarantinedEntity(),
        quarantined_at: '',
      })

      const wrapper = mountView()
      await flushPromises()

      expect(wrapper.find('[data-testid="quarantine-banner"]').exists()).toBe(
        true,
      )
      expect(
        wrapper.find('[data-testid="quarantine-banner-when"]').exists(),
      ).toBe(false)
    })
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
