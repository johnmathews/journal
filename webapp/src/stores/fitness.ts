import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  fetchActivities,
  fetchDaily,
  fetchSyncStatus,
  triggerSync,
  fetchMoodRecovery,
  fetchDivergence,
} from '@/api/fitness'
import { useJobsStore } from '@/stores/jobs'
import { rangeToDates } from '@/stores/dashboard'
import { fetchPreferences, updatePreferences } from '@/api/preferences'
import {
  DEFAULT_FITNESS_TILE_ORDER,
  FITNESS_TILES,
  FITNESS_WIDTH_CYCLE,
  type FitnessActivity,
  type FitnessDaily,
  type FitnessLayout,
  type FitnessSource,
  type FitnessSyncStatus,
  type FitnessTileId,
  type DedupedActivity,
  type MoodRecoveryRow,
  type DivergenceRow,
  type DivergenceSummary,
} from '@/types/fitness'
import type { NamedWidth } from '@/types/tiles'
import type { DashboardRange, DashboardBin } from '@/types/dashboard'

// Cross-source dedup threshold. Two activities collapse into one when
// their UTC time windows overlap by at least this fraction of the
// shorter activity's duration. The premise is physical — a user cannot
// be doing two activities simultaneously — so overlapping windows
// almost always mean the same workout recorded by two apps. The 75%
// floor tolerates the moving-time vs total-time skew (Strava often
// reports moving time, Garmin total time, so the same run can differ
// by a minute or more) without merging genuinely back-to-back
// activities. See docs/fitness-followup-plan.md F2 and decision D1.
export const DEDUP_OVERLAP_THRESHOLD = 0.75

type _DedupGroup = {
  members: FitnessActivity[]
  repStartMs: number
  repEndMs: number
  repDurationMs: number
}

function _toMs(iso: string): number {
  return new Date(iso).getTime()
}

function _pickRepresentative(members: FitnessActivity[]): FitnessActivity {
  // Prefer longer duration; tie-break Strava over Garmin (richer metadata,
  // canonical source_subtype mapping); then ascending source_id for
  // determinism. Sort a copy — never mutate the group's member order.
  return [...members].sort((a, b) => {
    if (a.duration_s !== b.duration_s) return b.duration_s - a.duration_s
    if (a.source !== b.source) return a.source === 'strava' ? -1 : 1
    return a.source_id.localeCompare(b.source_id)
  })[0]
}

/**
 * Group activities into canonical workouts using time-window overlap.
 *
 * The same workout uploaded from Garmin → Strava (or recorded
 * independently by both apps) appears in both raw tables; "weekly run
 * count" doubles without dedup. Two rows collapse into one group when
 * their `[start, start + duration)` intervals overlap by at least
 * `DEDUP_OVERLAP_THRESHOLD` of the shorter duration.
 *
 * Earlier versions of this function compared start-time and duration
 * separately with fixed tolerances; that scheme missed pairs where
 * one source reports moving time and the other total time (a 60s
 * duration gap is normal in that case). Overlap is robust to the
 * moving-vs-total-time skew while still keeping back-to-back activities
 * apart.
 *
 * Activities not paired with anything pass through unchanged.
 *
 * Exported for direct testing; consumers should prefer the
 * `distinctActivities` getter on the store.
 */
