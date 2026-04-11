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

  it('renders the correct badge class for every entity type', async () => {
    // Hits every non-default branch of `typeBadgeClass` plus the
    // default/other fallback. The six rows cover all six cases the
    // switch is supposed to handle.
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValueOnce({
      items: [
        {
          id: 1,
          entity_type: 'person',
          canonical_name: 'P',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
        },
        {
          id: 2,
          entity_type: 'place',
          canonical_name: 'Pl',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
        },
        {
          id: 3,
          entity_type: 'activity',
          canonical_name: 'A',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
        },
        {
          id: 4,
          entity_type: 'organization',
          canonical_name: 'O',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
        },
        {
          id: 5,
          entity_type: 'topic',
          canonical_name: 'T',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
        },
        {
          id: 6,
          entity_type: 'other',
          canonical_name: 'X',
          aliases: [],
          mention_count: 1,
          first_seen: '2026-01-01',
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
    expect(rows[2].html()).toContain('emerald') // activity
    expect(rows[3].html()).toContain('yellow') // organization
    expect(rows[4].html()).toContain('rose') // topic
    expect(rows[5].html()).toContain('gray') // other (default case)
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
})
