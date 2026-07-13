/**
 * TDD spec for boundary-adjust/reset UI in EntryDetailView.
 *
 * Tests were written before the boundary control bar template was added
 * to drive out the UI and integration with saveEntryBoundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import EntryDetailView from '../EntryDetailView.vue'

// --- Module mocks ---------------------------------------------------------

vi.mock('@/api/entities', () => ({
  fetchEntryEntities: vi.fn().mockResolvedValue({
    entry_id: 1,
    items: [],
    total: 0,
  }),
}))

vi.mock('@/api/entries', () => ({
  fetchEntries: vi.fn(),
  fetchEntry: vi.fn(),
  updateEntryText: vi.fn(),
  updateEntryBoundary: vi.fn(),
  updateEntryDate: vi.fn(),
  deleteEntry: vi.fn().mockResolvedValue({ deleted: true, id: 1 }),
  verifyDoubts: vi.fn(),
  fetchEntryChunks: vi.fn().mockResolvedValue({ entry_id: 1, chunks: [] }),
  fetchEntryTokens: vi.fn().mockResolvedValue({
    entry_id: 1,
    encoding: 'cl100k_base',
    model_hint: 'text-embedding-3-large',
    token_count: 0,
    tokens: [],
  }),
  ingestText: vi.fn(),
  ingestFile: vi.fn(),
  ingestImages: vi.fn(),
  ingestAudio: vi.fn(),
}))

// useToast() returns a fresh object per call around shared singleton
// functions, so a per-object spy never sees the component's calls —
// mock the module instead.
const toastSuccessSpy = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    toasts: { value: [] },
    show: vi.fn(),
    success: toastSuccessSpy,
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
}))

// --- Router ---------------------------------------------------------------

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'entries', component: { template: '<div />' } },
    {
      path: '/entries/:id',
      name: 'entry-detail',
      component: EntryDetailView,
      props: true,
    },
    {
      path: '/entities/:id',
      name: 'entity-detail',
      component: { template: '<div />' },
      props: true,
    },
  ],
})

// --- Helpers --------------------------------------------------------------

/** Default entry without a content_boundary */
function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    entry_date: '2026-01-01',
    source_type: 'photo',
    raw_text: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
    final_text: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
    page_count: 1,
    word_count: 9,
    chunk_count: 0,
    language: 'en',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    doubts_verified: false,
    uncertain_spans: [],
    content_boundary: null,
    ...overrides,
  }
}

