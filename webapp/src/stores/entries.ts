import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { EntrySummary, EntryDetail, EntryListParams } from '@/types/entry'
import {
  fetchEntries,
  fetchEntry,
  updateEntryText,
  deleteEntry as deleteEntryApi,
  ingestText,
  ingestFile,
  ingestImages,
} from '@/api/entries'
import type { IngestTextResponse, IngestImagesResponse } from '@/types/ingest'

export const useEntriesStore = defineStore('entries', () => {
  // State
  const entries = ref<EntrySummary[]>([])
  const currentEntry = ref<EntryDetail | null>(null)
  const total = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const creating = ref(false)
  const createError = ref<string | null>(null)
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

  async function deleteEntry(id: number) {
    loading.value = true
    error.value = null
    try {
      await deleteEntryApi(id)
      entries.value = entries.value.filter((entry) => entry.id !== id)
      total.value = Math.max(0, total.value - 1)
      if (currentEntry.value?.id === id) {
        currentEntry.value = null
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete entry'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createTextEntry(
    text: string,
    entryDate?: string,
  ): Promise<IngestTextResponse> {
    creating.value = true
    createError.value = null
    try {
      const result = await ingestText({ text, entry_date: entryDate })
      return result
    } catch (err: unknown) {
      createError.value =
        err instanceof Error ? err.message : 'Failed to create entry'
      throw err
    } finally {
      creating.value = false
    }
  }

  async function importFile(
    file: File,
    entryDate?: string,
  ): Promise<IngestTextResponse> {
    creating.value = true
    createError.value = null
    try {
      const result = await ingestFile(file, entryDate)
      return result
    } catch (err: unknown) {
      createError.value =
        err instanceof Error ? err.message : 'Failed to import file'
      throw err
    } finally {
      creating.value = false
    }
  }

  async function uploadImages(
    files: File[],
    entryDate?: string,
  ): Promise<IngestImagesResponse> {
    creating.value = true
    createError.value = null
    try {
      const result = await ingestImages(files, entryDate)
      return result
    } catch (err: unknown) {
      createError.value =
        err instanceof Error ? err.message : 'Failed to upload images'
      throw err
    } finally {
      creating.value = false
    }
  }

  return {
    entries,
    currentEntry,
    total,
    loading,
    error,
    creating,
    createError,
    currentParams,
    totalPages,
    currentPage,
    hasEntries,
    loadEntries,
    loadEntry,
    saveEntryText,
    deleteEntry,
    createTextEntry,
    importFile,
    uploadImages,
  }
})
