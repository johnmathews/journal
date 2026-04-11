import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { ApiRequestError } from '@/api/client'
import { searchEntries } from '@/api/search'
import type {
  SearchMode,
  SearchRequestParams,
  SearchResultItem,
} from '@/types/search'

/**
 * Search state store.
 *
 * Keeps the last query, mode, and date range reactive across
 * navigation so the user can click into an entry and come back to
 * the results without losing their place. Results themselves are
 * also cached — a `runSearch()` call with the same params is still
 * a fresh fetch, but the previous result set stays visible while
 * the new one loads.
 */
export const useSearchStore = defineStore('search', () => {
  // Query + filter state. These mirror the REST params but are
  // stored separately so the view can bind form inputs without
  // triggering a fetch on every keystroke — the view calls
  // `runSearch()` when the user submits.
  const query = ref('')
  const mode = ref<SearchMode>('semantic')
  const startDate = ref<string | null>(null)
  const endDate = ref<string | null>(null)

  // Pagination state. `limit` is fixed for now — 20 lines up with
  // the entries list. Server clamps to [1, 50].
  const limit = ref(20)
  const offset = ref(0)

  // Result state.
  const items = ref<SearchResultItem[]>([])
  const lastRunQuery = ref('')
  const lastRunMode = ref<SearchMode>('semantic')
  const loading = ref(false)
  const error = ref<string | null>(null)
  // True once the user has actually run at least one search. Lets
  // the view distinguish "no results" from "user hasn't searched
  // yet" without relying on the items array alone.
  const hasRun = ref(false)

  const hasResults = computed(() => items.value.length > 0)

  /**
   * Fire a search against the current filter state. The optional
   * `partial` argument lets callers override individual fields on
   * one call without mutating the store beforehand — useful for
   * pagination ("just advance the offset") or for running a search
   * straight from a URL query param without two separate writes.
   */
  async function runSearch(
    partial: Partial<{
      q: string
      mode: SearchMode
      start_date: string | null
      end_date: string | null
      limit: number
      offset: number
    }> = {},
  ): Promise<void> {
    if (partial.q !== undefined) query.value = partial.q
    if (partial.mode !== undefined) mode.value = partial.mode
    if (partial.start_date !== undefined) startDate.value = partial.start_date
    if (partial.end_date !== undefined) endDate.value = partial.end_date
    if (partial.limit !== undefined) limit.value = partial.limit
    if (partial.offset !== undefined) offset.value = partial.offset

    const trimmed = query.value.trim()
    if (!trimmed) {
      // Empty query: clear results instead of firing a doomed request.
      items.value = []
      error.value = null
      hasRun.value = false
      return
    }

    loading.value = true
    error.value = null
    try {
      const params: SearchRequestParams = {
        q: trimmed,
        mode: mode.value,
        limit: limit.value,
        offset: offset.value,
      }
      if (startDate.value) params.start_date = startDate.value
      if (endDate.value) params.end_date = endDate.value

      const response = await searchEntries(params)
      items.value = response.items
      lastRunQuery.value = response.query
      lastRunMode.value = response.mode
      hasRun.value = true
    } catch (e) {
      // Prefer the server's error message when it's an
      // ApiRequestError — FTS5 parse errors in particular come back
      // with a clear "invalid_query" message that's worth showing.
      if (e instanceof ApiRequestError) {
        error.value = e.message
      } else if (e instanceof Error) {
        error.value = e.message
      } else {
        error.value = 'Search failed'
      }
      items.value = []
    } finally {
      loading.value = false
    }
  }

  function reset(): void {
    query.value = ''
    mode.value = 'semantic'
    startDate.value = null
    endDate.value = null
    limit.value = 20
    offset.value = 0
    items.value = []
    lastRunQuery.value = ''
    lastRunMode.value = 'semantic'
    loading.value = false
    error.value = null
    hasRun.value = false
  }

  return {
    query,
    mode,
    startDate,
    endDate,
    limit,
    offset,
    items,
    lastRunQuery,
    lastRunMode,
    loading,
    error,
    hasRun,
    hasResults,
    runSearch,
    reset,
  }
})