async function mountWithEntry(entryOverrides: Record<string, unknown> = {}) {
  const { fetchEntry } = await import('@/api/entries')
  vi.mocked(fetchEntry).mockResolvedValue(makeEntry(entryOverrides) as never)

  const wrapper = mount(EntryDetailView, {
    props: { id: '1' },
    global: {
      plugins: [createPinia(), router],
    },
  })
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

/** Switch the view from default read mode to edit mode */
async function switchToEditMode(
  wrapper: ReturnType<typeof mountWithEntry> extends Promise<infer T>
    ? T
    : never,
) {
  const editRadio = wrapper.find('[data-testid="view-mode-radio-edit"]')
  await editRadio.setValue(true)
  await wrapper.vm.$nextTick()
}

// --- Tests ----------------------------------------------------------------

describe('EntryDetailView — boundary controls', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // 1. No boundary → no controls
  it('does not render boundary controls when content_boundary is null', async () => {
    const wrapper = await mountWithEntry({ content_boundary: null })
    await switchToEditMode(wrapper)

    expect(wrapper.find('[data-testid="boundary-controls"]').exists()).toBe(
      false,
    )
  })

  // 2. With boundary → controls appear
  it('renders boundary controls in edit mode when content_boundary is set', async () => {
    const wrapper = await mountWithEntry({
      content_boundary: { char_start: 0, char_end: 17 },
    })
    await switchToEditMode(wrapper)

    expect(wrapper.find('[data-testid="boundary-controls"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="boundary-reset-btn"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="boundary-start-select"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="boundary-end-select"]').exists()).toBe(
      true,
    )
  })

  // 3. Controls hidden in read mode even when boundary is set
  it('does not render boundary controls in read mode', async () => {
    const wrapper = await mountWithEntry({
      content_boundary: { char_start: 0, char_end: 17 },
    })
    // Default mode is read — do NOT switch to edit.
    expect(wrapper.find('[data-testid="boundary-controls"]').exists()).toBe(
      false,
    )
  })

  // 4. "Use full page" calls saveEntryBoundary(id, null, null)
  it('"Use full page" button calls saveEntryBoundary with null/null', async () => {
    const { updateEntryBoundary } = await import('@/api/entries')
    vi.mocked(updateEntryBoundary).mockResolvedValue(
      makeEntry({ content_boundary: null }) as never,
    )

    const wrapper = await mountWithEntry({
      content_boundary: { char_start: 0, char_end: 17 },
    })
    await switchToEditMode(wrapper)

    await wrapper.find('[data-testid="boundary-reset-btn"]').trigger('click')
    await flushPromises()

    expect(updateEntryBoundary).toHaveBeenCalledWith(1, null, null)
  })

  // 5. Paragraph select shows correct number of options
  it('renders one select option per paragraph break', async () => {
    // raw_text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
    // has 2 double-newlines → 3 paragraphs → 3 breaks (offsets 0, 18, 36)
    const wrapper = await mountWithEntry({
      content_boundary: { char_start: 0, char_end: 17 },
    })
    await switchToEditMode(wrapper)

    const startSelect = wrapper.find('[data-testid="boundary-start-select"]')
      .element as HTMLSelectElement
    // 3 paragraphs = 3 break offsets
    expect(startSelect.options.length).toBe(3)
  })

  // 6. Changing start select calls saveEntryBoundary with correct offset
  it('changing start select calls saveEntryBoundary with the selected paragraph offset', async () => {
    const { updateEntryBoundary } = await import('@/api/entries')
    vi.mocked(updateEntryBoundary).mockResolvedValue(
      makeEntry({
        content_boundary: { char_start: 18, char_end: 36 },
      }) as never,
    )

    const wrapper = await mountWithEntry({
      content_boundary: { char_start: 0, char_end: 36 },
    })
    await switchToEditMode(wrapper)

    // Select the second paragraph (index 1, offset 18)
    const startSelect = wrapper.find('[data-testid="boundary-start-select"]')
    await startSelect.setValue('1')
    await flushPromises()

    // Called with start=18 (offset of paragraph break idx 1)
    const calls = vi.mocked(updateEntryBoundary).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const lastCall = calls[calls.length - 1]
    expect(lastCall[0]).toBe(1) // entry id
    expect(lastCall[1]).toBe(18) // start offset of paragraph 2
  })

  // 7. Changing end select calls saveEntryBoundary with correct offset
  it('changing end select calls saveEntryBoundary with the selected end offset', async () => {
    const { updateEntryBoundary } = await import('@/api/entries')
    vi.mocked(updateEntryBoundary).mockResolvedValue(
      makeEntry({
        content_boundary: { char_start: 0, char_end: 18 },
      }) as never,
    )

    const wrapper = await mountWithEntry({
      content_boundary: { char_start: 0, char_end: 36 },
    })
    await switchToEditMode(wrapper)

    // Select the second paragraph (index 1, offset 18) as end
    const endSelect = wrapper.find('[data-testid="boundary-end-select"]')
    await endSelect.setValue('1')
    await flushPromises()

    const calls = vi.mocked(updateEntryBoundary).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const lastCall = calls[calls.length - 1]
    expect(lastCall[0]).toBe(1) // entry id
    expect(lastCall[2]).toBe(18) // end offset of paragraph break idx 1
  })

  // 8. Boundary info shows current char range
  it('shows the current boundary char range in the control bar', async () => {
    const wrapper = await mountWithEntry({
      content_boundary: { char_start: 5, char_end: 42 },
    })
    await switchToEditMode(wrapper)

    const bar = wrapper.find('[data-testid="boundary-controls"]')
    expect(bar.text()).toContain('5')
    expect(bar.text()).toContain('42')
  })

  // 9. After reset, controls disappear (entry has no boundary)
  it('hides boundary controls after a successful reset to null boundary', async () => {
    const { updateEntryBoundary } = await import('@/api/entries')
    // After reset, the server returns entry with no boundary
    vi.mocked(updateEntryBoundary).mockResolvedValue(
      makeEntry({ content_boundary: null }) as never,
    )

    const wrapper = await mountWithEntry({
      content_boundary: { char_start: 0, char_end: 17 },
    })
    await switchToEditMode(wrapper)

    expect(wrapper.find('[data-testid="boundary-controls"]').exists()).toBe(
      true,
    )

    await wrapper.find('[data-testid="boundary-reset-btn"]').trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()

    // Once currentEntry.content_boundary becomes null, bar disappears
    expect(wrapper.find('[data-testid="boundary-controls"]').exists()).toBe(
      false,
    )
  })

  // 10. start >= end guard: selecting start at/after end does NOT call saveEntryBoundary
  it('does not call updateEntryBoundary when selected start >= persisted end', async () => {
    const { updateEntryBoundary } = await import('@/api/entries')

    // raw_text has breaks at 0, 18, 36; persisted end is 18 (paragraph 2 start)
    const wrapper = await mountWithEntry({
      content_boundary: { char_start: 0, char_end: 18 },
    })
    await switchToEditMode(wrapper)

    // Select paragraph index 1 (offset 18) as start — equals the persisted end (18)
    const startSelect = wrapper.find('[data-testid="boundary-start-select"]')
    await startSelect.setValue('1')
    await flushPromises()

    expect(updateEntryBoundary).not.toHaveBeenCalled()
  })

  // 11. Adjusting start keeps the persisted char_end exactly (no re-snap)
  it('adjusting start passes the exact persisted char_end to saveEntryBoundary', async () => {
    const { updateEntryBoundary } = await import('@/api/entries')
    vi.mocked(updateEntryBoundary).mockResolvedValue(
      makeEntry({
        content_boundary: { char_start: 0, char_end: 36 },
      }) as never,
    )

    // Persisted end is 36; paragraph breaks are at 0, 18, 36
    // Selecting start=index 0 (offset 0) while end is persisted at 36
    const wrapper = await mountWithEntry({
      content_boundary: { char_start: 18, char_end: 36 },
    })
    await switchToEditMode(wrapper)

    // Switch start back to index 0 (offset 0) — end should stay at exact persisted 36
    const startSelect = wrapper.find('[data-testid="boundary-start-select"]')
    await startSelect.setValue('0')
    await flushPromises()

    const calls = vi.mocked(updateEntryBoundary).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const lastCall = calls[calls.length - 1]
    expect(lastCall[1]).toBe(0) // start offset
    expect(lastCall[2]).toBe(36) // end — exact persisted value, not re-snapped
  })

  // 12. Adjusting end keeps the persisted char_start exactly (no re-snap)
  it('adjusting end passes the exact persisted char_start to saveEntryBoundary', async () => {
    const { updateEntryBoundary } = await import('@/api/entries')
    vi.mocked(updateEntryBoundary).mockResolvedValue(
      makeEntry({
        content_boundary: { char_start: 0, char_end: 37 },
      }) as never,
    )

    // Persisted start is 0; paragraph breaks are at 0, 18, 37
    const wrapper = await mountWithEntry({
      content_boundary: { char_start: 0, char_end: 18 },
    })
    await switchToEditMode(wrapper)

    // Switch end to index 2 (offset 37) — start should stay at exact persisted 0
    const endSelect = wrapper.find('[data-testid="boundary-end-select"]')
    await endSelect.setValue('2')
    await flushPromises()

    const calls = vi.mocked(updateEntryBoundary).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const lastCall = calls[calls.length - 1]
    expect(lastCall[1]).toBe(0) // start — exact persisted value, not re-snapped
    expect(lastCall[2]).toBe(37) // end offset (paragraph break at index 2)
  })

  // 13. start >= end guard for end select: selecting end <= start does NOT call saveEntryBoundary
  it('does not call updateEntryBoundary when selected end <= persisted start', async () => {
    const { updateEntryBoundary } = await import('@/api/entries')

    // Persisted start is 18; selecting end at index 0 (offset 0) → 0 <= 18, invalid
    const wrapper = await mountWithEntry({
      content_boundary: { char_start: 18, char_end: 36 },
    })
    await switchToEditMode(wrapper)

    const endSelect = wrapper.find('[data-testid="boundary-end-select"]')
    await endSelect.setValue('0')
    await flushPromises()

    expect(updateEntryBoundary).not.toHaveBeenCalled()
  })
})

