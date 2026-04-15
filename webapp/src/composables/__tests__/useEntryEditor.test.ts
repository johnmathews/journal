import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { useEntryEditor } from '../useEntryEditor'
import type { EntryDetail } from '@/types/entry'

function makeEntry(overrides: Partial<EntryDetail> = {}): EntryDetail {
  return {
    id: 1,
    entry_date: '2026-03-22',
    source_type: 'photo',
    raw_text: 'original ocr text',
    final_text: 'original ocr text',
    page_count: 1,
    word_count: 3,
    chunk_count: 1,
    language: 'en',
    created_at: '',
    updated_at: '',
    doubts_verified: false,
    uncertain_spans: [],
    ...overrides,
  }
}

describe('useEntryEditor', () => {
  it('initializes editedText from entry final_text', () => {
    const entry = ref(makeEntry({ final_text: 'hello world' }))
    const { editedText } = useEntryEditor(() => entry.value)
    expect(editedText.value).toBe('hello world')
  })

  it('isDirty is false when text matches', () => {
    const entry = ref(makeEntry({ final_text: 'hello' }))
    const { isDirty } = useEntryEditor(() => entry.value)
    expect(isDirty.value).toBe(false)
  })

  it('isDirty is true when text is changed', () => {
    const entry = ref(makeEntry({ final_text: 'hello' }))
    const { editedText, isDirty } = useEntryEditor(() => entry.value)
    editedText.value = 'hello changed'
    expect(isDirty.value).toBe(true)
  })

  it('isModified detects when raw_text differs from final_text', () => {
    const entry = ref(
      makeEntry({ raw_text: 'original', final_text: 'corrected' }),
    )
    const { isModified } = useEntryEditor(() => entry.value)
    expect(isModified.value).toBe(true)
  })

  it('isModified is false when raw_text equals final_text', () => {
    const entry = ref(makeEntry({ raw_text: 'same', final_text: 'same' }))
    const { isModified } = useEntryEditor(() => entry.value)
    expect(isModified.value).toBe(false)
  })

  it('reset restores editedText to entry final_text', () => {
    const entry = ref(makeEntry({ final_text: 'hello' }))
    const { editedText, reset } = useEntryEditor(() => entry.value)
    editedText.value = 'changed'
    reset()
    expect(editedText.value).toBe('hello')
  })

  it('syncs when entry changes', async () => {
    const entry = ref(makeEntry({ final_text: 'first' }))
    const { editedText } = useEntryEditor(() => entry.value)
    expect(editedText.value).toBe('first')

    entry.value = makeEntry({ final_text: 'second' })
    await nextTick()
    expect(editedText.value).toBe('second')
  })

  it('handles null entry', () => {
    const { editedText, isDirty, isModified } = useEntryEditor(() => null)
    expect(editedText.value).toBe('')
    expect(isDirty.value).toBe(false)
    expect(isModified.value).toBe(false)
  })

  it('reset is a no-op on editedText when entry is null, but clears saveError', () => {
    const { editedText, saveError, reset } = useEntryEditor(() => null)
    editedText.value = 'stale'
    saveError.value = 'earlier error'

    reset()

    // editedText was not touched (the entry is null)
    expect(editedText.value).toBe('stale')
    // saveError is always cleared
    expect(saveError.value).toBeNull()
  })

  it('reset clears saveError even when the entry is present', () => {
    const entry = ref(makeEntry({ final_text: 'hello' }))
    const { editedText, saveError, reset } = useEntryEditor(() => entry.value)
    editedText.value = 'dirty'
    saveError.value = 'save failed'

    reset()

    expect(editedText.value).toBe('hello')
    expect(saveError.value).toBeNull()
  })
})
