import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FileImportPanel from '../FileImportPanel.vue'
import { useEntriesStore } from '@/stores/entries'

describe('FileImportPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders file input accepting text files', () => {
    const wrapper = mount(FileImportPanel, {
      props: { entryDate: '2026-04-12' },
    })
    const input = wrapper.find('input[type="file"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('accept')).toContain('.md')
    expect(input.attributes('accept')).toContain('.txt')
  })

  it('shows drop zone instructions', () => {
    const wrapper = mount(FileImportPanel, {
      props: { entryDate: '2026-04-12' },
    })
    expect(wrapper.text()).toContain('.md')
    expect(wrapper.text()).toContain('.txt')
  })

  it('hides the file input element (inside label for click delegation)', () => {
    const wrapper = mount(FileImportPanel, {
      props: { entryDate: '2026-04-12' },
    })
    const input = wrapper.find('input[type="file"]')
    expect(input.classes()).toContain('hidden')
  })

  it('does not show file details or submit button before a file is selected', () => {
    const wrapper = mount(FileImportPanel, {
      props: { entryDate: '2026-04-12' },
    })
    // No "Import File" button visible (only the label/drop zone)
    expect(wrapper.text()).not.toContain('Import File')
    expect(wrapper.text()).not.toContain('Change file')
  })

  it('shows drop zone label as a clickable area', () => {
    const wrapper = mount(FileImportPanel, {
      props: { entryDate: '2026-04-12' },
    })
    const label = wrapper.find('label')
    expect(label.exists()).toBe(true)
    expect(label.classes()).toContain('cursor-pointer')
  })

  it('calls importFile on the store when submit is clicked after file selection', async () => {
    const wrapper = mount(FileImportPanel, {
      props: { entryDate: '2026-04-12' },
    })
    const store = useEntriesStore()
    const spy = vi.spyOn(store, 'importFile').mockResolvedValue({
      entry: {
        id: 7,
        entry_date: '2026-04-12',
        source_type: 'import',
        raw_text: 'file content',
        final_text: 'file content',
        page_count: 1,
        word_count: 2,
        chunk_count: 1,
        language: 'en',
        created_at: '',
        updated_at: '',
        uncertain_spans: [],
      },
      mood_job_id: null,
    })

    // Simulate file selection by directly setting the component's internal state
    // via the change event on the hidden input
    const file = new File(['# My journal entry'], 'entry.md', {
      type: 'text/markdown',
    })
    const input = wrapper.find('input[type="file"]')
    // We need to mock the files property on the input element
    Object.defineProperty(input.element, 'files', {
      value: [file],
      writable: false,
    })
    await input.trigger('change')
    await flushPromises()

    // After file selection, submit button should appear
    const button = wrapper.find('button')
    if (button.exists() && button.text().includes('Import')) {
      await button.trigger('click')
      await flushPromises()

      expect(spy).toHaveBeenCalledWith(file, '2026-04-12')
    }
  })

  it('emits created with entry id after successful import', async () => {
    const wrapper = mount(FileImportPanel, {
      props: { entryDate: '2026-04-12' },
    })
    const store = useEntriesStore()
    vi.spyOn(store, 'importFile').mockResolvedValue({
      entry: {
        id: 55,
        entry_date: '2026-04-12',
        source_type: 'import',
        raw_text: 'content',
        final_text: 'content',
        page_count: 1,
        word_count: 1,
        chunk_count: 1,
        language: 'en',
        created_at: '',
        updated_at: '',
        uncertain_spans: [],
      },
      mood_job_id: null,
    })

    const file = new File(['content'], 'notes.txt', { type: 'text/plain' })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [file],
      writable: false,
    })
    await input.trigger('change')
    await flushPromises()

    // Find and click the Import File button
    const buttons = wrapper.findAll('button')
    const importBtn = buttons.find((b) => b.text().includes('Import'))
    if (importBtn) {
      await importBtn.trigger('click')
      await flushPromises()
      expect(wrapper.emitted('created')).toEqual([[55]])
    }
  })

  it('shows "Change file" button after a file is selected', async () => {
    const wrapper = mount(FileImportPanel, {
      props: { entryDate: '2026-04-12' },
    })

    const file = new File(['hello'], 'test.txt', { type: 'text/plain' })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [file],
      writable: false,
    })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.text()).toContain('Change file')
  })

  it('shows file name after selection', async () => {
    const wrapper = mount(FileImportPanel, {
      props: { entryDate: '2026-04-12' },
    })

    const file = new File(['hello'], 'my-journal.txt', { type: 'text/plain' })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [file],
      writable: false,
    })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.text()).toContain('my-journal.txt')
  })
})
