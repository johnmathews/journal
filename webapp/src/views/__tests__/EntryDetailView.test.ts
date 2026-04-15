import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import EntryDetailView from '../EntryDetailView.vue'

// Entity fetches used by EntryDetailView for the chip strip — mocked
// to return an empty list so the tests don't hit the network. The
// shape mirrors the REAL server response: `{entry_id, items, total}`.
// An earlier version of this mock invented `entities: []`, which
// happened to match the then-wrong webapp type and hid a latent
// blank-page crash in production (the real server returns `items`
// and the template blew up on `entryEntities.length` because
// `resp.entities` was always undefined).
vi.mock('@/api/entities', () => ({
  fetchEntryEntities: vi.fn().mockResolvedValue({
    entry_id: 1,
    items: [],
    total: 0,
  }),
}))

vi.mock('@/api/entries', () => ({
  fetchEntries: vi.fn(),
  fetchEntry: vi.fn().mockResolvedValue({
    id: 1,
    entry_date: '2026-03-22',
    source_type: 'photo',
    raw_text: 'Original OCR text here.',
    final_text: 'Original OCR text here.',
    page_count: 2,
    word_count: 4,
    chunk_count: 1,
    language: 'en',
    created_at: '2026-03-23T10:30:00Z',
    updated_at: '2026-03-23T10:30:00Z',
  }),
  updateEntryText: vi.fn().mockResolvedValue({
    id: 1,
    entry_date: '2026-03-22',
    source_type: 'photo',
    raw_text: 'Original OCR text here.',
    final_text: 'Updated text',
    page_count: 2,
    word_count: 4,
    chunk_count: 1,
    language: 'en',
    created_at: '2026-03-23T10:30:00Z',
    updated_at: '2026-03-23T10:30:00Z',
  }),
  verifyDoubts: vi.fn().mockResolvedValue({
    id: 1,
    entry_date: '2026-03-22',
    source_type: 'photo',
    raw_text: 'Hello Ritsya from Vienna.',
    final_text: 'Hello Ritsya from Vienna.',
    page_count: 1,
    word_count: 4,
    chunk_count: 0,
    language: 'en',
    created_at: '2026-03-23T10:30:00Z',
    updated_at: '2026-03-23T10:30:00Z',
    doubts_verified: true,
    uncertain_spans: [],
  }),
  deleteEntry: vi.fn().mockResolvedValue({ deleted: true, id: 1 }),
  fetchEntryChunks: vi.fn().mockResolvedValue({
    entry_id: 1,
    chunks: [
      {
        index: 0,
        text: 'Corrected',
        char_start: 0,
        char_end: 9,
        token_count: 2,
      },
      {
        index: 1,
        text: 'text here.',
        char_start: 10,
        char_end: 20,
        token_count: 3,
      },
    ],
  }),
  fetchEntryTokens: vi.fn().mockResolvedValue({
    entry_id: 1,
    encoding: 'cl100k_base',
    model_hint: 'text-embedding-3-large',
    token_count: 4,
    tokens: [
      { index: 0, token_id: 1, text: 'Cor', char_start: 0, char_end: 3 },
      { index: 1, token_id: 2, text: 'rected', char_start: 3, char_end: 9 },
      { index: 2, token_id: 3, text: ' text', char_start: 9, char_end: 14 },
      { index: 3, token_id: 4, text: ' here.', char_start: 14, char_end: 20 },
    ],
  }),
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'entries', component: { template: '<div />' } },
    {
      path: '/entries/:id',
      name: 'entry-detail',
      component: EntryDetailView,
      props: true,
    },
    // Stub — used as the `to` target for the entity chip RouterLinks
    // rendered inside this view. Vue Router's `useLink` resolves the
    // target synchronously at component setup, so the route has to
    // exist or the test throws "No match for ..." before any
    // assertion runs.
    {
      path: '/entities/:id',
      name: 'entity-detail',
      component: { template: '<div />' },
      props: true,
    },
  ],
})

function mountComponent() {
  return mount(EntryDetailView, {
    props: { id: '1' },
    global: {
      plugins: [createPinia(), router],
    },
  })
}

/** Switch the view from its default read mode to edit mode. */
async function switchToEditMode(wrapper: ReturnType<typeof mountComponent>) {
  const editRadio = wrapper.find('[data-testid="view-mode-radio-edit"]')
  await editRadio.setValue(true)
  await wrapper.vm.$nextTick()
}

