import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { EntrySummary, EntryDetail, EntryListParams } from '@/types/entry'
import { fetchEntries, fetchEntry, updateEntryText } from '@/api/entries'

export const useEntriesStore = defineStore('entries', () => {
  // State
  const entries = ref<EntrySummary[]>([])
  const currentEntry = ref<EntryDetail | null>(null)
  const total = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const currentParams = ref<EntryListParams>({
    limit: 20,
    offset: 0,
  })

  // Getters
  const totalPages = computed(() =>
    Math.ceil(total.value / (currentParams.value.limit || 20)),
  )
  const currentPage = computed(
    () =>
      Math.floor(
        (currentParams.value.offset || 0) / (currentParams.value.limit || 20),
      ) + 1,
  )
  const hasEntries = computed(() => entries.value.length > 0)

  // Actions
  async function loadEntries(params: EntryListParams = {}) {
    loading.value = true
    error.value = null
    try {
      const merged = { ...currentParams.value, ...params }
      currentParams.value = merged
      const response = await fetchEntries(merged)
      entries.value = response.items
      total.value = response.total
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load entries'
    } finally {
      loading.value = false
    }
  }

  async function loadEntry(id: number) {
    loading.value = true
    error.value = null
    try {
      currentEntry.value = await fetchEntry(id)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load entry'
    } finally {
      loading.value = false
    }
  }

  async function saveEntryText(id: number, finalText: string) {
    loading.value = true
    error.value = null
    try {
      currentEntry.value = await updateEntryText(id, finalText)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to save entry'
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    entries,
    currentEntry,
    total,
    loading,
    error,
    currentParams,
    totalPages,
    currentPage,
    hasEntries,
    loadEntries,
    loadEntry,
    saveEntryText,
  }
})
