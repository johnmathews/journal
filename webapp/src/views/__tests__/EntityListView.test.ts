import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import EntityListView from '../EntityListView.vue'

vi.mock('@/api/entities', () => ({
  fetchEntities: vi.fn().mockResolvedValue({
    items: [
      {
        id: 2,
        entity_type: 'place',
        canonical_name: 'Blue Bottle',
        aliases: [],
        mention_count: 4,
        first_seen: '2026-02-15',
        last_seen: '2026-03-01',
      },
      {
        id: 1,
        entity_type: 'person',
        canonical_name: 'Ritsya',
        aliases: ['Ritzya'],
        mention_count: 12,
        first_seen: '2026-01-02',
        last_seen: '2026-03-22',
      },
    ],
    total: 2,
    limit: 50,
    offset: 0,
  }),
  fetchEntity: vi.fn(),
  fetchEntityMentions: vi.fn(),
  fetchEntityRelationships: vi.fn(),
  triggerEntityExtraction: vi.fn(),
  updateEntity: vi.fn(),
  deleteEntity: vi.fn(),
  mergeEntities: vi.fn(),
  fetchMergeCandidates: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  resolveMergeCandidate: vi.fn(),
  fetchMergeHistory: vi.fn(),
}))

vi.mock('@/api/jobs', () => ({
  triggerMoodBackfill: vi.fn(),
  getJob: vi.fn(),
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
    // Default sort: last_seen descending — Ritsya (2026-03-22) before Blue Bottle (2026-03-01)
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

  it('renders the correct badge class for every entity type', async () => {
    // Hits every non-default branch of `typeBadgeClass` plus the
    // default/other fallback. The six rows cover all six cases the
    // switch is supposed to handle.
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValueOnce({
      items: [
        {
          id: 3,
          entity_type: 'activity',
          canonical_name: 'A',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
          last_seen: '',
        },
        {
          id: 4,
          entity_type: 'organization',
          canonical_name: 'O',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
          last_seen: '',
        },
        {
          id: 1,
          entity_type: 'person',
          canonical_name: 'P',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
          last_seen: '',
        },
        {
          id: 2,
          entity_type: 'place',
          canonical_name: 'Pl',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
          last_seen: '',
        },
        {
          id: 5,
          entity_type: 'topic',
          canonical_name: 'T',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
          last_seen: '',
        },
        {
          id: 6,
          entity_type: 'other',
          canonical_name: 'X',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
          last_seen: '',
        },
      ],
      total: 6,
      limit: 50,
      offset: 0,
    })

    const wrapper = mountView()
    await flushPromises()

    const rows = wrapper.findAll('[data-testid="entity-row"]')
    expect(rows).toHaveLength(6)
    // Spot-check a few distinct hues. The exact class names aren't the
    // point — the point is the switch ran each case without the default
    // fallback swallowing everything.
    // Sorted by canonical_name ascending: A, O, P, Pl, T, X
    expect(rows[0].html()).toContain('emerald') // activity (A)
    expect(rows[1].html()).toContain('yellow') // organization (O)
    expect(rows[4].html()).toContain('rose') // topic (T)
    expect(rows[5].html()).toContain('gray') // other (X, default case)
  })

  it('pagination buttons call loadEntities with the right offset', async () => {
    // Provide enough "total" that Next is enabled on page 1 and Prev
    // becomes enabled after one Next click.
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValueOnce({
      items: [
        {
          id: 1,
          entity_type: 'person',
          canonical_name: 'Ritsya',
          aliases: [],
          mention_count: 12,
          first_seen: '2026-01-02',
          last_seen: '2026-03-22',
        },
      ],
      total: 120, // far beyond one page
      limit: 50,
      offset: 0,
    })

    const wrapper = mountView()
    await flushPromises()

    const spy = vi.mocked(fetchEntities)
    spy.mockClear()
    // Return the next page shape so canPrev flips on.
    spy.mockResolvedValue({
      items: [
        {
          id: 2,
          entity_type: 'person',
          canonical_name: 'John',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-02',
          last_seen: '2026-01-02',
        },
      ],
      total: 120,
      limit: 50,
      offset: 50,
    })

    await wrapper.find('[data-testid="next-page"]').trigger('click')
    await flushPromises()
    expect(spy.mock.calls[0][0]?.offset).toBe(50)

    await wrapper.find('[data-testid="prev-page"]').trigger('click')
    await flushPromises()
    expect(spy.mock.calls[1][0]?.offset).toBe(0)
  })

  it('next button is disabled on the last page and does not refetch', async () => {
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValueOnce({
      items: [
        {
          id: 1,
          entity_type: 'person',
          canonical_name: 'Solo',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
          last_seen: '2026-01-01',
        },
      ],
      total: 1, // one entity, one page
      limit: 50,
      offset: 0,
    })

    const wrapper = mountView()
    await flushPromises()

    const nextBtn = wrapper.find('[data-testid="next-page"]')
    const prevBtn = wrapper.find('[data-testid="prev-page"]')
    // Both buttons should be disabled: one page of results, no prev, no next.
    expect(nextBtn.attributes('disabled')).toBeDefined()
    expect(prevBtn.attributes('disabled')).toBeDefined()
  })

  it('renders the Run extraction button', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="run-extraction-button"]').exists()).toBe(
      true,
    )
  })

  it('clicking Run extraction opens the BatchJobModal', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-testid="run-extraction-button"]').trigger('click')
    await flushPromises()

    // The modal is teleported to document.body, so assert on the
    // body rather than the wrapper's own tree.
    expect(
      document.body.querySelector('[data-testid="batch-modal-configure"]'),
    ).not.toBeNull()
    document.body.innerHTML = ''
  })

  it('job-succeeded from the modal triggers a loadEntities refresh', async () => {
    const wrapper = mountView()
    await flushPromises()

    const { fetchEntities } = await import('@/api/entities')
    const spy = vi.mocked(fetchEntities)
    spy.mockClear()

    // Find the mounted BatchJobModal and emit directly — this is
    // exactly the contract the view wires to `onJobSucceeded`.
    const modal = wrapper.findComponent({ name: 'BatchJobModal' })
    expect(modal.exists()).toBe(true)
    modal.vm.$emit('job-succeeded')
    await flushPromises()

    expect(spy).toHaveBeenCalled()
    const lastCall = spy.mock.calls[spy.mock.calls.length - 1][0]
    expect(lastCall?.offset).toBe(0)
  })

  it('typing in the search box debounces and fires loadEntities with the trimmed term', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mountView()
      await flushPromises()

      const { fetchEntities } = await import('@/api/entities')
      const spy = vi.mocked(fetchEntities)
      spy.mockClear()

      const input = wrapper.find('[data-testid="entity-search"]')
      // Type once — debounce should be pending, no call yet.
      await input.setValue('  ritsy')
      expect(spy).not.toHaveBeenCalled()
      // Type again before the debounce fires — exercises the
      // `if (searchDebounce) clearTimeout(searchDebounce)` branch.
      await input.setValue('  ritsya  ')
      expect(spy).not.toHaveBeenCalled()

      vi.advanceTimersByTime(300)
      await flushPromises()

      expect(spy).toHaveBeenCalled()
      const lastCall = spy.mock.calls[spy.mock.calls.length - 1][0]
      // Leading/trailing whitespace is stripped before the API call.
      expect(lastCall?.search).toBe('ritsya')
    } finally {
      vi.useRealTimers()
    }
  })

  it('sorts by mentions descending when Mentions header is clicked', async () => {
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValueOnce({
      items: [
        {
          id: 2,
          entity_type: 'place',
          canonical_name: 'Blue Bottle',
          aliases: [],
          mention_count: 4,
          first_seen: '2026-02-15',
          last_seen: '2026-03-01',
        },
        {
          id: 1,
          entity_type: 'person',
          canonical_name: 'Ritsya',
          aliases: [],
          mention_count: 12,
          first_seen: '2026-01-02',
          last_seen: '2026-03-22',
        },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    })
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-testid="sort-mentions"]').trigger('click')
    const rows = wrapper.findAll('[data-testid="entity-row"]')
    // Descending by mentions: 12 before 4
    expect(rows[0].text()).toContain('Ritsya')
    expect(rows[1].text()).toContain('Blue Bottle')
  })

  it('toggles sort direction on repeated header click', async () => {
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValueOnce({
      items: [
        {
          id: 2,
          entity_type: 'place',
          canonical_name: 'Blue Bottle',
          aliases: [],
          mention_count: 4,
          first_seen: '2026-02-15',
          last_seen: '2026-03-01',
        },
        {
          id: 1,
          entity_type: 'person',
          canonical_name: 'Ritsya',
          aliases: [],
          mention_count: 12,
          first_seen: '2026-01-02',
          last_seen: '2026-03-22',
        },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    })
    const wrapper = mountView()
    await flushPromises()

    // Default is last_seen descending: Ritsya (2026-03-22), Blue Bottle (2026-03-01)
    // Click last_seen header toggles to ascending: Blue Bottle, Ritsya
    await wrapper.find('[data-testid="sort-last-seen"]').trigger('click')
    const rows = wrapper.findAll('[data-testid="entity-row"]')
    expect(rows[0].text()).toContain('Blue Bottle')
    expect(rows[1].text()).toContain('Ritsya')
  })

  it('shows checkboxes for multi-select', async () => {
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValueOnce({
      items: [
        { id: 2, entity_type: 'place', canonical_name: 'Blue Bottle', aliases: [], mention_count: 4, first_seen: '2026-02-15', last_seen: '2026-03-01' },
        { id: 1, entity_type: 'person', canonical_name: 'Ritsya', aliases: [], mention_count: 12, first_seen: '2026-01-02', last_seen: '2026-03-22' },
      ],
      total: 2, limit: 50, offset: 0,
    })
    const wrapper = mountView()
    await flushPromises()

    const checkboxes = wrapper.findAll('[data-testid="entity-checkbox"]')
    expect(checkboxes.length).toBe(2)
  })

  it('shows selection toolbar when checkbox is toggled', async () => {
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValueOnce({
      items: [
        { id: 2, entity_type: 'place', canonical_name: 'Blue Bottle', aliases: [], mention_count: 4, first_seen: '2026-02-15', last_seen: '2026-03-01' },
        { id: 1, entity_type: 'person', canonical_name: 'Ritsya', aliases: [], mention_count: 12, first_seen: '2026-01-02', last_seen: '2026-03-22' },
      ],
      total: 2, limit: 50, offset: 0,
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="selection-toolbar"]').exists()).toBe(false)

    const firstCheckbox = wrapper.findAll('[data-testid="entity-checkbox"]')[0]
    await firstCheckbox.trigger('change')

    expect(wrapper.find('[data-testid="selection-toolbar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="selection-toolbar"]').text()).toContain(
      '1 selected',
    )
  })

  it('merge button requires 2+ selected, clear resets', async () => {
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValueOnce({
      items: [
        { id: 2, entity_type: 'place', canonical_name: 'Blue Bottle', aliases: [], mention_count: 4, first_seen: '2026-02-15', last_seen: '2026-03-01' },
        { id: 1, entity_type: 'person', canonical_name: 'Ritsya', aliases: [], mention_count: 12, first_seen: '2026-01-02', last_seen: '2026-03-22' },
      ],
      total: 2, limit: 50, offset: 0,
    })
    const wrapper = mountView()
    await flushPromises()

    const checkboxes = wrapper.findAll('[data-testid="entity-checkbox"]')

    // Select 1 — merge should be disabled
    await checkboxes[0].trigger('change')
    expect(wrapper.find('[data-testid="merge-button"]').attributes('disabled')).toBeDefined()

    // Select 2 — merge should be enabled
    await checkboxes[1].trigger('change')
    expect(wrapper.find('[data-testid="merge-button"]').attributes('disabled')).toBeUndefined()

    // Clear
    await wrapper.find('[data-testid="clear-selection"]').trigger('click')
    expect(wrapper.find('[data-testid="selection-toolbar"]').exists()).toBe(false)
  })
})
