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
import { fetchPreferences, updatePreferences } from '@/api/preferences'
import type {
  CalendarDay,
  DashboardBin,
  DashboardLayout,
  DashboardRange,
  DashboardTileId,
  EntityTrendBin,
  MoodDimension,
  MoodEntityCorrelationItem,
  MoodTrendBin,
  TileSpan,
  WordCountBucket,
  WordCountStats,
  WritingFrequencyBin,
} from '@/types/dashboard'
import { DEFAULT_TILE_ORDER, DASHBOARD_TILES } from '@/types/dashboard'
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
  // Dimensions the user has selected for display in the chart.
  // Contract:
  //   empty set       → show all dimensions (default behaviour, matches
  //                     the user-visible "no selection means show all"
  //                     mental model)
  //   non-empty set   → show only the named subset
  // Stored as a Set<string> so per-pill toggles are O(1). Not persisted
  // across sessions — first load isolates `agency` (single-line "what
  // happened to my sense of agency this week?" view); subsequent reloads
  // (e.g. after a config edit) leave the user's selection alone.
  const selectedMoodDimensions = ref<Set<string>>(new Set())
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
  // Entity names hidden in the Topic Trends chart. Multi-select:
  // each chip toggles independently. Pruned to the current entity
  // list on every reload so stale names don't accumulate.
  const hiddenEntityTrends = ref<Set<string>>(new Set())

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
        const hasAgency = response.dimensions.some(
          (d) => d.name === DEFAULT_ISOLATED_MOOD,
        )
        selectedMoodDimensions.value = hasAgency
          ? new Set([DEFAULT_ISOLATED_MOOD])
          : new Set()
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
   * True when `name` should be drawn in the chart. Empty selection is
   * treated as "show all" so the chart never silently hides everything.
   */
  function isMoodDimensionVisible(name: string): boolean {
    return (
      selectedMoodDimensions.value.size === 0 ||
      selectedMoodDimensions.value.has(name)
    )
  }

  /**
   * Plain multi-select toggle: click a chip to flip that one
   * dimension's selection state. Other dimensions are unaffected, so
   * the user can pick any subset. A new Set is assigned each time so
   * Vue reactivity fires.
   */
  function toggleMoodDimension(name: string): void {
    const next = new Set(selectedMoodDimensions.value)
    if (next.has(name)) {
      next.delete(name)
    } else {
      next.add(name)
    }
    selectedMoodDimensions.value = next
  }

  /** Clear the selection — the chart falls back to showing every dimension. */
  function showAllMoodDimensions(): void {
    selectedMoodDimensions.value = new Set()
  }

  /**
   * Tristate: 'all' if every member is in the selection, 'none' if no
   * member is in the selection, 'some' otherwise. Empty input is 'none'.
   */
  function moodGroupSelectionState(
    memberNames: readonly string[],
  ): 'all' | 'some' | 'none' {
    if (memberNames.length === 0) return 'none'
    let selectedCount = 0
    for (const name of memberNames) {
      if (selectedMoodDimensions.value.has(name)) selectedCount += 1
    }
    if (selectedCount === 0) return 'none'
    if (selectedCount === memberNames.length) return 'all'
    return 'some'
  }

  /**
   * Bulk action for a group of dimensions. If any member is currently
   * selected, remove all members from the selection (collapse to clean
   * "none" state). Otherwise add every member. Always lands the group
   * in a uniform state — never partial.
   */
  function toggleMoodGroup(memberNames: readonly string[]): void {
    if (memberNames.length === 0) return
    const next = new Set(selectedMoodDimensions.value)
    const anySelected = memberNames.some((n) => next.has(n))
    if (anySelected) {
      for (const name of memberNames) next.delete(name)
    } else {
      for (const name of memberNames) next.add(name)
    }
    selectedMoodDimensions.value = next
  }

  function toggleEntityTrend(name: string): void {
    const next = new Set(hiddenEntityTrends.value)
    if (next.has(name)) {
      next.delete(name)
    } else {
      next.add(name)
    }
    hiddenEntityTrends.value = next
  }

  function showAllEntityTrends(): void {
    hiddenEntityTrends.value = new Set()
  }

  function hideAllEntityTrends(): void {
    hiddenEntityTrends.value = new Set(entityTrendEntities.value)
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

  async function loadCalendarHeatmap(opts?: {
    from?: string | null
    to?: string | null
  }): Promise<void> {
    calendarLoading.value = true
    calendarError.value = null
    try {
      const response = await fetchCalendarHeatmap({
        from: opts?.from ?? undefined,
        to: opts?.to ?? undefined,
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
      // Prune hidden entries that no longer appear in the new list
      // (e.g. after switching entity type or range).
      const valid = new Set(response.entities)
      const pruned = new Set<string>()
      for (const name of hiddenEntityTrends.value) {
        if (valid.has(name)) pruned.add(name)
      }
      hiddenEntityTrends.value = pruned
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

  // ── Tile layout ────────────────────────────────────────────────
  const tileOrder = ref<DashboardTileId[]>([...DEFAULT_TILE_ORDER])
  const hiddenTiles = ref<DashboardTileId[]>([])
  const tileWidths = ref<Partial<Record<DashboardTileId, TileSpan>>>({})
  const layoutLoaded = ref(false)
  const editingLayout = ref(false)

  /** Tiles in display order, excluding hidden ones. */
  const visibleTiles = computed(() =>
    tileOrder.value.filter((id) => !hiddenTiles.value.includes(id)),
  )

  /** Tile definitions keyed by ID for quick lookup. */
  const tileDefs = computed(() => {
    const map = new Map<DashboardTileId, (typeof DASHBOARD_TILES)[number]>()
    for (const t of DASHBOARD_TILES) map.set(t.id, t)
    return map
  })

  let _saveTimer: ReturnType<typeof setTimeout> | null = null

  function _persistLayout(): void {
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => {
      const layout: DashboardLayout = {
        tileOrder: tileOrder.value,
        hiddenTiles: hiddenTiles.value,
        tileWidths: tileWidths.value,
      }
      updatePreferences({ dashboard_layout: layout }).catch(() => {
        // Silent — layout is still in-memory, will retry on next change.
      })
    }, 500)
  }

  async function loadLayout(): Promise<void> {
    try {
      const { preferences } = await fetchPreferences()
      const layout = preferences.dashboard_layout as DashboardLayout | undefined
      if (layout) {
        // Validate tile IDs — ignore unknown ones, append any missing tiles
        const validIds = new Set<DashboardTileId>(DEFAULT_TILE_ORDER)
        const order = (layout.tileOrder ?? []).filter((id: string) =>
          validIds.has(id as DashboardTileId),
        ) as DashboardTileId[]
        // Append any tiles that exist in defaults but aren't in the saved order
        for (const id of DEFAULT_TILE_ORDER) {
          if (!order.includes(id)) order.push(id)
        }
        tileOrder.value = order
        hiddenTiles.value = (layout.hiddenTiles ?? []).filter((id: string) =>
          validIds.has(id as DashboardTileId),
        ) as DashboardTileId[]
        // Restore tile width overrides, filtering to valid IDs and values
        const savedWidths = layout.tileWidths ?? {}
        const restored: Partial<Record<DashboardTileId, TileSpan>> = {}
        for (const [id, span] of Object.entries(savedWidths)) {
          if (
            validIds.has(id as DashboardTileId) &&
            (span === 1 || span === 2)
          ) {
            restored[id as DashboardTileId] = span
          }
        }
        tileWidths.value = restored
      }
    } catch {
      // Preferences endpoint not available or no saved layout — use defaults.
    } finally {
      layoutLoaded.value = true
    }
  }

  function moveTile(id: DashboardTileId, direction: 'up' | 'down'): void {
    const order = [...tileOrder.value]
    const idx = order.indexOf(id)
    if (idx === -1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= order.length) return
    ;[order[idx], order[targetIdx]] = [order[targetIdx], order[idx]]
    tileOrder.value = order
    _persistLayout()
  }

  function hideTile(id: DashboardTileId): void {
    if (!hiddenTiles.value.includes(id)) {
      hiddenTiles.value = [...hiddenTiles.value, id]
      _persistLayout()
    }
  }

  function showTile(id: DashboardTileId): void {
    hiddenTiles.value = hiddenTiles.value.filter((t) => t !== id)
    _persistLayout()
  }

  function resetLayout(): void {
    tileOrder.value = [...DEFAULT_TILE_ORDER]
    hiddenTiles.value = []
    tileWidths.value = {}
    _persistLayout()
  }

  /** Get the effective span for a tile: user override or definition default. */
  function getTileSpan(id: DashboardTileId): TileSpan {
    const override = tileWidths.value[id]
    if (override !== undefined) return override
    const def = tileDefs.value.get(id)
    return def?.span ?? 2
  }

  /** Set a tile's width override and persist. */
  function setTileWidth(id: DashboardTileId, span: TileSpan): void {
    tileWidths.value = { ...tileWidths.value, [id]: span }
    _persistLayout()
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
    selectedMoodDimensions.value = new Set()
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
    hiddenEntityTrends.value = new Set()
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
    // Layout is NOT reset here — it persists independently.
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
    selectedMoodDimensions,
    moodLoading,
    moodError,
    moodHasLoaded,
    hasMoodData,
    moodScoringEnabled,
    loadMoodDimensions,
    loadMoodTrends,
    isMoodDimensionVisible,
    toggleMoodDimension,
    showAllMoodDimensions,
    moodGroupSelectionState,
    toggleMoodGroup,
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
    hiddenEntityTrends,
    loadEntityTrends,
    toggleEntityTrend,
    showAllEntityTrends,
    hideAllEntityTrends,
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
    // Tile layout surface
    tileOrder,
    hiddenTiles,
    tileWidths,
    layoutLoaded,
    editingLayout,
    visibleTiles,
    tileDefs,
    loadLayout,
    moveTile,
    hideTile,
    showTile,
    resetLayout,
    getTileSpan,
    setTileWidth,
    reset,
  }
})
