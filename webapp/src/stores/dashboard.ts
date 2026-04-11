import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiRequestError } from '@/api/client'
import { fetchWritingStats } from '@/api/dashboard'
import type {
  DashboardBin,
  DashboardRange,
  WritingFrequencyBin,
} from '@/types/dashboard'

/**
 * Convert a `DashboardRange` into a concrete `{from, to}` pair
 * against a given "now". `to` is always the current date (so
 * the last-N-months ranges include today); `from` is computed
 * by subtracting months from `to`. `all` returns `null` on both
 * ends so the server returns every bucket.
 *
 * Kept as a pure function so the store tests can drive "now"
 * deterministically via a fixed Date input.
 */
export function rangeToDates(
  range: DashboardRange,
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  if (range === 'all') {
    return { from: null, to: null }
  }
  const to = now.toISOString().slice(0, 10)
  const from = new Date(now)
  switch (range) {
    case 'last_1_month':
      from.setMonth(from.getMonth() - 1)
      break
    case 'last_3_months':
      from.setMonth(from.getMonth() - 3)
      break
    case 'last_6_months':
      from.setMonth(from.getMonth() - 6)
      break
    case 'last_1_year':
      from.setFullYear(from.getFullYear() - 1)
      break
  }
  return { from: from.toISOString().slice(0, 10), to }
}

/**
 * Dashboard store. Holds the current filter state (range + bin)
 * and the most recently fetched series. Changing either filter
 * is a setter-then-refetch pattern the view drives directly —
 * there is no reactive watcher inside the store so changing
 * multiple filters in the same tick doesn't fire multiple
 * in-flight requests.
 *
 * `loadWritingStats` is safe to call with zero args (refetches
 * using the current filter state) or with partial overrides
 * (merges into state and refetches). The store surfaces
 * `ApiRequestError.message` directly so the server's
 * `invalid_bin` / 400 message is visible.
 */
export const useDashboardStore = defineStore('dashboard', () => {
  const range = ref<DashboardRange>('last_3_months')
  const bin = ref<DashboardBin>('week')
  const bins = ref<WritingFrequencyBin[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  // True once the store has successfully loaded at least once.
  // Lets the view distinguish "still loading on first mount"
  // from "loaded but the corpus is empty".
  const hasLoaded = ref(false)

  const totalEntriesInRange = computed(() =>
    bins.value.reduce((sum, b) => sum + b.entry_count, 0),
  )

  async function loadWritingStats(
    overrides: { range?: DashboardRange; bin?: DashboardBin } = {},
  ): Promise<void> {
    if (overrides.range !== undefined) range.value = overrides.range
    if (overrides.bin !== undefined) bin.value = overrides.bin

    loading.value = true
    error.value = null
    try {
      const { from, to } = rangeToDates(range.value)
      const response = await fetchWritingStats({
        bin: bin.value,
        from: from ?? undefined,
        to: to ?? undefined,
      })
      bins.value = response.bins
      hasLoaded.value = true
    } catch (e) {
      if (e instanceof ApiRequestError) {
        error.value = e.message
      } else if (e instanceof Error) {
        error.value = e.message
      } else {
        error.value = 'Failed to load dashboard data'
      }
      bins.value = []
    } finally {
      loading.value = false
    }
  }

  function reset(): void {
    range.value = 'last_3_months'
    bin.value = 'week'
    bins.value = []
    loading.value = false
    error.value = null
    hasLoaded.value = false
  }

  return {
    range,
    bin,
    bins,
    loading,
    error,
    hasLoaded,
    totalEntriesInRange,
    loadWritingStats,
    reset,
  }
})