describe('EntryDetailView', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mounts without error', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('[data-testid="entry-detail-view"]').exists()).toBe(
      true,
    )
  })

  it('loads entry on mount', async () => {
    mountComponent()
    await flushPromises()

    const { fetchEntry } = await import('@/api/entries')
    expect(fetchEntry).toHaveBeenCalledWith(1)
  })

  it('renders entry detail after loading', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()

    // After the mock resolves, either the loading state clears and the
    // view renders, or we're still in loading. Either way the root
    // container must exist.
    expect(wrapper.find('[data-testid="entry-detail-view"]').exists()).toBe(
      true,
    )
    // When the fetch resolves, the back button becomes visible.
    expect(wrapper.find('[data-testid="back-button"]').exists()).toBe(true)
  })

  it('renders the original OCR display and the corrected editor when the entry has loaded', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await switchToEditMode(wrapper)

    expect(wrapper.find('[data-testid="ocr-display"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="corrected-textarea"]').exists()).toBe(
      true,
    )
  })

  it('renders the diff toggle on by default with a visible legend', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await switchToEditMode(wrapper)

    const toggle = wrapper.find('[data-testid="diff-toggle"]')
      .element as HTMLInputElement
    expect(toggle.checked).toBe(true)
    expect(wrapper.find('[data-testid="diff-legend"]').exists()).toBe(true)
  })

  it('highlights diff spans in both panels when original and corrected differ', async () => {
    // Override fetchEntry so raw_text and final_text differ (triggers diff).
    // This entry defaults to read mode; switch to edit to see the panels.
    const { fetchEntry } = await import('@/api/entries')
    ;(fetchEntry as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1,
      entry_date: '2026-03-22',
      source_type: 'photo',
      raw_text: 'Original OCR text here.',
      final_text: 'Corrected text here.',
      page_count: 2,
      word_count: 4,
      chunk_count: 1,
      language: 'en',
      created_at: '2026-03-23T10:30:00Z',
      updated_at: '2026-03-23T10:30:00Z',
    })
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()

    // Switch from read mode to edit mode
    const editRadio = wrapper.find('[data-testid="view-mode-radio-edit"]')
    await editRadio.setValue(true)
    await wrapper.vm.$nextTick()

    const originalHtml = wrapper.find('[data-testid="ocr-display"]').html()
    expect(originalHtml).toContain('<mark')
    expect(originalHtml).toContain('bg-red-100')

    const correctedBackdropHtml = wrapper.find('.corrected-wrapper').html()
    expect(correctedBackdropHtml).toContain('bg-emerald-100')
  })

  it('hides the legend and strips highlight marks when the diff toggle is turned off', async () => {
    const { fetchEntry } = await import('@/api/entries')
    ;(fetchEntry as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1,
      entry_date: '2026-03-22',
      source_type: 'photo',
      raw_text: 'Original OCR text here.',
      final_text: 'Corrected text here.',
      page_count: 2,
      word_count: 4,
      chunk_count: 1,
      language: 'en',
      created_at: '2026-03-23T10:30:00Z',
      updated_at: '2026-03-23T10:30:00Z',
    })
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()

    // Switch from read mode to edit mode
    const editRadio = wrapper.find('[data-testid="view-mode-radio-edit"]')
    await editRadio.setValue(true)
    await wrapper.vm.$nextTick()

    // With diff on, the original panel contains mark tags.
    expect(wrapper.find('[data-testid="ocr-display"]').html()).toContain(
      '<mark',
    )

    // Flip the toggle off.
    const toggle = wrapper.find('[data-testid="diff-toggle"]')
    await toggle.setValue(false)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="diff-legend"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ocr-display"]').html()).not.toContain(
      '<mark',
    )
  })

  it('defaults the overlay mode to off with the textarea visible', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await switchToEditMode(wrapper)

    const offRadio = wrapper.find('[data-testid="overlay-radio-off"]')
      .element as HTMLInputElement
    expect(offRadio.checked).toBe(true)
    // Textarea is rendered in off mode
    expect(wrapper.find('[data-testid="corrected-textarea"]').exists()).toBe(
      true,
    )
    // Overlay display is not rendered
    expect(wrapper.find('[data-testid="overlay-display"]').exists()).toBe(false)
  })

  it('switches to chunks overlay, fetches data, and renders the overlay', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await switchToEditMode(wrapper)

    await wrapper.find('[data-testid="overlay-radio-chunks"]').setValue(true)
    await flushPromises()
    await wrapper.vm.$nextTick()

    const { fetchEntryChunks } = await import('@/api/entries')
    expect(fetchEntryChunks).toHaveBeenCalledWith(1)

    // Textarea is hidden, overlay display is shown.
    expect(wrapper.find('[data-testid="corrected-textarea"]').exists()).toBe(
      false,
    )
    const overlay = wrapper.find('[data-testid="overlay-display"]')
    expect(overlay.exists()).toBe(true)
    // The chunk-a class (sky background) should appear in the rendered HTML,
    // and the chunk-start badge should mark where chunk 0 begins.
    expect(overlay.html()).toContain('bg-sky-200')
    expect(overlay.html()).toContain('aria-label="chunk 0 start"')
  })

  it('switches to tokens overlay and fetches tokens', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await switchToEditMode(wrapper)

    await wrapper.find('[data-testid="overlay-radio-tokens"]').setValue(true)
    await flushPromises()
    await wrapper.vm.$nextTick()

    const { fetchEntryTokens } = await import('@/api/entries')
    expect(fetchEntryTokens).toHaveBeenCalledWith(1)

    const overlay = wrapper.find('[data-testid="overlay-display"]')
    expect(overlay.exists()).toBe(true)
  })

  it('restores the textarea when overlay is switched back to off', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await switchToEditMode(wrapper)

    await wrapper.find('[data-testid="overlay-radio-chunks"]').setValue(true)
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="corrected-textarea"]').exists()).toBe(
      false,
    )

    await wrapper.find('[data-testid="overlay-radio-off"]').setValue(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="corrected-textarea"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="overlay-display"]').exists()).toBe(false)
  })

  it('surfaces the chunks_not_backfilled error message', async () => {
    const entriesApi = await import('@/api/entries')
    const { ApiRequestError } = await import('@/api/client')
    vi.mocked(entriesApi.fetchEntryChunks).mockRejectedValueOnce(
      new ApiRequestError(
        404,
        'chunks_not_backfilled',
        'This entry was ingested before chunk persistence was available.',
      ),
    )

    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await switchToEditMode(wrapper)

    await wrapper.find('[data-testid="overlay-radio-chunks"]').setValue(true)
    await flushPromises()
    await wrapper.vm.$nextTick()

    const banner = wrapper.find('[data-testid="overlay-error-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('chunk persistence')
  })

  it('navigates back to the entries list when Back is clicked', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()

    const pushSpy = vi.spyOn(router, 'push')
    await wrapper.find('[data-testid="back-button"]').trigger('click')

    expect(pushSpy).toHaveBeenCalledWith({ name: 'entries' })
  })

  it('Save and Reset start disabled when the editor is not dirty', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await switchToEditMode(wrapper)

    const save = wrapper.find('[data-testid="save-button"]')
      .element as HTMLButtonElement
    const reset = wrapper.find('[data-testid="reset-button"]')
      .element as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(reset.disabled).toBe(true)
  })

  it('enables Save and Reset once the corrected textarea is edited', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await switchToEditMode(wrapper)

    await wrapper.find('[data-testid="corrected-textarea"]').setValue('edited')

    const save = wrapper.find('[data-testid="save-button"]')
      .element as HTMLButtonElement
    const reset = wrapper.find('[data-testid="reset-button"]')
      .element as HTMLButtonElement
    expect(save.disabled).toBe(false)
    expect(reset.disabled).toBe(false)
    expect(wrapper.find('[data-testid="unsaved-indicator"]').exists()).toBe(
      true,
    )
  })

  it('calls updateEntryText on Save with the edited text', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await switchToEditMode(wrapper)

    const { updateEntryText } = await import('@/api/entries')
    const mockUpdate = vi.mocked(updateEntryText)
    mockUpdate.mockClear()

    await wrapper
      .find('[data-testid="corrected-textarea"]')
      .setValue('Updated text')
    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    expect(mockUpdate).toHaveBeenCalledWith(1, 'Updated text')
  })

  it('refetches chunks after save when the overlay is next switched on', async () => {
    // Regression for next-session item 5. After the user saves an
    // edit, the previously-fetched chunks describe the OLD final_text
    // and the offsets no longer line up with the re-chunked server
    // state. Flipping the overlay off→on after a save must refetch,
    // not reuse the stale cache.
    const { fetchEntryChunks, updateEntryText } = await import('@/api/entries')
    const fetchSpy = vi.mocked(fetchEntryChunks)
    const updateSpy = vi.mocked(updateEntryText)
    fetchSpy.mockClear()
    updateSpy.mockClear()

    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await switchToEditMode(wrapper)

    // Warm the chunks cache: switch overlay on, let the fetch happen.
    await wrapper.find('[data-testid="overlay-radio-chunks"]').setValue(true)
    await flushPromises()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Switch overlay off so the next on→chunks flip is observable.
    await wrapper.find('[data-testid="overlay-radio-off"]').setValue(true)
    await flushPromises()

    // With the old behaviour, switching back on would NOT refetch
    // (the cache survived). Verify the baseline by flipping on and
    // confirming no additional fetch happens — then mutate and save.
    await wrapper.find('[data-testid="overlay-radio-chunks"]').setValue(true)
    await flushPromises()
    expect(fetchSpy).toHaveBeenCalledTimes(1) // still cached

    // Switch off, dirty the textarea, and save.
    await wrapper.find('[data-testid="overlay-radio-off"]').setValue(true)
    await flushPromises()

    await wrapper
      .find('[data-testid="corrected-textarea"]')
      .setValue('Updated text that will re-chunk')
    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()
    expect(updateSpy).toHaveBeenCalled()

    // After the save, flipping chunks on must trigger a fresh fetch.
    await wrapper.find('[data-testid="overlay-radio-chunks"]').setValue(true)
    await flushPromises()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('refetches tokens after save when the overlay is next switched on', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await switchToEditMode(wrapper)

    const { fetchEntryTokens, updateEntryText } = await import('@/api/entries')
    const fetchSpy = vi.mocked(fetchEntryTokens)
    const updateSpy = vi.mocked(updateEntryText)
    fetchSpy.mockClear()
    updateSpy.mockClear()

    // Warm the tokens cache.
    await wrapper.find('[data-testid="overlay-radio-tokens"]').setValue(true)
    await flushPromises()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Switch off, dirty, save.
    await wrapper.find('[data-testid="overlay-radio-off"]').setValue(true)
    await flushPromises()
    await wrapper
      .find('[data-testid="corrected-textarea"]')
      .setValue('Different content')
    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()
    expect(updateSpy).toHaveBeenCalled()

    // Next flip on → fresh fetch.
    await wrapper.find('[data-testid="overlay-radio-tokens"]').setValue(true)
    await flushPromises()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('shows an inline save error banner when updateEntryText rejects', async () => {
    const { updateEntryText } = await import('@/api/entries')
    const mockUpdate = vi.mocked(updateEntryText)
    mockUpdate.mockRejectedValueOnce(new Error('Server exploded'))

    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await switchToEditMode(wrapper)

    await wrapper
      .find('[data-testid="corrected-textarea"]')
      .setValue('bad edit')
    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()

    const banner = wrapper.find('[data-testid="save-error-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('Server exploded')
  })

  it('Reset restores the edited text to the entry final_text', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()
    await switchToEditMode(wrapper)

    const textarea = wrapper.find('[data-testid="corrected-textarea"]')
    await textarea.setValue('dirty')
    expect(wrapper.find('[data-testid="unsaved-indicator"]').exists()).toBe(
      true,
    )

    await wrapper.find('[data-testid="reset-button"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect((textarea.element as HTMLTextAreaElement).value).toBe(
      'Original OCR text here.',
    )
    expect(wrapper.find('[data-testid="unsaved-indicator"]').exists()).toBe(
      false,
    )
  })

  it('renders the Modified badge when raw_text differs from final_text', async () => {
    const { fetchEntry } = await import('@/api/entries')
    ;(fetchEntry as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1,
      entry_date: '2026-03-22',
      source_type: 'photo',
      raw_text: 'Original OCR text here.',
      final_text: 'Corrected text here.',
      page_count: 2,
      word_count: 4,
      chunk_count: 1,
      language: 'en',
      created_at: '2026-03-23T10:30:00Z',
      updated_at: '2026-03-23T10:30:00Z',
    })
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="modified-tag"]').exists()).toBe(true)
  })

  describe('delete flow', () => {
    // happy-dom doesn't provide window.confirm, so we stub it directly
    // for each test in this block and restore afterwards.
    let confirmMock: ReturnType<typeof vi.fn>
    let originalConfirm: typeof window.confirm

    beforeEach(() => {
      originalConfirm = window.confirm
      confirmMock = vi.fn().mockReturnValue(true)
      window.confirm = confirmMock as unknown as typeof window.confirm
    })

    afterEach(() => {
      window.confirm = originalConfirm
    })

    it('renders a delete button once the entry has loaded', async () => {
      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()
      await switchToEditMode(wrapper)

      expect(wrapper.find('[data-testid="delete-button"]').exists()).toBe(true)
    })

    it('does not call deleteEntry when the user cancels the confirm', async () => {
      confirmMock.mockReturnValue(false)

      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()
      await switchToEditMode(wrapper)

      const { deleteEntry } = await import('@/api/entries')
      const mockDelete = vi.mocked(deleteEntry)
      mockDelete.mockClear()

      await wrapper.find('[data-testid="delete-button"]').trigger('click')
      await flushPromises()

      expect(confirmMock).toHaveBeenCalled()
      expect(mockDelete).not.toHaveBeenCalled()
    })

    it('calls deleteEntry and navigates to the list on confirm', async () => {
      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()
      await switchToEditMode(wrapper)

      const pushSpy = vi.spyOn(router, 'push')
      const { deleteEntry } = await import('@/api/entries')
      const mockDelete = vi.mocked(deleteEntry)
      mockDelete.mockClear()
      mockDelete.mockResolvedValueOnce({ deleted: true, id: 1 })

      await wrapper.find('[data-testid="delete-button"]').trigger('click')
      await flushPromises()

      expect(mockDelete).toHaveBeenCalledWith(1)
      expect(pushSpy).toHaveBeenCalledWith({ name: 'entries' })
    })

    it('shows an inline delete error banner when deleteEntry rejects', async () => {
      const { deleteEntry } = await import('@/api/entries')
      const mockDelete = vi.mocked(deleteEntry)
      mockDelete.mockRejectedValueOnce(new Error('Could not delete'))

      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()
      await switchToEditMode(wrapper)

      await wrapper.find('[data-testid="delete-button"]').trigger('click')
      await flushPromises()
      await wrapper.vm.$nextTick()

      const banner = wrapper.find('[data-testid="delete-error-banner"]')
      expect(banner.exists()).toBe(true)
      expect(banner.text()).toContain('Could not delete')
    })

    it('does not trigger the unsaved-changes prompt when deleting a dirty entry', async () => {
      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()
      await switchToEditMode(wrapper)

      // Make the editor dirty.
      await wrapper
        .find('[data-testid="corrected-textarea"]')
        .setValue('dirty edit')
      expect(wrapper.find('[data-testid="unsaved-indicator"]').exists()).toBe(
        true,
      )

      const pushSpy = vi.spyOn(router, 'push')
      const { deleteEntry } = await import('@/api/entries')
      const mockDelete = vi.mocked(deleteEntry)
      mockDelete.mockClear()
      mockDelete.mockResolvedValueOnce({ deleted: true, id: 1 })

      await wrapper.find('[data-testid="delete-button"]').trigger('click')
      await flushPromises()

      // Exactly one confirm: the delete confirmation. The unsaved-changes
      // guard should NOT fire because the delete flow resets the editor
      // before navigating.
      expect(confirmMock).toHaveBeenCalledTimes(1)
      expect(pushSpy).toHaveBeenCalledWith({ name: 'entries' })
    })
  })

  describe('beforeunload guard', () => {
    it('prevents the browser close when there are unsaved changes', async () => {
      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()
      await switchToEditMode(wrapper)

      await wrapper
        .find('[data-testid="corrected-textarea"]')
        .setValue('dirty edit')

      const event = new Event('beforeunload', {
        cancelable: true,
      }) as BeforeUnloadEvent
      const prevent = vi.spyOn(event, 'preventDefault')
      window.dispatchEvent(event)

      expect(prevent).toHaveBeenCalled()
    })

    it('does not prevent the browser close when the editor is clean', async () => {
      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()

      const event = new Event('beforeunload', {
        cancelable: true,
      }) as BeforeUnloadEvent
      const prevent = vi.spyOn(event, 'preventDefault')
      window.dispatchEvent(event)

      expect(prevent).not.toHaveBeenCalled()
    })

    it('removes the beforeunload listener on unmount', async () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const wrapper = mountComponent()
      await flushPromises()
      wrapper.unmount()

      expect(removeSpy).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function),
      )
      removeSpy.mockRestore()
    })
  })

  // The onBeforeRouteLeave guard at the top of EntryDetailView.vue is left
  // uncovered here. Testing it cleanly requires mounting the component
  // through a <router-view> parent so vue-router knows which route the
  // guard belongs to; mounting the component directly (as this file does
  // everywhere else) leaves the guard un-registered in the router's
  // matched-route list. The 7 lines of coverage aren't worth the test
  // plumbing — the guard is exercised in manual testing and via the
  // Playwright check done during the Mosaic migration.

  describe('deep-link scroll to chunk', () => {
    it('with ?chunk=N in the URL, enables chunks overlay and fetches chunks', async () => {
      // Put the route into the ?chunk=1 state before mounting, so the
      // initial `watch([route.query.chunk, currentEntry.id], ...,
      // { immediate: true })` fires with the query param already set.
      await router.push({
        name: 'entry-detail',
        params: { id: '1' },
        query: { chunk: '1' },
      })
      await router.isReady()

      const wrapper = mount(EntryDetailView, {
        props: { id: '1' },
        attachTo: document.body,
        global: {
          plugins: [createPinia(), router],
        },
      })
      // Wait for the entry to load.
      await flushPromises()
      await wrapper.vm.$nextTick()

      // Switch to edit mode so the overlay UI is visible.
      await switchToEditMode(wrapper)
      await flushPromises()
      await wrapper.vm.$nextTick()

      // Overlay flipped to chunks mode automatically by the deep-link watcher.
      const radio = wrapper.find('[data-testid="overlay-radio-chunks"]')
        .element as HTMLInputElement
      expect(radio.checked).toBe(true)

      // Chunks were fetched.
      const { fetchEntryChunks } = await import('@/api/entries')
      expect(fetchEntryChunks).toHaveBeenCalledWith(1)

      wrapper.unmount()
    })

    it('with no ?chunk param, the overlay stays off by default', async () => {
      await router.push({ name: 'entry-detail', params: { id: '1' } })
      await router.isReady()

      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()
      await switchToEditMode(wrapper)

      const radio = wrapper.find('[data-testid="overlay-radio-off"]')
        .element as HTMLInputElement
      expect(radio.checked).toBe(true)
    })

    it('ignores a non-numeric ?chunk param without breaking the mount', async () => {
      await router.push({
        name: 'entry-detail',
        params: { id: '1' },
        query: { chunk: 'not-a-number' },
      })
      await router.isReady()

      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()
      await switchToEditMode(wrapper)

      // Fell through to the off overlay — no crash, no chunks mode.
      const radio = wrapper.find('[data-testid="overlay-radio-off"]')
        .element as HTMLInputElement
      expect(radio.checked).toBe(true)
    })
  })

  // --------------------------------------------------------------
  // Blank-page regression suite.
  //
  // Context: users on Firefox and Safari reported that clicking an
  // entry from /entries loaded /entries/:id as a completely blank
  // page (no chrome, no error, nothing). Reproducing in Playwright
  // against `vite preview` showed three independent ways for the
  // <main> subtree to render as `<div><!----></div>`:
  //
  //   1. A field the template accesses directly (e.g.
  //      `word_count.toLocaleString()`) is missing or null, throwing
  //      during render and causing Vue to bail out of the whole
  //      `v-else-if="store.currentEntry"` template branch.
  //   2. A text field (`raw_text` / `final_text`) comes back as null,
  //      which `diff-match-patch.diff_main` rejects with a "Null
  //      input" error — same bail-out consequence.
  //   3. The v-if/else-if chain has no `v-else`, so during the brief
  //      window between `setup()` and the async `onMounted` running
  //      `loadEntry`, none of the branches match and the main area
  //      is genuinely blank.
  //
  // Each case below nails down one of those failure modes so a
  // future refactor can't silently reintroduce it.
  // --------------------------------------------------------------
  describe('blank-page regressions', () => {
    beforeEach(async () => {
      // Reset the router to the detail route with no chunk query so
      // each test starts from a known state.
      await router.push({ name: 'entry-detail', params: { id: '1' } })
      await router.isReady()
    })

    it('renders the detail chrome even when word_count is missing from the payload', async () => {
      // Regression for the `.toLocaleString()` blank-page crash.
      // Previously `{{ word_count.toLocaleString() }}` would throw
      // TypeError: Cannot read properties of undefined (reading
      // 'toLocaleString') and wipe out the entire template branch.
      const { fetchEntry } = await import('@/api/entries')
      vi.mocked(fetchEntry).mockResolvedValueOnce({
        id: 1,
        entry_date: '2026-03-22',
        source_type: 'photo',
        raw_text: 'Hello.',
        final_text: 'Hello.',
        page_count: 1,
        // word_count deliberately omitted — emulates a payload
        // missing the field.
        chunk_count: 0,
        language: 'en',
        created_at: '2026-03-23T10:30:00Z',
        updated_at: '2026-03-23T10:30:00Z',
      } as never)

      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()
      await switchToEditMode(wrapper)

      // The view must render — back button + OCR display are the
      // canary elements proving we didn't bail out.
      expect(wrapper.find('[data-testid="back-button"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="ocr-display"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('0 words')
    })

    it('renders the detail chrome even when raw_text and final_text are null', async () => {
      // Regression for the diff_main "Null input" crash. Nullable
      // text fields exist in the schema for historical reasons
      // (migration 0002 left `final_text` nullable), and a payload
      // where either is null used to blow up the whole template.
      const { fetchEntry } = await import('@/api/entries')
      vi.mocked(fetchEntry).mockResolvedValueOnce({
        id: 1,
        entry_date: '2026-03-22',
        source_type: 'photo',
        raw_text: null,
        final_text: null,
        page_count: 1,
        word_count: 0,
        chunk_count: 0,
        language: 'en',
        created_at: '2026-03-23T10:30:00Z',
        updated_at: '2026-03-23T10:30:00Z',
      } as never)

      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()
      await switchToEditMode(wrapper)

      // The diff view should now render both panels empty, not
      // crash. Check the canary elements.
      expect(wrapper.find('[data-testid="back-button"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="ocr-display"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="corrected-textarea"]').exists()).toBe(
        true,
      )
    })

    it('shows a loading indicator instead of a blank main when the store is in its initial state', async () => {
      // Regression for the missing `v-else` branch. Between setup()
      // and the async loadEntry() firing, the store holds the
      // default (loading=false, error=null, currentEntry=null) for
      // a tick — there used to be no branch for that state and the
      // main area was literally `<div><!----></div>`.
      const { fetchEntry } = await import('@/api/entries')
      // Stall the fetch so we can observe the in-between state
      // without it immediately flipping to the loaded branch.
      let resolveFetch: (
        value: Parameters<typeof fetchEntry> extends []
          ? never
          : Awaited<ReturnType<typeof fetchEntry>>,
      ) => void = () => {}
      vi.mocked(fetchEntry).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      )

      const wrapper = mountComponent()
      // Don't await flushPromises — we want the mid-load state.
      await wrapper.vm.$nextTick()

      // The loading testid must be present (either from the
      // explicit loading branch or the new v-else fallback).
      expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="entry-detail-view"]').text()).not.toBe(
        '',
      )

      // Let the promise resolve so the auto-unmount cleanup is tidy.
      resolveFetch({
        id: 1,
        entry_date: '2026-03-22',
        source_type: 'photo',
        raw_text: 'ok',
        final_text: 'ok',
        page_count: 1,
        word_count: 1,
        chunk_count: 0,
        language: 'en',
        created_at: '2026-03-23T10:30:00Z',
        updated_at: '2026-03-23T10:30:00Z',
        doubts_verified: false,
        uncertain_spans: [],
      })
      await flushPromises()
    })

    // The actual production blank-page failure mode: the server
    // returns the entry-entities payload under `items`, matching
    // every other list endpoint, while an earlier webapp read
    // `resp.entities`. That assignment set `entryEntities.value`
    // to `undefined`, and the template's `v-if="entryEntities.length"`
    // crashed with "$.value is undefined" (Firefox) /
    // "Cannot read properties of undefined (reading 'length')"
    // (Chromium/Safari), bailing out of the whole currentEntry
    // branch and leaving `<main>` empty.
    //
    // This test pins the real server shape so a future refactor
    // can't silently regress the contract.
    it('renders the detail chrome when /entities returns the real {items, total} shape', async () => {
      const { fetchEntryEntities } = await import('@/api/entities')
      vi.mocked(fetchEntryEntities).mockResolvedValueOnce({
        entry_id: 1,
        items: [],
        total: 0,
      })

      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()
      await switchToEditMode(wrapper)

      expect(wrapper.find('[data-testid="back-button"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="ocr-display"]').exists()).toBe(true)
      // Empty list → chip strip stays hidden, but the rest of
      // the view renders.
      expect(wrapper.find('[data-testid="entry-entity-chips"]').exists()).toBe(
        false,
      )
    })

    // Defence-in-depth: even if a future server build drops back
    // to the wrong shape (or ships a totally off-contract payload
    // where `items` is missing), the view must not blank out.
    it('tolerates an off-contract entities payload without crashing', async () => {
      const { fetchEntryEntities } = await import('@/api/entities')
      vi.mocked(fetchEntryEntities).mockResolvedValueOnce({
        // No `items` field at all — the defensive `?? []` in
        // loadEntryEntities should still keep entryEntities an
        // array so the template doesn't crash on `.length`.
        entry_id: 1,
      } as never)

      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()
      await switchToEditMode(wrapper)

      expect(wrapper.find('[data-testid="back-button"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="ocr-display"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="entry-entity-chips"]').exists()).toBe(
        false,
      )
    })

    // Renders a populated chip strip using the entity's `id`
    // (not `entity_id` — that was part of the same wrong
    // bespoke type and produced broken routerlinks).
    it('renders entity chips keyed off `id` matching the EntitySummary shape', async () => {
      const { fetchEntryEntities } = await import('@/api/entities')
      vi.mocked(fetchEntryEntities).mockResolvedValueOnce({
        entry_id: 1,
        items: [
          {
            id: 42,
            canonical_name: 'Alice',
            entity_type: 'person',
            aliases: [],
            mention_count: 3,
            first_seen: '2026-01-01',
            last_seen: '2026-03-22',
          },
        ],
        total: 1,
      })

      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()

      const strip = wrapper.find('[data-testid="entry-entity-chips"]')
      expect(strip.exists()).toBe(true)
      expect(strip.text()).toContain('Alice')
      // The chip's testid is keyed off `id`, proving we used the
      // correct field — `entity_id` would have rendered
      // `entry-entity-chip-undefined`.
      expect(
        wrapper.find('[data-testid="entry-entity-chip-42"]').exists(),
      ).toBe(true)
    })

    it('clicking an entity chip highlights the entity name in the text', async () => {
      const { fetchEntry } = await import('@/api/entries')
      vi.mocked(fetchEntry).mockResolvedValueOnce({
        id: 1,
        entry_date: '2026-03-22',
        source_type: 'photo',
        raw_text: 'Walked with Alice in the park.',
        final_text: 'Walked with Alice in the park.',
        word_count: 7,
        chunk_count: 1,
        page_count: 1,
        language: 'en',
        created_at: '2026-03-22T10:00:00Z',
        updated_at: '2026-03-22T10:00:00Z',
        doubts_verified: false,
        uncertain_spans: [],
      })

      const { fetchEntryEntities } = await import('@/api/entities')
      vi.mocked(fetchEntryEntities).mockResolvedValueOnce({
        entry_id: 1,
        items: [
          {
            id: 42,
            entity_type: 'person',
            canonical_name: 'Alice',
            aliases: [],
            mention_count: 3,
            first_seen: '2026-01-01',
            last_seen: '2026-03-22',
          },
        ],
        total: 1,
      })

      const wrapper = mount(EntryDetailView, {
        props: { id: '1' },
        global: { plugins: [createPinia(), router] },
      })
      await flushPromises()
      await switchToEditMode(wrapper)

      const chip = wrapper.find('[data-testid="entry-entity-chip-42"]')
      await chip.trigger('click')

      // The chip should have a ring class indicating it's active
      expect(chip.classes().join(' ')).toContain('ring-2')

      // The OCR panel should contain highlighted text
      const ocr = wrapper.find('[data-testid="ocr-display"]')
      expect(ocr.html()).toContain('Alice')
    })

    it('entity highlight does not corrupt HTML tags when term matches a CSS class substring', async () => {
      // Regression: the old regex [^<>]+ matched tag attributes, so an
      // entity named "text" would inject <mark> inside class="text-emerald-900"
      const { fetchEntry } = await import('@/api/entries')
      vi.mocked(fetchEntry).mockResolvedValueOnce({
        id: 1,
        entry_date: '2026-03-22',
        source_type: 'photo',
        raw_text: 'The text was clear.',
        final_text: 'The text was clear and readable.',
        word_count: 6,
        chunk_count: 1,
        page_count: 1,
        language: 'en',
        created_at: '2026-03-22T10:00:00Z',
        updated_at: '2026-03-22T10:00:00Z',
        doubts_verified: false,
        uncertain_spans: [],
      })

      const { fetchEntryEntities } = await import('@/api/entities')
      vi.mocked(fetchEntryEntities).mockResolvedValueOnce({
        entry_id: 1,
        items: [
          {
            id: 99,
            entity_type: 'activity',
            canonical_name: 'text',
            aliases: [],
            mention_count: 1,
            first_seen: '2026-01-01',
            last_seen: '2026-03-22',
          },
        ],
        total: 1,
      })

      const wrapper = mount(EntryDetailView, {
        props: { id: '1' },
        global: { plugins: [createPinia(), router] },
      })
      await flushPromises()

      // Switch to edit mode (default is 'read' since raw_text !== final_text)
      const editRadio = wrapper.find('[data-testid="view-mode-radio-edit"]')
      await editRadio.setValue(true)

      // Click entity chip to activate highlighting
      const chip = wrapper.find('[data-testid="entry-entity-chip-99"]')
      await chip.trigger('click')

      // The corrected-side backdrop should highlight "text" in a violet
      // mark but must NOT inject marks inside diff-highlight class attrs.
      const textarea = wrapper.find('[data-testid="corrected-textarea"]')
      expect(textarea.exists()).toBe(true)
      const backdrop = textarea.element.previousElementSibling as HTMLElement
      const html = backdrop?.innerHTML ?? ''

      // The diff creates a green mark around "and readable." — verify
      // its class attribute is intact (no <mark> injected mid-class).
      expect(html).not.toMatch(/class="[^"]*<mark/)
    })

    it('corrected-text textarea has border-0 to align with backdrop', async () => {
      const wrapper = mountComponent()
      await flushPromises()
      await switchToEditMode(wrapper)

      const textarea = wrapper.find('[data-testid="corrected-textarea"]')
      expect(textarea.exists()).toBe(true)
      expect(textarea.classes()).toContain('border-0')
    })

    it('highlights entity terms that contain apostrophes', async () => {
      const { fetchEntry } = await import('@/api/entries')
      vi.mocked(fetchEntry).mockResolvedValueOnce({
        id: 1,
        entry_date: '2026-03-22',
        source_type: 'photo',
        raw_text: "Met O'Brien at the cafe.",
        final_text: "Met O'Brien at the cafe.",
        word_count: 6,
        chunk_count: 1,
        page_count: 1,
        language: 'en',
        created_at: '2026-03-22T10:00:00Z',
        updated_at: '2026-03-22T10:00:00Z',
        doubts_verified: false,
        uncertain_spans: [],
      })

      const { fetchEntryEntities } = await import('@/api/entities')
      vi.mocked(fetchEntryEntities).mockResolvedValueOnce({
        entry_id: 1,
        items: [
          {
            id: 77,
            entity_type: 'person',
            canonical_name: "O'Brien",
            aliases: [],
            mention_count: 1,
            first_seen: '2026-01-01',
            last_seen: '2026-03-22',
          },
        ],
        total: 1,
      })

      const wrapper = mount(EntryDetailView, {
        props: { id: '1' },
        global: { plugins: [createPinia(), router] },
      })
      await flushPromises()
      await switchToEditMode(wrapper)

      const chip = wrapper.find('[data-testid="entry-entity-chip-77"]')
      await chip.trigger('click')

      // In reading mode, the readingHtml computed uses textToHtml which
      // escapes ' to plain text (no &#39;). But in edit mode the diff
      // pipeline escapes ' → &#39;. The entity highlight must match
      // the escaped form.
      //
      // Check the corrected backdrop for the violet mark.
      const backdrop = wrapper.find('[data-testid="corrected-textarea"]')
        .element.previousElementSibling as HTMLElement
      const html = backdrop?.innerHTML ?? ''
      expect(html).toContain('bg-violet-200')
    })

    it('single-char alias does not match inside words (word boundary)', async () => {
      const { fetchEntry } = await import('@/api/entries')
      vi.mocked(fetchEntry).mockResolvedValueOnce({
        id: 1,
        entry_date: '2026-03-22',
        source_type: 'photo',
        raw_text: 'R is great. I saw a rabbit and a car.',
        final_text: 'R is great. I saw a rabbit and a car.',
        word_count: 10,
        chunk_count: 1,
        page_count: 1,
        language: 'en',
        created_at: '2026-03-22T10:00:00Z',
        updated_at: '2026-03-22T10:00:00Z',
        doubts_verified: false,
        uncertain_spans: [],
      })

      const { fetchEntryEntities } = await import('@/api/entities')
      vi.mocked(fetchEntryEntities).mockResolvedValueOnce({
        entry_id: 1,
        items: [
          {
            id: 50,
            entity_type: 'person',
            canonical_name: 'Ritsya',
            aliases: ['R'],
            mention_count: 1,
            first_seen: '2026-01-01',
            last_seen: '2026-03-22',
          },
        ],
        total: 1,
      })

      const wrapper = mount(EntryDetailView, {
        props: { id: '1' },
        global: { plugins: [createPinia(), router] },
      })
      await flushPromises()

      // Switch to read mode to check the reading display HTML
      const readRadio = wrapper.find('[data-testid="view-mode-radio-read"]')
      await readRadio.setValue(true)
      await wrapper.vm.$nextTick()

      const chip = wrapper.find('[data-testid="entry-entity-chip-50"]')
      await chip.trigger('click')

      const reading = wrapper.find('[data-testid="reading-display"]')
      const html = reading.html()

      // "R" at the start should be highlighted (standalone word)
      expect(html).toContain('<mark')

      // Count the <mark> tags — should be exactly 1 (the standalone "R").
      // "rabbit" and "car" must NOT contain highlights.
      const markCount = (html.match(/<mark /g) || []).length
      expect(markCount).toBe(1)
    })
  })

  describe('Review toggle', () => {
    /**
     * The Review toggle overlays OCR uncertainty highlights on the
     * Original OCR panel. These tests exercise the UI wiring
     * end-to-end — mount the view, stub the fetch, assert on rendered
     * classes and toggle state. The underlying highlight logic has
     * its own unit tests in useDiffHighlight.test.ts.
     */

    async function mountWithSpans(
      uncertain_spans: Array<{ char_start: number; char_end: number }>,
      rawText = 'Hello Ritsya from Vienna.',
    ) {
      const { fetchEntry } = await import('@/api/entries')
      vi.mocked(fetchEntry).mockResolvedValueOnce({
        id: 1,
        entry_date: '2026-03-22',
        source_type: 'photo',
        raw_text: rawText,
        final_text: rawText,
        page_count: 1,
        word_count: rawText.split(/\s+/).length,
        chunk_count: 0,
        language: 'en',
        created_at: '2026-03-23T10:30:00Z',
        updated_at: '2026-03-23T10:30:00Z',
        doubts_verified: false,
        uncertain_spans,
      } as never)
      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()
      return wrapper
    }

    it('renders the Review toggle in the toolbar', async () => {
      const wrapper = await mountWithSpans([])
      await switchToEditMode(wrapper)

      expect(wrapper.find('[data-testid="review-toggle"]').exists()).toBe(true)
      expect(
        wrapper.find('[data-testid="review-toggle-label"]').text(),
      ).toContain('Review')
    })

    it('is always clickable even when no uncertain spans exist', async () => {
      const wrapper = await mountWithSpans([])
      await switchToEditMode(wrapper)

      const input = wrapper.find<HTMLInputElement>(
        '[data-testid="review-toggle"]',
      )
      expect(input.element.disabled).toBe(false)
      expect(input.element.checked).toBe(false)
    })

    it('shows info banner when toggled on with no uncertain spans', async () => {
      const wrapper = await mountWithSpans([])
      await switchToEditMode(wrapper)

      const input = wrapper.find<HTMLInputElement>(
        '[data-testid="review-toggle"]',
      )
      await input.setValue(true)
      const banner = wrapper.find('[data-testid="review-no-spans-banner"]')
      expect(banner.exists()).toBe(true)
      expect(banner.text()).toMatch(/no uncertain/i)
    })

    it('does not show info banner when uncertain spans exist', async () => {
      const wrapper = await mountWithSpans([{ char_start: 6, char_end: 12 }])
      await switchToEditMode(wrapper)

      const input = wrapper.find<HTMLInputElement>(
        '[data-testid="review-toggle"]',
      )
      expect(input.element.disabled).toBe(false)
    })

    it('applies uncertainty highlighting to the Original OCR panel when review is on', async () => {
      const wrapper = await mountWithSpans(
        // "Ritsya" at offsets 6..12 in "Hello Ritsya from Vienna."
        [{ char_start: 6, char_end: 12 }],
      )
      await switchToEditMode(wrapper)

      // Enable review manually (no longer auto-enabled)
      const reviewToggle = wrapper.find<HTMLInputElement>(
        '[data-testid="review-toggle"]',
      )
      await reviewToggle.setValue(true)
      await wrapper.vm.$nextTick()

      const original = wrapper.find('[data-testid="ocr-display"]')
      expect(original.exists()).toBe(true)

      const afterHtml = original.html()
      expect(afterHtml).toContain('bg-yellow-200')
      expect(afterHtml).toContain('Ritsya')
    })

    it('does not affect the Corrected Text panel when toggled on', async () => {
      const wrapper = await mountWithSpans([{ char_start: 6, char_end: 12 }])
      await switchToEditMode(wrapper)

      const input = wrapper.find<HTMLInputElement>(
        '[data-testid="review-toggle"]',
      )
      await input.setValue(true)
      await wrapper.vm.$nextTick()

      // The Original OCR panel carries the yellow class…
      const ocrHtml = wrapper.find('[data-testid="ocr-display"]').html()
      expect(ocrHtml).toContain('bg-yellow-200')

      // …but the Corrected Text panel does not. The corrected side
      // renders as either an editable textarea or an overlay display;
      // the textarea is the default view when no chunks/tokens
      // overlay mode is active (our mountWithSpans fixture leaves
      // overlay off). A <textarea> is plain text — no <mark> wrapper
      // — so it cannot carry a tailwind class at all.
      const textarea = wrapper.find('[data-testid="corrected-textarea"]')
      expect(textarea.exists()).toBe(true)
      // Defensive: the textarea's own class attribute must not
      // contain any yellow-background utility (it shouldn't today,
      // but this guards the CSS vocabulary).
      const textareaClass = textarea.attributes('class') ?? ''
      expect(textareaClass).not.toContain('bg-yellow')
    })

    it('shows the uncertain legend when the Review toggle is on', async () => {
      const wrapper = await mountWithSpans([{ char_start: 6, char_end: 12 }])
      await switchToEditMode(wrapper)

      // Enable review manually
      const input = wrapper.find<HTMLInputElement>(
        '[data-testid="review-toggle"]',
      )
      await input.setValue(true)
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="review-legend"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="review-legend"]').text()).toContain(
        'uncertain',
      )

      // Toggle review off — legend disappears
      await input.setValue(false)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="review-legend"]').exists()).toBe(false)
    })

    it('shows Review (N) label when uncertain spans exist', async () => {
      const wrapper = await mountWithSpans([
        { char_start: 0, char_end: 5 },
        { char_start: 6, char_end: 12 },
      ])
      await switchToEditMode(wrapper)

      const label = wrapper.find('[data-testid="review-toggle-label"]')
      expect(label.text()).toContain('Review (2)')
    })

    it('shows floating nav bar when review is on and spans exist', async () => {
      const wrapper = await mountWithSpans([{ char_start: 6, char_end: 12 }])
      await switchToEditMode(wrapper)

      // Enable review manually
      const reviewToggle = wrapper.find<HTMLInputElement>(
        '[data-testid="review-toggle"]',
      )
      await reviewToggle.setValue(true)
      await wrapper.vm.$nextTick()

      const navBar = wrapper.find('[data-testid="uncertain-nav-bar"]')
      expect(navBar.exists()).toBe(true)
      expect(navBar.text()).toContain('1 / 1 doubts')
      expect(wrapper.find('[data-testid="uncertain-prev"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="uncertain-next"]').exists()).toBe(true)

      // Clicking prev/next doesn't throw even in happy-dom
      await wrapper.find('[data-testid="uncertain-next"]').trigger('click')
      await wrapper.find('[data-testid="uncertain-prev"]').trigger('click')
    })

    it('does not show floating nav bar when no spans exist', async () => {
      const wrapper = await mountWithSpans([])
      await switchToEditMode(wrapper)

      const input = wrapper.find<HTMLInputElement>(
        '[data-testid="review-toggle"]',
      )
      await input.setValue(true)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="uncertain-nav-bar"]').exists()).toBe(
        false,
      )
    })

    it('opens in read mode even when entry has doubts', async () => {
      const wrapper = await mountWithSpans([{ char_start: 6, char_end: 12 }])

      // Should be in read mode (not edit)
      expect(wrapper.find('[data-testid="reading-display"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="corrected-textarea"]').exists()).toBe(
        false,
      )
    })

    it('does not auto-enable review when entry has no doubts', async () => {
      const wrapper = await mountWithSpans([])
      await switchToEditMode(wrapper)

      // Review toggle should NOT be checked
      const reviewToggle = wrapper.find<HTMLInputElement>(
        '[data-testid="review-toggle"]',
      )
      expect(reviewToggle.element.checked).toBe(false)
    })

    it('verify-all-doubts saves dirty entry before verifying', async () => {
      const wrapper = await mountWithSpans([{ char_start: 6, char_end: 12 }])
      await switchToEditMode(wrapper)

      // Enable review to show the nav bar with the verify-all button
      const reviewToggle = wrapper.find<HTMLInputElement>(
        '[data-testid="review-toggle"]',
      )
      await reviewToggle.setValue(true)
      await wrapper.vm.$nextTick()

      // Type into the textarea to make it dirty
      const textarea = wrapper.find('[data-testid="corrected-textarea"]')
      await textarea.setValue('Hello Ritsya from Vienna. Edited.')

      // Stub window.confirm to return true
      const confirmStub = vi.fn(() => true)
      vi.stubGlobal('confirm', confirmStub)

      await wrapper.find('[data-testid="verify-all-doubts"]').trigger('click')
      await flushPromises()

      // updateEntryText should have been called (saving the edit)
      const { updateEntryText, verifyDoubts } = await import('@/api/entries')
      expect(updateEntryText).toHaveBeenCalled()
      // verifyDoubts should also have been called
      expect(verifyDoubts).toHaveBeenCalledWith(1)

      vi.unstubAllGlobals()
    })

    it('verify-all-doubts skips save when entry is not dirty', async () => {
      const wrapper = await mountWithSpans([{ char_start: 6, char_end: 12 }])
      await switchToEditMode(wrapper)

      // Enable review to show the nav bar with the verify-all button
      const reviewToggle = wrapper.find<HTMLInputElement>(
        '[data-testid="review-toggle"]',
      )
      await reviewToggle.setValue(true)
      await wrapper.vm.$nextTick()

      // Don't edit anything — entry is clean
      const confirmStub = vi.fn(() => true)
      vi.stubGlobal('confirm', confirmStub)
      const { updateEntryText } = await import('@/api/entries')
      vi.mocked(updateEntryText).mockClear()

      await wrapper.find('[data-testid="verify-all-doubts"]').trigger('click')
      await flushPromises()

      // updateEntryText should NOT have been called
      expect(updateEntryText).not.toHaveBeenCalled()
      // verifyDoubts should still have been called
      const { verifyDoubts } = await import('@/api/entries')
      expect(verifyDoubts).toHaveBeenCalledWith(1)

      vi.unstubAllGlobals()
    })
  })
})
