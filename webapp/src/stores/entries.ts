import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { EntrySummary, EntryDetail, EntryListParams } from '@/types/entry'
import {
  fetchEntries,
  fetchEntry,
  updateEntryText,
  updateEntryBoundary,
  updateEntryDate as updateEntryDateApi,
  deleteEntry as deleteEntryApi,
  verifyDoubts as verifyDoubtsApi,
  ingestText,
  ingestFile,
  ingestImages,
  ingestAudio,
} from '@/api/entries'
import type {
  IngestTextResponse,
  IngestImagesResponse,
  IngestAudioResponse,
} from '@/types/ingest'

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
  // Infinite-scroll gate: another page exists while we hold fewer rows
  // than the server-reported total for the current filter set.
  const hasMore = computed(() => entries.value.length < total.value)

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

  // Append-the-next-page path for infinite scroll. Unlike loadEntries
  // (which replaces the array on reset), this pushes the fetched rows
  // onto the existing list, advancing the offset by one page. It reuses
  // currentParams so any active filters are honoured, and bails when a
  // load is already in flight or there is nothing left to fetch —
  // preventing duplicate or racing appends.
  async function loadMoreEntries() {
    if (loading.value || !hasMore.value) return
    loading.value = true
    error.value = null
    try {
      const limit = currentParams.value.limit || 20
      const nextOffset = (currentParams.value.offset || 0) + limit
      const merged = { ...currentParams.value, offset: nextOffset }
      currentParams.value = merged
      const response = await fetchEntries(merged)
      entries.value = [...entries.value, ...response.items]
      total.value = response.total
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Failed to load more entries'
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

  async function saveEntryText(
    id: number,
    finalText: string,
  ): Promise<{
    extractionJobId?: string
    reprocessJobId?: string
    moodJobId?: string
  }> {
    loading.value = true
    error.value = null
    try {
      const resp = await updateEntryText(id, finalText)
      currentEntry.value = resp
      return {
        extractionJobId: resp.entity_extraction_job_id,
        reprocessJobId: resp.reprocess_job_id,
        moodJobId: resp.mood_job_id,
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to save entry'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function saveEntryBoundary(
    id: number,
    start: number | null,
    end: number | null,
  ): Promise<{
    extractionJobId?: string
    reprocessJobId?: string
    moodJobId?: string
  }> {
    loading.value = true
    error.value = null
    try {
      const resp = await updateEntryBoundary(id, start, end)
      currentEntry.value = resp
      return {
        extractionJobId: resp.entity_extraction_job_id,
        reprocessJobId: resp.reprocess_job_id,
        moodJobId: resp.mood_job_id,
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to save boundary'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateDate(id: number, entryDate: string) {
    loading.value = true
    error.value = null
    try {
      currentEntry.value = await updateEntryDateApi(id, entryDate)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to update date'
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

  async function verifyDoubts(id: number) {
    loading.value = true
    error.value = null
    try {
      currentEntry.value = await verifyDoubtsApi(id)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to verify doubts'
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

  async function uploadAudio(
    recordings: Blob[],
    entryDate?: string,
  ): Promise<IngestAudioResponse> {
    creating.value = true
    createError.value = null
    try {
      const result = await ingestAudio(recordings, entryDate)
      return result
    } catch (err: unknown) {
      createError.value =
        err instanceof Error ? err.message : 'Failed to upload recordings'
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
    hasMore,
    loadEntries,
    loadMoreEntries,
    loadEntry,
    saveEntryText,
    saveEntryBoundary,
    updateDate,
    deleteEntry,
    verifyDoubts,
    createTextEntry,
    importFile,
    uploadImages,
    uploadAudio,
  }
})
