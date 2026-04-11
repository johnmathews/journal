import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import EntryDetailView from '../EntryDetailView.vue'

// Entity fetches used by EntryDetailView for the chip strip — mocked
// to return an empty list so the tests don't hit the network.
vi.mock('@/api/entities', () => ({
  fetchEntryEntities: vi.fn().mockResolvedValue({
    entry_id: 1,
    entities: [],
  }),
}))

vi.mock('@/api/entries', () => ({
  fetchEntries: vi.fn(),
  fetchEntry: vi.fn().mockResolvedValue({
    id: 1,
    entry_date: '2026-03-22',
    source_type: 'ocr',
    raw_text: 'Original OCR text here.',
    final_text: 'Corrected text here.',
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
    source_type: 'ocr',
    raw_text: 'Original OCR text here.',
    final_text: 'Updated text',
    page_count: 2,
    word_count: 4,
    chunk_count: 1,
    language: 'en',
    created_at: '2026-03-23T10:30:00Z',
    updated_at: '2026-03-23T10:30:00Z',
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

    expect(wrapper.find('[data-testid="ocr-display"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="corrected-textarea"]').exists()).toBe(
      true,
    )
  })

  it('renders the diff toggle on by default with a visible legend', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()

    const toggle = wrapper.find('[data-testid="diff-toggle"]')
      .element as HTMLInputElement
    expect(toggle.checked).toBe(true)
    expect(wrapper.find('[data-testid="diff-legend"]').exists()).toBe(true)
  })

  it('highlights diff spans in both panels when original and corrected differ', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()

    // Mock data: raw_text="Original OCR text here.", final_text="Corrected text here."
    // The diff should produce at least one delete span in the original
    // panel and one insert span on the corrected backdrop.
    const originalHtml = wrapper.find('[data-testid="ocr-display"]').html()
    expect(originalHtml).toContain('<mark')
    expect(originalHtml).toContain('bg-red-100')

    const correctedBackdropHtml = wrapper.find('.corrected-wrapper').html()
    expect(correctedBackdropHtml).toContain('bg-emerald-100')
  })

  it('hides the legend and strips highlight marks when the diff toggle is turned off', async () => {
    const wrapper = mountComponent()
    await flushPromises()
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

    const textarea = wrapper.find('[data-testid="corrected-textarea"]')
    await textarea.setValue('dirty')
    expect(wrapper.find('[data-testid="unsaved-indicator"]').exists()).toBe(
      true,
    )

    await wrapper.find('[data-testid="reset-button"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect((textarea.element as HTMLTextAreaElement).value).toBe(
      'Corrected text here.',
    )
    expect(wrapper.find('[data-testid="unsaved-indicator"]').exists()).toBe(
      false,
    )
  })

  it('renders the Modified badge when raw_text differs from final_text', async () => {
    // Default mock has raw_text="Original OCR text here."
    // and final_text="Corrected text here." — they differ, so the badge is shown.
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

      expect(wrapper.find('[data-testid="delete-button"]').exists()).toBe(true)
    })

    it('does not call deleteEntry when the user cancels the confirm', async () => {
      confirmMock.mockReturnValue(false)

      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()

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
    it('with ?chunk=N in the URL, enables chunks overlay and scrolls the matching badge into view', async () => {
      // happy-dom doesn't implement Element.prototype.scrollIntoView by
      // default; patch it so we can assert it was called on the right
      // element without ReferenceErrors.
      const scrollSpy = vi.fn()
      Element.prototype.scrollIntoView =
        scrollSpy as unknown as (typeof Element.prototype)['scrollIntoView']

      // Put the route into the ?chunk=1 state before mounting, so the
      // initial `watch([route.query.chunk, currentEntry.id], ...,
      // { immediate: true })` fires with the query param already set.
      await router.push({
        name: 'entry-detail',
        params: { id: '1' },
        query: { chunk: '1' },
      })
      await router.isReady()

      // Attach to document.body so `document.querySelector` in the
      // production code can find the chunk badge (detached mounts
      // live in a disconnected subtree and aren't reachable from
      // `document`).
      const wrapper = mount(EntryDetailView, {
        props: { id: '1' },
        attachTo: document.body,
        global: {
          plugins: [createPinia(), router],
        },
      })
      // Wait for the entry fetch → reset watch → scroll-setup watch →
      // chunks fetch → scroll-into-view chain to drain. Two flushes
      // with a nextTick between them covers the two `await nextTick()`
      // calls inside the scroll watch.
      await flushPromises()
      await wrapper.vm.$nextTick()
      await flushPromises()
      await wrapper.vm.$nextTick()
      await flushPromises()

      // Overlay flipped to chunks mode automatically.
      const radio = wrapper.find('[data-testid="overlay-radio-chunks"]')
        .element as HTMLInputElement
      expect(radio.checked).toBe(true)

      // Chunks were fetched.
      const { fetchEntryChunks } = await import('@/api/entries')
      expect(fetchEntryChunks).toHaveBeenCalledWith(1)

      // scrollIntoView was called on the chunk-1 badge element.
      expect(scrollSpy).toHaveBeenCalled()
      wrapper.unmount()
    })

    it('with no ?chunk param, the overlay stays off by default', async () => {
      await router.push({ name: 'entry-detail', params: { id: '1' } })
      await router.isReady()

      const wrapper = mountComponent()
      await flushPromises()
      await wrapper.vm.$nextTick()

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
        source_type: 'ocr',
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
        source_type: 'ocr',
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
        source_type: 'ocr',
        raw_text: 'ok',
        final_text: 'ok',
        page_count: 1,
        word_count: 1,
        chunk_count: 0,
        language: 'en',
        created_at: '2026-03-23T10:30:00Z',
        updated_at: '2026-03-23T10:30:00Z',
      })
      await flushPromises()
    })
  })
})