export function dedupActivities(rows: FitnessActivity[]): DedupedActivity[] {
  // Sort by start_time so an activity is always compared against groups
  // that began at or before it — keeps the comparison loop short and
  // makes ordering deterministic. Sort a copy; never mutate the caller's
  // array.
  const sorted = [...rows].sort(
    (a, b) => _toMs(a.start_time) - _toMs(b.start_time),
  )

  const groups: _DedupGroup[] = []

  for (const row of sorted) {
    const startMs = _toMs(row.start_time)
    const durationMs = row.duration_s * 1000
    const endMs = startMs + durationMs

    let merged = false
    for (const group of groups) {
      // Cheap reject: disjoint intervals can't overlap.
      if (group.repEndMs <= startMs) continue
      if (endMs <= group.repStartMs) continue

      const overlap =
        Math.min(group.repEndMs, endMs) - Math.max(group.repStartMs, startMs)
      const shorter = Math.min(group.repDurationMs, durationMs)
      // Zero-duration activities can't be compared meaningfully — skip.
      if (shorter <= 0) continue
      if (overlap / shorter < DEDUP_OVERLAP_THRESHOLD) continue

      group.members.push(row)
      const newRep = _pickRepresentative(group.members)
      const newRepStart = _toMs(newRep.start_time)
      group.repStartMs = newRepStart
      group.repDurationMs = newRep.duration_s * 1000
      group.repEndMs = newRepStart + group.repDurationMs
      merged = true
      break
    }

    if (!merged) {
      groups.push({
        members: [row],
        repStartMs: startMs,
        repEndMs: endMs,
        repDurationMs: durationMs,
      })
    }
  }

  const result: DedupedActivity[] = groups.map((g) => {
    const rep = _pickRepresentative(g.members)
    const secondaries = g.members
      .filter((m) => m.id !== rep.id)
      .map((m) => ({ source: m.source, source_id: m.source_id }))
    return { representative: rep, secondary_source_ids: secondaries }
  })

  result.sort(
    (a, b) =>
      _toMs(b.representative.start_time) - _toMs(a.representative.start_time),
  )
  return result
}

