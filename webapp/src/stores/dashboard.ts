import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiRequestError } from '@/api/client'
import {
  fetchCalendarHeatmap,
  fetchEntityTrends,
  fetchMoodDimensions,
  fetchMoodEntityCorrelation,
  fetchMoodTrends,
  fetchWordCountDistribution,
  fetchWritingStats,
} from '@/api/dashboard'
import { fetchEntityDistribution, fetchMoodDrilldown } from '@/api/insights'
import type {
  CalendarDay,
  DashboardBin,
  DashboardRange,
  EntityTrendBin,
  MoodDimension,
  MoodEntityCorrelationItem,
  MoodTrendBin,
  WordCountBucket,
  WordCountStats,
  WritingFrequencyBin,
} from '@/types/dashboard'
import type {
  EntityDistributionItem,
  InsightsEntityType,
  MoodDrilldownEntry,
} from '@/types/insights'

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
  const range = ref<DashboardRange>('all')
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
  // persisted across sessions — defaults to isolating agency.
  const hiddenMoodDimensions = ref<Set<string>>(new Set())
  const DEFAULT_ISOLATED_MOOD = 'agency'
  let moodDefaultsApplied = false
  const moodLoading = ref(false)
  const moodError = ref<string | null>(null)
  // True once at least one mood load has completed, regardless
  // of result. Used to distinguish "still loading" from "loaded
  // but the server has no mood data".
  const moodHasLoaded = ref(false)

  // Drill-down state — same shape as the insights store so the
  // mood chart click handler and drill-down panel can be shared.
  const drillPeriod = ref<string | null>(null)
  const drillDimension = ref<string | null>(null)
  const drillEntries = ref<MoodDrilldownEntry[]>([])
  const drillLoading = ref(false)
  const drillError = ref<string | null>(null)

  // Entity distribution state — powers the "what I write about"
  // doughnut chart. `entityType` selects which entity category
  // to display (topic, person, place, etc.).
  const entityType = ref<InsightsEntityType>('topic')
  const entityDistribution = ref<EntityDistributionItem[]>([])
  const entityLoading = ref(false)
  const entityError = ref<string | null>(null)
  const entityHasLoaded = ref(false)

  // Calendar heatmap state
  const calendarDays = ref<CalendarDay[]>([])
  const calendarLoading = ref(false)
  const calendarError = ref<string | null>(null)
  const calendarHasLoaded = ref(false)

  // Entity trends state — topic/entity mention counts over time
  const entityTrends = ref<EntityTrendBin[]>([])
  const entityTrendEntities = ref<string[]>([])
  const entityTrendsType = ref<InsightsEntityType>('topic')
  const entityTrendsLoading = ref(false)
  const entityTrendsError = ref<string | null>(null)
  const entityTrendsHasLoaded = ref(false)

  // Mood-entity correlation state
  const moodCorrelationItems = ref<MoodEntityCorrelationItem[]>([])
  const moodCorrelationOverallAvg = ref(0)
  const moodCorrelationDimension = ref<string>('agency')
  const moodCorrelationType = ref<InsightsEntityType>('person')
  const moodCorrelationLoading = ref(false)
  const moodCorrelationError = ref<string | null>(null)
  const moodCorrelationHasLoaded = ref(false)

  // Word count distribution state
  const wordCountBuckets = ref<WordCountBucket[]>([])
  const wordCountStats = ref<WordCountStats | null>(null)
  const wordCountLoading = ref(false)
  const wordCountError = ref<string | null>(null)
  const wordCountHasLoaded = ref(false)

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
            .filter((n) => n !== DEFAULT_ISOLATED_MOOD),
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

  function periodEndDate(periodStart: string, binSize: DashboardBin): string {
    const d = new Date(periodStart + 'T12:00:00')
    switch (binSize) {
      case 'week':
        d.setDate(d.getDate() + 6)
        break
      case 'month':
        d.setMonth(d.getMonth() + 1)
        d.setDate(d.getDate() - 1)
        break
      case 'quarter':
        d.setMonth(d.getMonth() + 3)
        d.setDate(d.getDate() - 1)
        break
      case 'year':
        d.setFullYear(d.getFullYear() + 1)
        d.setDate(d.getDate() - 1)
        break
    }
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  async function loadDrillDown(
    period: string,
    dimension: string,
  ): Promise<void> {
    drillPeriod.value = period
    drillDimension.value = dimension
    drillLoading.value = true
    drillError.value = null
    try {
      const response = await fetchMoodDrilldown({
        dimension,
        from: period,
        to: periodEndDate(period, bin.value),
      })
      drillEntries.value = response.entries
    } catch (e) {
      if (e instanceof ApiRequestError) {
        drillError.value = e.message
      } else if (e instanceof Error) {
        drillError.value = e.message
      } else {
        drillError.value = 'Failed to load drill-down data'
      }
      drillEntries.value = []
    } finally {
      drillLoading.value = false
    }
  }

  function clearDrillDown(): void {
    drillPeriod.value = null
    drillDimension.value = null
    drillEntries.value = []
    drillError.value = null
  }

  async function loadCalendarHeatmap(): Promise<void> {
    calendarLoading.value = true
    calendarError.value = null
    try {
      const { from, to } = rangeToDates(range.value)
      const response = await fetchCalendarHeatmap({
        from: from ?? undefined,
        to: to ?? undefined,
      })
      calendarDays.value = response.days
      calendarHasLoaded.value = true
    } catch (e) {
      if (e instanceof ApiRequestError) {
        calendarError.value = e.message
      } else if (e instanceof Error) {
        calendarError.value = e.message
      } else {
        calendarError.value = 'Failed to load calendar heatmap'
      }
      calendarDays.value = []
    } finally {
      calendarLoading.value = false
    }
  }

  async function loadEntityTrends(
    entityType?: InsightsEntityType,
  ): Promise<void> {
    if (entityType !== undefined) entityTrendsType.value = entityType

    entityTrendsLoading.value = true
    entityTrendsError.value = null
    try {
      const { from, to } = rangeToDates(range.value)
      const response = await fetchEntityTrends({
        bin: bin.value,
        from: from ?? undefined,
        to: to ?? undefined,
        type: entityTrendsType.value,
        limit: 8,
      })
      entityTrends.value = response.bins
      entityTrendEntities.value = response.entities
      entityTrendsHasLoaded.value = true
    } catch (e) {
      if (e instanceof ApiRequestError) {
        entityTrendsError.value = e.message
      } else if (e instanceof Error) {
        entityTrendsError.value = e.message
      } else {
        entityTrendsError.value = 'Failed to load entity trends'
      }
      entityTrends.value = []
      entityTrendEntities.value = []
    } finally {
      entityTrendsLoading.value = false
    }
  }

  async function loadMoodEntityCorrelation(
    dimension?: string,
    type?: InsightsEntityType,
  ): Promise<void> {
    if (dimension !== undefined) moodCorrelationDimension.value = dimension
    if (type !== undefined) moodCorrelationType.value = type

    moodCorrelationLoading.value = true
    moodCorrelationError.value = null
    try {
      const { from, to } = rangeToDates(range.value)
      const response = await fetchMoodEntityCorrelation({
        dimension: moodCorrelationDimension.value,
        from: from ?? undefined,
        to: to ?? undefined,
        type: moodCorrelationType.value,
        limit: 10,
      })
      moodCorrelationItems.value = response.items
      moodCorrelationOverallAvg.value = response.overall_avg
      moodCorrelationHasLoaded.value = true
    } catch (e) {
      if (e instanceof ApiRequestError) {
        moodCorrelationError.value = e.message
      } else if (e instanceof Error) {
        moodCorrelationError.value = e.message
      } else {
        moodCorrelationError.value = 'Failed to load mood-entity correlation'
      }
      moodCorrelationItems.value = []
      moodCorrelationOverallAvg.value = 0
    } finally {
      moodCorrelationLoading.value = false
    }
  }

  async function loadWordCountDistribution(): Promise<void> {
    wordCountLoading.value = true
    wordCountError.value = null
    try {
      const { from, to } = rangeToDates(range.value)
      const response = await fetchWordCountDistribution({
        from: from ?? undefined,
        to: to ?? undefined,
        bucket_size: 100,
      })
      wordCountBuckets.value = response.buckets
      wordCountStats.value = response.stats
      wordCountHasLoaded.value = true
    } catch (e) {
      if (e instanceof ApiRequestError) {
        wordCountError.value = e.message
      } else if (e instanceof Error) {
        wordCountError.value = e.message
      } else {
        wordCountError.value = 'Failed to load word count distribution'
      }
      wordCountBuckets.value = []
      wordCountStats.value = null
    } finally {
      wordCountLoading.value = false
    }
  }

  async function loadEntityDistribution(
    type?: InsightsEntityType,
  ): Promise<void> {
    if (type !== undefined) entityType.value = type

    entityLoading.value = true
    entityError.value = null
    try {
      const { from, to } = rangeToDates(range.value)
      const response = await fetchEntityDistribution({
        type: entityType.value,
        from: from ?? undefined,
        to: to ?? undefined,
        limit: 30,
      })
      entityDistribution.value = response.items
      entityHasLoaded.value = true
    } catch (e) {
      if (e instanceof ApiRequestError) {
        entityError.value = e.message
      } else if (e instanceof Error) {
        entityError.value = e.message
      } else {
        entityError.value = 'Failed to load entity distribution'
      }
      entityDistribution.value = []
    } finally {
      entityLoading.value = false
    }
  }

  function reset(): void {
    range.value = 'all'
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
    drillPeriod.value = null
    drillDimension.value = null
    drillEntries.value = []
    drillLoading.value = false
    drillError.value = null
    entityType.value = 'topic'
    entityDistribution.value = []
    entityLoading.value = false
    entityError.value = null
    entityHasLoaded.value = false
    calendarDays.value = []
    calendarLoading.value = false
    calendarError.value = null
    calendarHasLoaded.value = false
    entityTrends.value = []
    entityTrendEntities.value = []
    entityTrendsType.value = 'topic'
    entityTrendsLoading.value = false
    entityTrendsError.value = null
    entityTrendsHasLoaded.value = false
    moodCorrelationItems.value = []
    moodCorrelationOverallAvg.value = 0
    moodCorrelationDimension.value = 'agency'
    moodCorrelationType.value = 'person'
    moodCorrelationLoading.value = false
    moodCorrelationError.value = null
    moodCorrelationHasLoaded.value = false
    wordCountBuckets.value = []
    wordCountStats.value = null
    wordCountLoading.value = false
    wordCountError.value = null
    wordCountHasLoaded.value = false
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
    drillPeriod,
    drillDimension,
    drillEntries,
    drillLoading,
    drillError,
    loadDrillDown,
    clearDrillDown,
    // Entity distribution surface
    entityType,
    entityDistribution,
    entityLoading,
    entityError,
    entityHasLoaded,
    loadEntityDistribution,
    // Calendar heatmap surface
    calendarDays,
    calendarLoading,
    calendarError,
    calendarHasLoaded,
    loadCalendarHeatmap,
    // Entity trends surface
    entityTrends,
    entityTrendEntities,
    entityTrendsType,
    entityTrendsLoading,
    entityTrendsError,
    entityTrendsHasLoaded,
    loadEntityTrends,
    // Mood-entity correlation surface
    moodCorrelationItems,
    moodCorrelationOverallAvg,
    moodCorrelationDimension,
    moodCorrelationType,
    moodCorrelationLoading,
    moodCorrelationError,
    moodCorrelationHasLoaded,
    loadMoodEntityCorrelation,
    // Word count distribution surface
    wordCountBuckets,
    wordCountStats,
    wordCountLoading,
    wordCountError,
    wordCountHasLoaded,
    loadWordCountDistribution,
    reset,
  }
})
