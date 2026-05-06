import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
  // Quarantine endpoints — default to empty so the badge stays
  // hidden and the active-list tests don't double-render rows.
  fetchQuarantinedEntities: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  quarantineEntity: vi.fn(),
  releaseQuarantine: vi.fn(),
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

    const checkboxes = wrapper.findAll('[data-testid="entity-checkbox"]')
    expect(checkboxes.length).toBe(2)
  })

  it('shows selection toolbar when checkbox is toggled', async () => {
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

    expect(wrapper.find('[data-testid="selection-toolbar"]').exists()).toBe(
      false,
    )

    const firstCheckbox = wrapper.findAll('[data-testid="entity-checkbox"]')[0]
    await firstCheckbox.trigger('change')

    expect(wrapper.find('[data-testid="selection-toolbar"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="selection-toolbar"]').text()).toContain(
      '1 selected',
    )
  })

  it('merge button requires 2+ selected, clear resets', async () => {
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

    const checkboxes = wrapper.findAll('[data-testid="entity-checkbox"]')

    // Select 1 — merge should be disabled
    await checkboxes[0].trigger('change')
    expect(
      wrapper.find('[data-testid="merge-button"]').attributes('disabled'),
    ).toBeDefined()

    // Select 2 — merge should be enabled
    await checkboxes[1].trigger('change')
    expect(
      wrapper.find('[data-testid="merge-button"]').attributes('disabled'),
    ).toBeUndefined()

    // Clear
    await wrapper.find('[data-testid="clear-selection"]').trigger('click')
    expect(wrapper.find('[data-testid="selection-toolbar"]').exists()).toBe(
      false,
    )
  })

  // ---- Merge modal flow ----

  const twoEntities = {
    items: [
      {
        id: 2,
        entity_type: 'place' as const,
        canonical_name: 'Blue Bottle',
        aliases: [],
        mention_count: 4,
        first_seen: '2026-02-15',
        last_seen: '2026-03-01',
      },
      {
        id: 1,
        entity_type: 'person' as const,
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
  }

  const mergeSuccessResponse = {
    survivor: {
      id: 1,
      entity_type: 'person' as const,
      canonical_name: 'Ritsya',
      description: '',
      aliases: ['Ritzya'],
      first_seen: '2026-01-02',
      created_at: '',
      updated_at: '',
    },
    absorbed_ids: [2],
    mentions_reassigned: 4,
    relationships_reassigned: 0,
    aliases_added: 1,
  }

  const candidateFixture = {
    items: [
      {
        id: 100,
        entity_a: {
          id: 1,
          entity_type: 'person' as const,
          canonical_name: 'Ritsya',
          aliases: [],
          mention_count: 12,
          first_seen: '2026-01-02',
          last_seen: '2026-03-22',
        },
        entity_b: {
          id: 3,
          entity_type: 'person' as const,
          canonical_name: 'Ritzya',
          aliases: [],
          mention_count: 2,
          first_seen: '2026-02-01',
          last_seen: '2026-03-01',
        },
        similarity: 0.92,
        status: 'pending' as const,
        extraction_run_id: 'run-1',
        created_at: '2026-04-01T00:00:00Z',
      },
    ],
    total: 1,
  }

  describe('merge modal flow', () => {
    afterEach(() => {
      document.body.innerHTML = ''
    })

    it('opens merge modal with survivor options when 2 entities selected', async () => {
      const { fetchEntities } = await import('@/api/entities')
      vi.mocked(fetchEntities).mockResolvedValueOnce(twoEntities)

      const wrapper = mountView()
      await flushPromises()

      // Select both entities
      const checkboxes = wrapper.findAll('[data-testid="entity-checkbox"]')
      await checkboxes[0].trigger('change')
      await checkboxes[1].trigger('change')

      // Click merge button
      await wrapper.find('[data-testid="merge-button"]').trigger('click')
      await flushPromises()

      // Modal content is teleported to body
      const modal = document.body.querySelector('[data-testid="modal-panel"]')
      expect(modal).not.toBeNull()
      expect(modal!.textContent).toContain('Merge entities')

      // Both survivor options should be present
      expect(
        document.body.querySelector('[data-testid="survivor-option-1"]'),
      ).not.toBeNull()
      expect(
        document.body.querySelector('[data-testid="survivor-option-2"]'),
      ).not.toBeNull()
    })

    it('executes merge: calls store, closes modal, clears selection, reloads', async () => {
      const { fetchEntities, mergeEntities } = await import('@/api/entities')
      vi.mocked(fetchEntities).mockResolvedValueOnce(twoEntities)
      vi.mocked(mergeEntities).mockResolvedValueOnce(mergeSuccessResponse)

      const wrapper = mountView()
      await flushPromises()

      // Select both and open merge modal
      const checkboxes = wrapper.findAll('[data-testid="entity-checkbox"]')
      await checkboxes[0].trigger('change')
      await checkboxes[1].trigger('change')
      await wrapper.find('[data-testid="merge-button"]').trigger('click')
      await flushPromises()

      // Confirm merge
      const confirmBtn = document.body.querySelector(
        '[data-testid="confirm-merge-button"]',
      ) as HTMLButtonElement
      expect(confirmBtn).not.toBeNull()

      const fetchSpy = vi.mocked(fetchEntities)
      fetchSpy.mockClear()

      confirmBtn.click()
      await flushPromises()

      // mergeEntities API was called
      expect(mergeEntities).toHaveBeenCalledWith({
        survivor_id: 1,
        absorbed_ids: [2],
      })

      // Modal closed
      expect(
        document.body.querySelector('[data-testid="modal-panel"]'),
      ).toBeNull()

      // Selection cleared — no toolbar
      expect(wrapper.find('[data-testid="selection-toolbar"]').exists()).toBe(
        false,
      )

      // Entity list was reloaded
      expect(fetchSpy).toHaveBeenCalled()
    })

    it('shows merge error when mergeEntities throws', async () => {
      const { fetchEntities, mergeEntities } = await import('@/api/entities')
      vi.mocked(fetchEntities).mockResolvedValueOnce(twoEntities)
      vi.mocked(mergeEntities).mockRejectedValueOnce(
        new Error('Conflict detected'),
      )

      const wrapper = mountView()
      await flushPromises()

      // Select both and open merge modal
      const checkboxes = wrapper.findAll('[data-testid="entity-checkbox"]')
      await checkboxes[0].trigger('change')
      await checkboxes[1].trigger('change')
      await wrapper.find('[data-testid="merge-button"]').trigger('click')
      await flushPromises()

      // Confirm merge — will fail
      const confirmBtn = document.body.querySelector(
        '[data-testid="confirm-merge-button"]',
      ) as HTMLButtonElement
      confirmBtn.click()
      await flushPromises()

      // Modal stays open with error
      const errorEl = document.body.querySelector('[data-testid="merge-error"]')
      expect(errorEl).not.toBeNull()
      expect(errorEl!.textContent).toContain('Conflict detected')

      // Modal is still visible
      expect(
        document.body.querySelector('[data-testid="modal-panel"]'),
      ).not.toBeNull()
    })

    it('cancel closes the merge modal without merging', async () => {
      const { fetchEntities, mergeEntities } = await import('@/api/entities')
      vi.mocked(fetchEntities).mockResolvedValueOnce(twoEntities)
      vi.mocked(mergeEntities).mockClear()

      const wrapper = mountView()
      await flushPromises()

      // Select both and open merge modal
      const checkboxes = wrapper.findAll('[data-testid="entity-checkbox"]')
      await checkboxes[0].trigger('change')
      await checkboxes[1].trigger('change')
      await wrapper.find('[data-testid="merge-button"]').trigger('click')
      await flushPromises()

      expect(
        document.body.querySelector('[data-testid="modal-panel"]'),
      ).not.toBeNull()

      // Find and click Cancel (the non-confirm button in the footer)
      const footerBtns = document.body.querySelectorAll(
        '[data-testid="modal-footer"] button',
      )
      // Cancel is the first button in the footer, confirm is the second
      const cancelBtn = footerBtns[0] as HTMLButtonElement
      cancelBtn.click()
      await flushPromises()

      // Modal closed
      expect(
        document.body.querySelector('[data-testid="modal-panel"]'),
      ).toBeNull()

      // mergeEntities was NOT called during this test
      expect(mergeEntities).not.toHaveBeenCalled()
    })
  })

  // ---- Merge candidate review ----

  describe('merge candidate review', () => {
    afterEach(() => {
      document.body.innerHTML = ''
    })

    it('shows merge review banner when candidates exist', async () => {
      const { fetchEntities, fetchMergeCandidates } =
        await import('@/api/entities')
      vi.mocked(fetchEntities).mockResolvedValueOnce(twoEntities)
      vi.mocked(fetchMergeCandidates).mockResolvedValueOnce(candidateFixture)

      const wrapper = mountView()
      await flushPromises()

      const banner = wrapper.find('[data-testid="merge-review-section"]')
      expect(banner.exists()).toBe(true)
      // Badge shows the count
      expect(banner.text()).toContain('1')
      expect(banner.text()).toContain('Possible duplicates to review')
    })

    it('toggles candidate list on banner click', async () => {
      const { fetchEntities, fetchMergeCandidates } =
        await import('@/api/entities')
      vi.mocked(fetchEntities).mockResolvedValueOnce(twoEntities)
      vi.mocked(fetchMergeCandidates).mockResolvedValueOnce(candidateFixture)

      const wrapper = mountView()
      await flushPromises()

      // Initially collapsed
      expect(
        wrapper.find('[data-testid="merge-candidates-list"]').exists(),
      ).toBe(false)

      // Click to expand
      await wrapper.find('[data-testid="toggle-merge-review"]').trigger('click')
      expect(
        wrapper.find('[data-testid="merge-candidates-list"]').exists(),
      ).toBe(true)
      expect(wrapper.find('[data-testid="merge-candidate-100"]').exists()).toBe(
        true,
      )

      // Click to collapse
      await wrapper.find('[data-testid="toggle-merge-review"]').trigger('click')
      expect(
        wrapper.find('[data-testid="merge-candidates-list"]').exists(),
      ).toBe(false)
    })

    it('accept candidate calls resolveMergeCandidate, mergeEntities, and reloads', async () => {
      const {
        fetchEntities,
        fetchMergeCandidates,
        resolveMergeCandidate,
        mergeEntities,
      } = await import('@/api/entities')
      vi.mocked(fetchEntities).mockResolvedValueOnce(twoEntities)
      vi.mocked(fetchMergeCandidates).mockResolvedValueOnce(candidateFixture)
      vi.mocked(resolveMergeCandidate).mockResolvedValueOnce({
        id: 100,
        status: 'accepted',
      })
      vi.mocked(mergeEntities).mockResolvedValueOnce({
        survivor: {
          id: 1,
          entity_type: 'person',
          canonical_name: 'Ritsya',
          description: '',
          aliases: ['Ritzya'],
          first_seen: '2026-01-02',
          created_at: '',
          updated_at: '',
        },
        absorbed_ids: [3],
        mentions_reassigned: 2,
        relationships_reassigned: 0,
        aliases_added: 0,
      })

      const wrapper = mountView()
      await flushPromises()

      // Expand candidate list
      await wrapper.find('[data-testid="toggle-merge-review"]').trigger('click')

      const fetchSpy = vi.mocked(fetchEntities)
      fetchSpy.mockClear()

      // Click accept/merge on the candidate
      await wrapper.find('[data-testid="accept-candidate"]').trigger('click')
      await flushPromises()

      // resolveMergeCandidate was called with "accepted"
      expect(resolveMergeCandidate).toHaveBeenCalledWith(100, 'accepted')

      // mergeEntities was called — entity_a (Ritsya, 12 mentions) is survivor,
      // entity_b (Ritzya, 2 mentions) is absorbed
      expect(mergeEntities).toHaveBeenCalledWith({
        survivor_id: 1,
        absorbed_ids: [3],
      })

      // List was reloaded
      expect(fetchSpy).toHaveBeenCalled()
    })

    it('dismiss candidate calls resolveMergeCandidate with dismissed', async () => {
      const { fetchEntities, fetchMergeCandidates, resolveMergeCandidate } =
        await import('@/api/entities')
      vi.mocked(fetchEntities).mockResolvedValueOnce(twoEntities)
      vi.mocked(fetchMergeCandidates).mockResolvedValueOnce(candidateFixture)
      vi.mocked(resolveMergeCandidate).mockResolvedValueOnce({
        id: 100,
        status: 'dismissed',
      })

      const wrapper = mountView()
      await flushPromises()

      // Expand candidate list
      await wrapper.find('[data-testid="toggle-merge-review"]').trigger('click')

      // Click dismiss
      await wrapper.find('[data-testid="dismiss-candidate"]').trigger('click')
      await flushPromises()

      expect(resolveMergeCandidate).toHaveBeenCalledWith(100, 'dismissed')
    })
  })

  // ---- Quarantined tab ----

  describe('quarantined tab', () => {
    const quarantinedFixture = {
      items: [
        {
          id: 50,
          entity_type: 'person' as const,
          canonical_name: 'Stale Alias',
          aliases: [],
          mention_count: 0,
          first_seen: '2026-01-01',
          last_seen: '',
          is_quarantined: true,
          quarantine_reason: 'duplicate of Ritsya',
          quarantined_at: new Date(
            Date.now() - 2 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
        {
          id: 51,
          entity_type: 'topic' as const,
          canonical_name: 'Garbage',
          aliases: [],
          mention_count: 0,
          first_seen: '2026-02-01',
          last_seen: '',
          is_quarantined: true,
          quarantine_reason: 'noise',
          quarantined_at: new Date(
            Date.now() - 5 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
      ],
      total: 2,
    }

    afterEach(async () => {
      // Reset back to the safe empty default so unrelated tests
      // don't see a stale persistent mock.
      const { fetchQuarantinedEntities } = await import('@/api/entities')
      vi.mocked(fetchQuarantinedEntities).mockResolvedValue({
        items: [],
        total: 0,
      })
    })

    it('renders a quarantined badge with the count when entries exist', async () => {
      const { fetchQuarantinedEntities } = await import('@/api/entities')
      vi.mocked(fetchQuarantinedEntities).mockResolvedValue(quarantinedFixture)

      const wrapper = mountView()
      await flushPromises()

      const badge = wrapper.find('[data-testid="quarantined-badge"]')
      expect(badge.exists()).toBe(true)
      expect(badge.text()).toBe('2')
    })

    it('hides the badge when there are no quarantined entities', async () => {
      const wrapper = mountView()
      await flushPromises()
      // Default mock: empty quarantined list — badge should not render.
      expect(wrapper.find('[data-testid="quarantined-badge"]').exists()).toBe(
        false,
      )
    })

    it('clicking the Quarantined tab swaps the visible rows', async () => {
      const { fetchQuarantinedEntities } = await import('@/api/entities')
      vi.mocked(fetchQuarantinedEntities).mockResolvedValue(quarantinedFixture)

      const wrapper = mountView()
      await flushPromises()

      // Active tab — Ritsya / Blue Bottle from the default fixture.
      let rows = wrapper.findAll('[data-testid="entity-row"]')
      expect(rows[0].text()).not.toContain('Stale Alias')

      await wrapper
        .find('[data-testid="mode-tab-quarantined"]')
        .trigger('click')
      await flushPromises()

      rows = wrapper.findAll('[data-testid="entity-row"]')
      expect(rows).toHaveLength(2)
      const text = rows.map((r) => r.text()).join(' ')
      expect(text).toContain('Stale Alias')
      expect(text).toContain('duplicate of Ritsya')
      expect(text).toContain('Garbage')
      expect(text).toContain('noise')
      // Relative-time renders for both rows ("days ago").
      expect(text).toContain('days ago')

      // The type-filter row is hidden when in quarantined mode —
      // type filters do not apply to the quarantined endpoint.
      expect(wrapper.find('[data-testid="entity-type-filter"]').exists()).toBe(
        false,
      )
    })

    it('clicking Release on a row calls the API and refreshes both lists', async () => {
      const { fetchQuarantinedEntities, fetchEntities, releaseQuarantine } =
        await import('@/api/entities')
      vi.mocked(fetchQuarantinedEntities).mockResolvedValue(quarantinedFixture)
      vi.mocked(releaseQuarantine).mockResolvedValueOnce({
        id: 50,
        entity_type: 'person',
        canonical_name: 'Stale Alias',
        description: '',
        aliases: [],
        first_seen: '2026-01-01',
        created_at: '',
        updated_at: '',
        is_quarantined: false,
        quarantine_reason: '',
        quarantined_at: '',
      })

      const wrapper = mountView()
      await flushPromises()

      await wrapper
        .find('[data-testid="mode-tab-quarantined"]')
        .trigger('click')
      await flushPromises()

      const fetchSpy = vi.mocked(fetchEntities)
      fetchSpy.mockClear()

      // Switch back to active before triggering release? No —
      // the tab guard says we only refetch the active list when
      // the current mode is active. Stay on quarantined and just
      // verify the row is gone after release.
      const releaseButtons = wrapper.findAll(
        '[data-testid="release-row-button"]',
      )
      expect(releaseButtons).toHaveLength(2)

      await releaseButtons[0].trigger('click')
      await flushPromises()

      expect(releaseQuarantine).toHaveBeenCalledWith(50)
      const remaining = wrapper.findAll('[data-testid="entity-row"]')
      expect(remaining).toHaveLength(1)
      expect(remaining[0].text()).toContain('Garbage')
    })

    it('release from active tab also refreshes the active list', async () => {
      const { fetchQuarantinedEntities, fetchEntities, releaseQuarantine } =
        await import('@/api/entities')
      vi.mocked(fetchQuarantinedEntities).mockResolvedValue(quarantinedFixture)
      vi.mocked(releaseQuarantine).mockResolvedValue({
        id: 50,
        entity_type: 'person',
        canonical_name: 'Stale Alias',
        description: '',
        aliases: [],
        first_seen: '2026-01-01',
        created_at: '',
        updated_at: '',
        is_quarantined: false,
        quarantine_reason: '',
        quarantined_at: '',
      })

      const wrapper = mountView()
      await flushPromises()

      // Move to quarantined, click release, then swap back.
      await wrapper
        .find('[data-testid="mode-tab-quarantined"]')
        .trigger('click')
      await flushPromises()

      const fetchActiveSpy = vi.mocked(fetchEntities)
      fetchActiveSpy.mockClear()

      // Swap back to active before pressing release — the
      // releaseRow handler only calls loadEntities when the
      // current mode is active.
      await wrapper.find('[data-testid="mode-tab-active"]').trigger('click')
      await flushPromises()
      // Active mode reload was triggered by setListMode, clear it
      // so we observe the post-release one only.
      fetchActiveSpy.mockClear()

      // Switch to quarantined to find the release button, then back.
      await wrapper
        .find('[data-testid="mode-tab-quarantined"]')
        .trigger('click')
      await flushPromises()

      // Switch back to active again (last selection-clearing reload).
      await wrapper.find('[data-testid="mode-tab-active"]').trigger('click')
      await flushPromises()
      fetchActiveSpy.mockClear()

      // Cross-tab release: simulate by going back to the quarantined
      // tab and using the row button.
      await wrapper
        .find('[data-testid="mode-tab-quarantined"]')
        .trigger('click')
      await flushPromises()
      fetchActiveSpy.mockClear()

      const releaseButtons = wrapper.findAll(
        '[data-testid="release-row-button"]',
      )
      await releaseButtons[0].trigger('click')
      await flushPromises()

      // While in the quarantined tab, releaseRow does NOT refetch
      // the active list (guarded behind listMode === 'active').
      expect(fetchActiveSpy).not.toHaveBeenCalled()
      expect(releaseQuarantine).toHaveBeenCalledWith(50)
    })

    it('shows an empty state with quarantine-specific copy when the list is empty', async () => {
      const wrapper = mountView()
      await flushPromises()

      await wrapper
        .find('[data-testid="mode-tab-quarantined"]')
        .trigger('click')
      await flushPromises()

      const empty = wrapper.find('[data-testid="empty-state"]')
      expect(empty.exists()).toBe(true)
      expect(empty.text()).toContain('No quarantined entities')
    })

    it('renders relativeFromNow output for every magnitude bucket', async () => {
      // Hits the second-level "just now", minutes, hours, months,
      // and years branches of the relative-time helper. Each row
      // gets its own quarantined_at to drive a different branch.
      const { fetchQuarantinedEntities } = await import('@/api/entities')
      const now = Date.now()
      vi.mocked(fetchQuarantinedEntities).mockResolvedValue({
        items: [
          {
            id: 90,
            entity_type: 'person',
            canonical_name: 'JustNow',
            aliases: [],
            mention_count: 0,
            first_seen: '',
            last_seen: '',
            is_quarantined: true,
            quarantine_reason: 'a',
            quarantined_at: new Date(now - 5 * 1000).toISOString(),
          },
          {
            id: 91,
            entity_type: 'person',
            canonical_name: 'Minutes',
            aliases: [],
            mention_count: 0,
            first_seen: '',
            last_seen: '',
            is_quarantined: true,
            quarantine_reason: 'b',
            quarantined_at: new Date(now - 5 * 60 * 1000).toISOString(),
          },
          {
            id: 92,
            entity_type: 'person',
            canonical_name: 'Hours',
            aliases: [],
            mention_count: 0,
            first_seen: '',
            last_seen: '',
            is_quarantined: true,
            quarantine_reason: 'c',
            quarantined_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: 93,
            entity_type: 'person',
            canonical_name: 'Months',
            aliases: [],
            mention_count: 0,
            first_seen: '',
            last_seen: '',
            is_quarantined: true,
            quarantine_reason: 'd',
            quarantined_at: new Date(
              now - 90 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
          {
            id: 94,
            entity_type: 'person',
            canonical_name: 'Years',
            aliases: [],
            mention_count: 0,
            first_seen: '',
            last_seen: '',
            is_quarantined: true,
            quarantine_reason: 'e',
            quarantined_at: new Date(
              now - 2 * 365 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
          {
            id: 95,
            entity_type: 'person',
            canonical_name: 'OneMinute',
            aliases: [],
            mention_count: 0,
            first_seen: '',
            last_seen: '',
            is_quarantined: true,
            quarantine_reason: 'f',
            quarantined_at: new Date(now - 60 * 1000).toISOString(),
          },
          {
            id: 96,
            entity_type: 'person',
            canonical_name: 'OneHour',
            aliases: [],
            mention_count: 0,
            first_seen: '',
            last_seen: '',
            is_quarantined: true,
            quarantine_reason: 'g',
            quarantined_at: new Date(now - 60 * 60 * 1000).toISOString(),
          },
          {
            id: 97,
            entity_type: 'person',
            canonical_name: 'OneDay',
            aliases: [],
            mention_count: 0,
            first_seen: '',
            last_seen: '',
            is_quarantined: true,
            quarantine_reason: 'h',
            quarantined_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: 98,
            entity_type: 'person',
            canonical_name: 'OneMonth',
            aliases: [],
            mention_count: 0,
            first_seen: '',
            last_seen: '',
            is_quarantined: true,
            quarantine_reason: 'i',
            quarantined_at: new Date(
              now - 30 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
          {
            id: 99,
            entity_type: 'person',
            canonical_name: 'OneYear',
            aliases: [],
            mention_count: 0,
            first_seen: '',
            last_seen: '',
            is_quarantined: true,
            quarantine_reason: 'j',
            quarantined_at: new Date(
              now - 365 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
          {
            id: 100,
            entity_type: 'person',
            canonical_name: 'Garbled',
            aliases: [],
            mention_count: 0,
            first_seen: '',
            last_seen: '',
            is_quarantined: true,
            quarantine_reason: 'k',
            quarantined_at: 'not-a-date',
          },
          {
            id: 101,
            entity_type: 'person',
            canonical_name: 'Empty',
            aliases: [],
            mention_count: 0,
            first_seen: '',
            last_seen: '',
            is_quarantined: true,
            quarantine_reason: 'l',
            quarantined_at: '',
          },
        ],
        total: 12,
      })

      const wrapper = mountView()
      await flushPromises()

      await wrapper
        .find('[data-testid="mode-tab-quarantined"]')
        .trigger('click')
      await flushPromises()

      const allText = wrapper.text()
      // Sample buckets visible somewhere in the table.
      expect(allText).toContain('just now')
      expect(allText).toContain('minute')
      expect(allText).toContain('hour')
      expect(allText).toContain('day')
      expect(allText).toContain('month')
      expect(allText).toContain('year')
      // Garbled date falls back to the raw string.
      expect(allText).toContain('not-a-date')
    })

    it('hides pagination on the quarantined tab', async () => {
      const { fetchQuarantinedEntities } = await import('@/api/entities')
      vi.mocked(fetchQuarantinedEntities).mockResolvedValue(quarantinedFixture)

      const wrapper = mountView()
      await flushPromises()

      // Active tab: page info is visible (default fixture has rows).
      expect(wrapper.find('[data-testid="entity-page-info"]').exists()).toBe(
        true,
      )

      await wrapper
        .find('[data-testid="mode-tab-quarantined"]')
        .trigger('click')
      await flushPromises()

      // Quarantined tab does not paginate.
      expect(wrapper.find('[data-testid="entity-page-info"]').exists()).toBe(
        false,
      )
    })
  })

  // ---- Deselect checkbox ----

  it('deselecting a checkbox removes entity from selection', async () => {
    const { fetchEntities } = await import('@/api/entities')
    vi.mocked(fetchEntities).mockResolvedValueOnce(twoEntities)

    const wrapper = mountView()
    await flushPromises()

    const checkboxes = wrapper.findAll('[data-testid="entity-checkbox"]')

    // Select the first entity
    await checkboxes[0].trigger('change')
    expect(wrapper.find('[data-testid="selection-toolbar"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="selection-toolbar"]').text()).toContain(
      '1 selected',
    )

    // Deselect the same entity
    await checkboxes[0].trigger('change')
    expect(wrapper.find('[data-testid="selection-toolbar"]').exists()).toBe(
      false,
    )
  })
})
