import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { ApiRequestError } from '@/api/client'
import { searchEntries, answerQuestion } from '@/api/search'
import type {
  AnswerCitation,
  SearchRequestParams,
  SearchResultItem,
  SearchSort,
} from '@/types/search'

/**
 * Search state store.
 *
 * Keeps the last query and date range reactive across navigation so
 * the user can click into an entry and come back to the results
 * without losing their place. Results are also cached — a
 * `runSearch()` call with the same params still issues a fresh
 * fetch, but the previous result set stays visible while the new
 * one loads.
 *
 * The keyword/semantic mode toggle was removed when the server
 * shipped hybrid search. The single search call now always runs
 * BM25 + dense + RRF + rerank server-side.
 */
export const useSearchStore = defineStore('search', () => {
  // Query + filter state. These mirror the REST params but are
  // stored separately so the view can bind form inputs without
  // triggering a fetch on every keystroke — the view calls
  // `runSearch()` when the user submits.
  const query = ref('')
  const startDate = ref<string | null>(null)
  const endDate = ref<string | null>(null)
  const sort = ref<SearchSort>('relevance')

  // Pagination state. `limit` is fixed for now — 20 lines up with
  // the entries list. Server clamps to [1, 50].
  const limit = ref(20)
  const offset = ref(0)

  // Result state.
  const items = ref<SearchResultItem[]>([])
  const lastRunQuery = ref('')
  const loading = ref(false)
  const error = ref<string | null>(null)
  // True once the user has actually run at least one search. Lets
  // the view distinguish "no results" from "user hasn't searched
  // yet" without relying on the items array alone.
  const hasRun = ref(false)

  // Answer-synthesis state.
  const answer = ref('')
  const answered = ref(false)
  const answerCitations = ref<AnswerCitation[]>([])
  const answerLoading = ref(false)
  const answerError = ref<string | null>(null)

  const hasResults = computed(() => items.value.length > 0)

  function clearAnswer(): void {
    answer.value = ''
    answered.value = false
    answerCitations.value = []
    answerError.value = null
  }

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
      start_date: string | null
      end_date: string | null
      limit: number
      offset: number
      sort: SearchSort
    }> = {},
  ): Promise<void> {
    // Drop any prior answer only when the query text itself changes —
    // paging or re-sorting the same query keeps the answer in place.
    if (partial.q !== undefined && partial.q.trim() !== query.value.trim()) {
      clearAnswer()
    }
    if (partial.q !== undefined) query.value = partial.q
    if (partial.start_date !== undefined) startDate.value = partial.start_date
    if (partial.end_date !== undefined) endDate.value = partial.end_date
    if (partial.sort !== undefined) sort.value = partial.sort
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
        limit: limit.value,
        offset: offset.value,
      }
      if (startDate.value) params.start_date = startDate.value
      if (endDate.value) params.end_date = endDate.value
      // Only send `sort` when non-default, so the server's default-
      // relevance behaviour is exercised on plain searches.
      if (sort.value !== 'relevance') params.sort = sort.value

      const response = await searchEntries(params)
      items.value = response.items
      lastRunQuery.value = response.query
      hasRun.value = true
    } catch (e) {
      // Prefer the server's error message when it's a 4xx
      // ApiRequestError — FTS5 parse errors in particular come back
      // with a clear "invalid_query" message that's worth showing.
      // 5xx bodies are server internals (tracebacks, gateway pages),
      // so show a friendly retry message instead.
      if (e instanceof ApiRequestError) {
        error.value =
          e.status >= 500
            ? 'Search is temporarily unavailable — please try again.'
            : e.message
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

  async function runAnswer(): Promise<void> {
    const trimmed = query.value.trim()
    if (!trimmed) return
    answerLoading.value = true
    answerError.value = null
    try {
      const params = { q: trimmed } as {
        q: string
        start_date?: string
        end_date?: string
      }
      if (startDate.value) params.start_date = startDate.value
      if (endDate.value) params.end_date = endDate.value
      const res = await answerQuestion(params)
      answer.value = res.answer
      answered.value = res.answered
      answerCitations.value = res.citations
    } catch {
      answerError.value = 'Answer unavailable — see the results below.'
      answer.value = ''
      answered.value = false
      answerCitations.value = []
    } finally {
      answerLoading.value = false
    }
  }

  function reset(): void {
    query.value = ''
    startDate.value = null
    endDate.value = null
    sort.value = 'relevance'
    limit.value = 20
    offset.value = 0
    items.value = []
    lastRunQuery.value = ''
    loading.value = false
    error.value = null
    hasRun.value = false
    clearAnswer()
    // clearAnswer() intentionally leaves answerLoading alone; a full reset clears it too.
    answerLoading.value = false
  }

  return {
    query,
    startDate,
    endDate,
    sort,
    limit,
    offset,
    items,
    lastRunQuery,
    loading,
    error,
    hasRun,
    hasResults,
    answer,
    answered,
    answerCitations,
    answerLoading,
    answerError,
    runSearch,
    runAnswer,
    reset,
  }
})
