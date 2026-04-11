import { ref, computed, watch } from 'vue'
import type { EntryDetail } from '@/types/entry'

export function useEntryEditor(entry: () => EntryDetail | null) {
  const editedText = ref('')
  const saving = ref(false)
  const saveError = ref<string | null>(null)

  // Sync editedText when entry changes. The backend contract has
  // `final_text: string`, but historically entries written before
  // migration 0002 could round-trip as null for a brief window,
  // and any `null`/`undefined` leaking through would crash the diff
  // composable downstream. Coerce to '' so editedText is always a
  // string, matching the Ref<string> type.
  watch(
    () => entry()?.final_text,
    (newText) => {
      if (newText !== undefined) {
        editedText.value = newText ?? ''
      }
    },
    { immediate: true },
  )

  const isDirty = computed(() => {
    const current = entry()
    if (!current) return false
    return editedText.value !== (current.final_text ?? '')
  })

  const isModified = computed(() => {
    const current = entry()
    if (!current) return false
    return (current.raw_text ?? '') !== (current.final_text ?? '')
  })

  function reset() {
    const current = entry()
    if (current) {
      editedText.value = current.final_text ?? ''
    }
    saveError.value = null
  }

  return {
    editedText,
    saving,
    saveError,
    isDirty,
    isModified,
    reset,
  }
}
