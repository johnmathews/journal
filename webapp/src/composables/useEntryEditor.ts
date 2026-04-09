import { ref, computed, watch } from 'vue'
import type { EntryDetail } from '@/types/entry'

export function useEntryEditor(entry: () => EntryDetail | null) {
  const editedText = ref('')
  const saving = ref(false)
  const saveError = ref<string | null>(null)

  // Sync editedText when entry changes
  watch(
    () => entry()?.final_text,
    (newText) => {
      if (newText !== undefined) {
        editedText.value = newText
      }
    },
    { immediate: true },
  )

  const isDirty = computed(() => {
    const current = entry()
    if (!current) return false
    return editedText.value !== current.final_text
  })

  const isModified = computed(() => {
    const current = entry()
    if (!current) return false
    return current.raw_text !== current.final_text
  })

  function reset() {
    const current = entry()
    if (current) {
      editedText.value = current.final_text
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