// --- Unconfirmed-date pill + confirm flow (spec 2026-07-13) ---------------

describe('unconfirmed-date pill', () => {
  it('shows the pill and opens the date editor from it', async () => {
    const wrapper = await mountWithEntry({ date_confirmed: false })
    const pill = wrapper.find('[data-testid="unconfirmed-date-pill"]')
    expect(pill.exists()).toBe(true)
    await pill.trigger('click')
    expect(wrapper.find('[data-testid="date-input"]').exists()).toBe(true)
  })

  it('does not show the pill for confirmed entries', async () => {
    const wrapper = await mountWithEntry({ date_confirmed: true })
    expect(wrapper.find('[data-testid="unconfirmed-date-pill"]').exists()).toBe(
      false,
    )
  })

  it('does not show the pill when the field is absent (old payload)', async () => {
    const wrapper = await mountWithEntry()
    expect(wrapper.find('[data-testid="unconfirmed-date-pill"]').exists()).toBe(
      false,
    )
  })

  it('toasts when saving a date confirms a quarantined entry', async () => {
    const { updateEntryDate } = await import('@/api/entries')
    vi.mocked(updateEntryDate).mockResolvedValue(
      makeEntry({ entry_date: '2026-07-09', date_confirmed: true }) as never,
    )
    toastSuccessSpy.mockClear()

    const wrapper = await mountWithEntry({ date_confirmed: false })
    await wrapper.find('[data-testid="unconfirmed-date-pill"]').trigger('click')
    const input = wrapper.find('[data-testid="date-input"]')
    await input.setValue('2026-07-09')
    await wrapper.find('[data-testid="date-save-button"]').trigger('click')
    await flushPromises()

    expect(toastSuccessSpy).toHaveBeenCalledWith(
      'Date confirmed — reprocessing queued.',
    )
  })

  it('does not toast for an ordinary date edit', async () => {
    const { updateEntryDate } = await import('@/api/entries')
    vi.mocked(updateEntryDate).mockResolvedValue(
      makeEntry({ entry_date: '2026-07-09', date_confirmed: true }) as never,
    )
    toastSuccessSpy.mockClear()

    const wrapper = await mountWithEntry({ date_confirmed: true })
    await wrapper.find('[data-testid="entry-date-heading"]').trigger('click')
    const input = wrapper.find('[data-testid="date-input"]')
    await input.setValue('2026-07-09')
    await wrapper.find('[data-testid="date-save-button"]').trigger('click')
    await flushPromises()

    expect(toastSuccessSpy).not.toHaveBeenCalledWith(
      'Date confirmed — reprocessing queued.',
    )
  })
})