export const useFitnessStore = defineStore('fitness', () => {
  // State
  const activities = ref<FitnessActivity[]>([])
  const daily = ref<FitnessDaily[]>([])
  const syncStatus = ref<FitnessSyncStatus>({ strava: null, garmin: null })

  // W6: mood × recovery overlay + fatigue-divergence analysis.
  const moodRecovery = ref<MoodRecoveryRow[]>([])
  const divergence = ref<DivergenceRow[]>([])
  const divergenceSummary = ref<DivergenceSummary | null>(null)

  const loadingActivities = ref(false)
  const loadingDaily = ref(false)
  const loadingStatus = ref(false)
  const loadingMoodRecovery = ref(false)
  const loadingDivergence = ref(false)
  const triggeringSync = ref<Record<FitnessSource, boolean>>({
    strava: false,
    garmin: false,
  })

  const activitiesError = ref<string | null>(null)
  const dailyError = ref<string | null>(null)
  const statusError = ref<string | null>(null)
  const moodRecoveryError = ref<string | null>(null)
  const divergenceError = ref<string | null>(null)
  const syncError = ref<Record<FitnessSource, string | null>>({
    strava: null,
    garmin: null,
  })

  // Shared range/bin state — same UX as the dashboard, mounted via
  // RangeBinControls on the /fitness page. Defaults mirror the
  // dashboard's so a user landing on either page sees a familiar window.
  const range = ref<DashboardRange>('last_3_months')
  const bin = ref<DashboardBin>('week')

  const dateWindow = computed<{ start: string; end: string }>(() => {
    const { from, to } = rangeToDates(range.value)
    // For "all time" the dashboard sends `null` to the server, which
    // returns the full corpus. The fitness endpoints don't accept
    // `null` directly — fall back to a wide explicit window
    // (start = epoch year, end = today) so the UI behaves the same.
    const today = new Date().toISOString().slice(0, 10)
    return { start: from ?? '1970-01-01', end: to ?? today }
  })

  // Getters
  const distinctActivities = computed<DedupedActivity[]>(() =>
    dedupActivities(activities.value),
  )

  /**
   * True when at least one source is `auth_status="broken"`. Drives the
   * persistent banner in DefaultLayout.
   */
  const isAnyAuthBroken = computed(
    () =>
      syncStatus.value.strava?.auth_status === 'broken' ||
      syncStatus.value.garmin?.auth_status === 'broken',
  )

  /**
   * Sources currently in `auth_status="broken"`. Keeps the order
   * stable (strava before garmin) so the banner copy is deterministic.
   */
  const brokenSources = computed<FitnessSource[]>(() => {
    const out: FitnessSource[] = []
    if (syncStatus.value.strava?.auth_status === 'broken') out.push('strava')
    if (syncStatus.value.garmin?.auth_status === 'broken') out.push('garmin')
    return out
  })

  /**
   * True when every source returns `null` from the sync-status endpoint —
   * i.e. the user has never connected anything. Surfaces a "first-run"
   * affordance instead of a status panel populated with empty rows.
   */
  const isFreshSetup = computed(
    () => syncStatus.value.strava === null && syncStatus.value.garmin === null,
  )

  // Actions
  async function loadActivities(start: string, end: string) {
    loadingActivities.value = true
    activitiesError.value = null
    try {
      const resp = await fetchActivities({ start, end })
      activities.value = resp.items
    } catch (e) {
      activitiesError.value =
        e instanceof Error ? e.message : 'Failed to load activities'
    } finally {
      loadingActivities.value = false
    }
  }

  async function loadDaily(start: string, end: string) {
    loadingDaily.value = true
    dailyError.value = null
    try {
      const resp = await fetchDaily({ start, end })
      daily.value = resp.items
    } catch (e) {
      dailyError.value =
        e instanceof Error ? e.message : 'Failed to load daily wellness'
    } finally {
      loadingDaily.value = false
    }
  }

  async function loadMoodRecovery(from: string, to: string) {
    loadingMoodRecovery.value = true
    moodRecoveryError.value = null
    try {
      const resp = await fetchMoodRecovery(from, to)
      moodRecovery.value = resp.rows
    } catch (e) {
      moodRecoveryError.value =
        e instanceof Error ? e.message : 'Failed to load mood × recovery'
    } finally {
      loadingMoodRecovery.value = false
    }
  }

  async function loadDivergence(start: string, end: string, window?: number) {
    loadingDivergence.value = true
    divergenceError.value = null
    try {
      const resp = await fetchDivergence(start, end, window)
      divergence.value = resp.rows
      divergenceSummary.value = resp.summary
    } catch (e) {
      divergenceError.value =
        e instanceof Error ? e.message : 'Failed to load fatigue divergence'
    } finally {
      loadingDivergence.value = false
    }
  }

  async function loadSyncStatus() {
    loadingStatus.value = true
    statusError.value = null
    try {
      syncStatus.value = await fetchSyncStatus()
    } catch (e) {
      statusError.value =
        e instanceof Error ? e.message : 'Failed to load sync status'
    } finally {
      loadingStatus.value = false
    }
  }

  /**
   * Submit a sync job and register it with the existing jobs store so
   * the notification UI tracks it like any other background job.
   * Returns the job id (the caller can poll via the jobs store), or
   * null if submission failed — surface error via syncError instead.
   */
  async function startSync(source: FitnessSource): Promise<string | null> {
    triggeringSync.value[source] = true
    syncError.value[source] = null
    try {
      const resp = await triggerSync(source)
      const jobsStore = useJobsStore()
      const jobType =
        source === 'strava' ? 'fitness_sync_strava' : 'fitness_sync_garmin'
      jobsStore.trackJob(resp.job_id, jobType, { source })
      // Refresh status soon after — the worker will populate
      // `last_success_at` once the job finishes; users expect the panel
      // to reflect their click without a manual reload.
      void scheduleStatusRefresh()
      return resp.job_id
    } catch (e) {
      syncError.value[source] =
        e instanceof Error ? e.message : 'Failed to queue sync'
      return null
    } finally {
      triggeringSync.value[source] = false
    }
  }

  let pendingStatusRefresh: ReturnType<typeof setTimeout> | null = null

  /**
   * Schedule one status refresh ~3s out, debounced — multiple sync
   * triggers in quick succession collapse to a single refresh tick.
   * Internal helper; not part of the public store surface.
   */
  function scheduleStatusRefresh() {
    if (pendingStatusRefresh !== null) {
      clearTimeout(pendingStatusRefresh)
    }
    pendingStatusRefresh = setTimeout(() => {
      pendingStatusRefresh = null
      void loadSyncStatus()
    }, 3000)
  }

  /** Test-only escape hatch: cancel any pending refresh timer. */
  function cancelPendingStatusRefresh() {
    if (pendingStatusRefresh !== null) {
      clearTimeout(pendingStatusRefresh)
      pendingStatusRefresh = null
    }
  }

  /** Set the active range and refetch both activities and daily wellness
   *  with the new window. Mirrors the dashboard's `onRangeChange` pattern. */
  async function setRange(r: DashboardRange) {
    if (r === range.value) return
    range.value = r
    const { start, end } = dateWindow.value
    await Promise.all([
      loadActivities(start, end),
      loadDaily(start, end),
      loadMoodRecovery(start, end),
      loadDivergence(start, end),
    ])
  }

  /** Set the active bin width. No refetch — fitness charts compute
   *  weekly buckets client-side from the loaded series, so the bin only
   *  affects rendering. */
  function setBin(b: DashboardBin) {
    bin.value = b
  }

  // ── Tile layout (T3) ───────────────────────────────────────────────
  //
  // Mirrors the dashboard store's layout surface: `tileOrder`,
  // `hiddenTiles`, `tileWidths` (named widths here — `'third' | 'half'
  // | 'full'` — on a 6-column grid), `editingLayout`, plus
  // load/persist actions. T4 wires `fitness_layout` to
  // `/api/users/me/preferences`.
  const tileOrder = ref<FitnessTileId[]>([...DEFAULT_FITNESS_TILE_ORDER])
  const hiddenTiles = ref<FitnessTileId[]>([])
  const tileWidths = ref<Partial<Record<FitnessTileId, NamedWidth>>>({})
  const editingLayout = ref(false)
  const layoutLoaded = ref(false)

  const tileDefs = computed(() => {
    const m = new Map<FitnessTileId, (typeof FITNESS_TILES)[number]>()
    for (const t of FITNESS_TILES) m.set(t.id, t)
    return m
  })

  /** Effective width for a tile: user override or definition default. */
  function getTileWidth(id: FitnessTileId): NamedWidth {
    return (
      tileWidths.value[id] ?? tileDefs.value.get(id)?.defaultWidth ?? 'full'
    )
  }

  // ── Persistence (T4) ─────────────────────────────────────────────
  //
  // Debounced PUT to /api/users/me/preferences under `fitness_layout`.
  // Mirrors the dashboard store's pattern (single 500ms timer reset on
  // each mutation so a rapid drag-resize-hide sequence collapses to one
  // request). `layoutLoaded` flips true once `loadLayout` has settled
  // — the FitnessView avoids saving back the defaults before the load
  // round-trips by gating mutations until then.
  let _saveTimer: ReturnType<typeof setTimeout> | null = null

  function _persistLayout(): void {
    // Skip auto-save before `loadLayout` has settled, otherwise the
    // first user mutation would race against the in-flight GET and
    // potentially overwrite the saved layout with defaults.
    if (!layoutLoaded.value) return
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => {
      const layout: FitnessLayout = {
        tileOrder: tileOrder.value,
        hiddenTiles: hiddenTiles.value,
        tileWidths: tileWidths.value,
      }
      updatePreferences({ fitness_layout: layout }).catch(() => {
        // Silent — the in-memory layout is the source of truth for the
        // session; the next mutation will retry the save.
      })
    }, 500)
  }

  async function loadLayout(): Promise<void> {
    try {
      const { preferences } = await fetchPreferences()
      const layout = preferences.fitness_layout as FitnessLayout | undefined
      if (layout) applyLayout(layout)
    } catch {
      // Preferences endpoint unreachable or no saved layout — keep the
      // defaults seeded at store-construction time.
    } finally {
      layoutLoaded.value = true
    }
  }

  function _cancelPendingPersist(): void {
    if (_saveTimer !== null) {
      clearTimeout(_saveTimer)
      _saveTimer = null
    }
  }

  function setTileWidth(id: FitnessTileId, width: NamedWidth): void {
    tileWidths.value = { ...tileWidths.value, [id]: width }
    _persistLayout()
  }

  /** Advance a tile through the third → half → full → third cycle. */
  function cycleTileWidth(id: FitnessTileId): void {
    const idx = FITNESS_WIDTH_CYCLE.indexOf(getTileWidth(id))
    const next =
      FITNESS_WIDTH_CYCLE[(idx + 1) % FITNESS_WIDTH_CYCLE.length] ?? 'full'
    setTileWidth(id, next)
  }

  function moveTile(id: FitnessTileId, direction: 'up' | 'down'): void {
    const order = [...tileOrder.value]
    const idx = order.indexOf(id)
    if (idx === -1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= order.length) return
    ;[order[idx], order[targetIdx]] = [order[targetIdx], order[idx]]
    tileOrder.value = order
    _persistLayout()
  }

  function hideTile(id: FitnessTileId): void {
    if (!hiddenTiles.value.includes(id)) {
      hiddenTiles.value = [...hiddenTiles.value, id]
      _persistLayout()
    }
  }

  function showTile(id: FitnessTileId): void {
    hiddenTiles.value = hiddenTiles.value.filter((t) => t !== id)
    _persistLayout()
  }

  function resetLayout(): void {
    tileOrder.value = [...DEFAULT_FITNESS_TILE_ORDER]
    hiddenTiles.value = []
    tileWidths.value = {}
    _persistLayout()
  }

  /**
   * Apply a deserialised `FitnessLayout` blob to the store. Used by T4's
   * `loadLayout` action and exposed separately so tests can drive the
   * validation logic without going through the preferences API.
   *
   * - Unknown tile IDs in `tileOrder` / `hiddenTiles` / `tileWidths` are
   *   dropped (defends against a stored layout from an older webapp
   *   version that referenced a tile we no longer ship).
   * - Any tile IDs missing from the saved order are appended in
   *   `FITNESS_TILES` order so new tiles introduced after the user saved
   *   show up rather than vanishing.
   * - `tileWidths` entries with invalid width values are dropped.
   */
  function applyLayout(layout: FitnessLayout): void {
    const validIds = new Set<FitnessTileId>(DEFAULT_FITNESS_TILE_ORDER)
    const order = (layout.tileOrder ?? []).filter((id) =>
      validIds.has(id),
    ) as FitnessTileId[]
    for (const id of DEFAULT_FITNESS_TILE_ORDER) {
      if (!order.includes(id)) order.push(id)
    }
    tileOrder.value = order

    hiddenTiles.value = (layout.hiddenTiles ?? []).filter((id) =>
      validIds.has(id),
    ) as FitnessTileId[]

    const savedWidths = layout.tileWidths ?? {}
    const restored: Partial<Record<FitnessTileId, NamedWidth>> = {}
    const validWidths: ReadonlySet<NamedWidth> = new Set(FITNESS_WIDTH_CYCLE)
    for (const [id, width] of Object.entries(savedWidths)) {
      if (
        validIds.has(id as FitnessTileId) &&
        validWidths.has(width as NamedWidth)
      ) {
        restored[id as FitnessTileId] = width as NamedWidth
      }
    }
    tileWidths.value = restored
  }

  return {
    activities,
    daily,
    syncStatus,
    moodRecovery,
    divergence,
    divergenceSummary,
    loadingActivities,
    loadingDaily,
    loadingStatus,
    loadingMoodRecovery,
    loadingDivergence,
    triggeringSync,
    activitiesError,
    dailyError,
    statusError,
    moodRecoveryError,
    divergenceError,
    syncError,
    range,
    bin,
    dateWindow,
    distinctActivities,
    isAnyAuthBroken,
    brokenSources,
    isFreshSetup,
    loadActivities,
    loadDaily,
    loadMoodRecovery,
    loadDivergence,
    loadSyncStatus,
    startSync,
    setRange,
    setBin,
    cancelPendingStatusRefresh,
    // Tile layout (T3 / T4)
    tileOrder,
    hiddenTiles,
    tileWidths,
    editingLayout,
    layoutLoaded,
    tileDefs,
    getTileWidth,
    setTileWidth,
    cycleTileWidth,
    moveTile,
    hideTile,
    showTile,
    resetLayout,
    applyLayout,
    loadLayout,
    _cancelPendingPersist,
  }
})
