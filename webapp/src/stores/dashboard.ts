import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiRequestError } from '@/api/client'
import {
  fetchMoodDimensions,
  fetchMoodTrends,
  fetchWritingStats,
} from '@/api/dashboard'
import type {
  DashboardBin,
  DashboardRange,
  MoodDimension,
  MoodTrendBin,
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

  // Mood chart state — independent of writing stats. The view
  // fires `loadMoodData` alongside `loadWritingStats` when they
  // share a filter change (the same range + bin controls both
  // series). `moodDimensions` is loaded lazily on first view
  // mount and cached for the session; `moodBins` is refreshed
  // on every range/bin change.
  const moodDimensions = ref<MoodDimension[]>([])
  const moodBins = ref<MoodTrendBin[]>([])
  // Dimensions the user has toggled OFF in the chart UI. Stored
  // as a Set<string> so flipping a toggle is O(1). Not
  // persisted across sessions — defaults to showing only
  // joy_sadness, agency, and proactive_reactive.
  const hiddenMoodDimensions = ref<Set<string>>(new Set())
  const DEFAULT_VISIBLE_MOODS = new Set([
    'joy_sadness',
    'agency',
    'proactive_reactive',
  ])
  let moodDefaultsApplied = false
  const moodLoading = ref(false)
  const moodError = ref<string | null>(null)
  // True once at least one mood load has completed, regardless
  // of result. Used to distinguish "still loading" from "loaded
  // but the server has no mood data".
  const moodHasLoaded = ref(false)

  const totalEntriesInRange = computed(() =>
    bins.value.reduce((sum, b) => sum + b.entry_count, 0),
  )

  const hasMoodData = computed(() => moodBins.value.length > 0)
  const moodScoringEnabled = computed(() => moodDimensions.value.length > 0)

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

  /**
   * Fetch the currently-loaded mood dimensions from the server.
   * Idempotent and cheap — the server returns a fixed TOML
   * config. Called once on view mount, cached for the session.
   * Safe to call again after a config edit + server restart;
   * the new set replaces the old one.
   */
  async function loadMoodDimensions(): Promise<void> {
    try {
      const response = await fetchMoodDimensions()
      moodDimensions.value = response.dimensions
      if (!moodDefaultsApplied && response.dimensions.length > 0) {
        hiddenMoodDimensions.value = new Set(
          response.dimensions
            .map((d) => d.name)
            .filter((n) => !DEFAULT_VISIBLE_MOODS.has(n)),
        )
        moodDefaultsApplied = true
      }
    } catch {
      // Swallow — if the dimensions load fails, the view shows
      // the generic "mood scoring not configured" state instead
      // of a loud error. The separate `moodError` below only
      // fires on mood-trends failures so the writing chart is
      // unaffected by mood-pipeline hiccups.
      moodDimensions.value = []
    }
  }

  async function loadMoodTrends(
    overrides: { range?: DashboardRange; bin?: DashboardBin } = {},
  ): Promise<void> {
    if (overrides.range !== undefined) range.value = overrides.range
    if (overrides.bin !== undefined) bin.value = overrides.bin

    moodLoading.value = true
    moodError.value = null
    try {
      const { from, to } = rangeToDates(range.value)
      const response = await fetchMoodTrends({
        bin: bin.value,
        from: from ?? undefined,
        to: to ?? undefined,
      })
      moodBins.value = response.bins
      moodHasLoaded.value = true
    } catch (e) {
      if (e instanceof ApiRequestError) {
        moodError.value = e.message
      } else if (e instanceof Error) {
        moodError.value = e.message
      } else {
        moodError.value = 'Failed to load mood data'
      }
      moodBins.value = []
    } finally {
      moodLoading.value = false
    }
  }

  /**
   * Grafana-style isolate: click a dimension to show ONLY that
   * dimension; click it again (when isolated) to restore all.
   * Clicking a different dimension while one is isolated switches
   * to the new one.
   */
  function toggleMoodDimension(name: string): void {
    const allNames = moodDimensions.value.map((d) => d.name)
    const hidden = hiddenMoodDimensions.value

    // Currently isolated on this exact dimension → restore all
    if (hidden.size === allNames.length - 1 && !hidden.has(name)) {
      hiddenMoodDimensions.value = new Set()
      return
    }

    // Otherwise (all visible, or a different dimension is isolated) → isolate clicked
    hiddenMoodDimensions.value = new Set(allNames.filter((n) => n !== name))
  }

  function reset(): void {
    range.value = 'last_3_months'
    bin.value = 'week'
    bins.value = []
    loading.value = false
    error.value = null
    hasLoaded.value = false
    moodDimensions.value = []
    moodBins.value = []
    hiddenMoodDimensions.value = new Set()
    moodDefaultsApplied = false
    moodLoading.value = false
    moodError.value = null
    moodHasLoaded.value = false
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
    // Mood surface
    moodDimensions,
    moodBins,
    hiddenMoodDimensions,
    moodLoading,
    moodError,
    moodHasLoaded,
    hasMoodData,
    moodScoringEnabled,
    loadMoodDimensions,
    loadMoodTrends,
    toggleMoodDimension,
    reset,
  }
})
