import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TextEntryPanel from '../TextEntryPanel.vue'
import { useEntriesStore } from '@/stores/entries'

describe('TextEntryPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders textarea', () => {
    const wrapper = mount(TextEntryPanel, {
      props: { entryDate: '2026-04-12' },
    })
    expect(wrapper.find('textarea').exists()).toBe(true)
  })

  it('shows word count', async () => {
    const wrapper = mount(TextEntryPanel, {
      props: { entryDate: '2026-04-12' },
    })
    await wrapper.find('textarea').setValue('hello world test')
    expect(wrapper.text()).toContain('3 words')
  })

  it('shows singular word for 1 word', async () => {
    const wrapper = mount(TextEntryPanel, {
      props: { entryDate: '2026-04-12' },
    })
    await wrapper.find('textarea').setValue('hello')
    expect(wrapper.text()).toContain('1 word')
  })

  it('shows 0 words when textarea is empty', () => {
    const wrapper = mount(TextEntryPanel, {
      props: { entryDate: '2026-04-12' },
    })
    expect(wrapper.text()).toContain('0 words')
  })

  it('disables button when text is empty', () => {
    const wrapper = mount(TextEntryPanel, {
      props: { entryDate: '2026-04-12' },
    })
    const button = wrapper.find('button')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('disables button when text is only whitespace', async () => {
    const wrapper = mount(TextEntryPanel, {
      props: { entryDate: '2026-04-12' },
    })
    await wrapper.find('textarea').setValue('   ')
    const button = wrapper.find('button')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('enables button when text is entered', async () => {
    const wrapper = mount(TextEntryPanel, {
      props: { entryDate: '2026-04-12' },
    })
    await wrapper.find('textarea').setValue('Hello world')
    const button = wrapper.find('button')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('button text says "Create Entry" by default', () => {
    const wrapper = mount(TextEntryPanel, {
      props: { entryDate: '2026-04-12' },
    })
    expect(wrapper.find('button').text()).toContain('Create Entry')
  })

  it('calls createTextEntry with text and date on submit', async () => {
    const wrapper = mount(TextEntryPanel, {
      props: { entryDate: '2026-04-12' },
    })
    const store = useEntriesStore()
    const spy = vi.spyOn(store, 'createTextEntry').mockResolvedValue({
      entry: {
        id: 42,
        entry_date: '2026-04-12',
        source_type: 'manual',
        raw_text: 'Hello world',
        final_text: 'Hello world',
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

    await wrapper.find('textarea').setValue('Hello world')
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(spy).toHaveBeenCalledWith('Hello world', '2026-04-12')
  })

  it('emits created with entry id after successful submit', async () => {
    const wrapper = mount(TextEntryPanel, {
      props: { entryDate: '2026-04-12' },
    })
    const store = useEntriesStore()
    vi.spyOn(store, 'createTextEntry').mockResolvedValue({
      entry: {
        id: 99,
        entry_date: '2026-04-12',
        source_type: 'manual',
        raw_text: 'test',
        final_text: 'test',
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

    await wrapper.find('textarea').setValue('test')
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('created')).toEqual([[99]])
  })

  it('counts words correctly for multi-space input', async () => {
    const wrapper = mount(TextEntryPanel, {
      props: { entryDate: '2026-04-12' },
    })
    await wrapper.find('textarea').setValue('  hello   world  ')
    expect(wrapper.text()).toContain('2 words')
  })
})
