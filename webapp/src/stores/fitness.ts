import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  fetchActivities,
  fetchDaily,
  fetchSyncStatus,
  triggerSync,
} from '@/api/fitness'
import { useJobsStore } from '@/stores/jobs'
import type {
  FitnessActivity,
  FitnessDaily,
  FitnessSource,
  FitnessSyncStatus,
  DedupedActivity,
} from '@/types/fitness'

// Cross-source dedup tolerance. The same workout uploaded from a Garmin
// watch to Strava can land with slightly different `start_time` (Strava
// rounds to whole seconds; Garmin sometimes shifts by a few seconds when
// the watch's clock differs from the phone's) and `duration_s` (Strava
// distinguishes elapsed-vs-moving time, which can drift the duration by
// a handful of seconds when the operator pauses mid-workout).
//
// ±90s on start_time and ±30s on duration_s are conservative defaults
// per the W15 architecture discussion (journal/260510-fitness-w15-webapp.md);
// loosen if real-world drift turns out to be wider.
export const DEDUP_START_TOLERANCE_MS = 90_000
export const DEDUP_DURATION_TOLERANCE_S = 30

/**
 * Group activities into canonical workouts. The same workout uploaded
 * from Garmin → Strava appears in both raw tables; "weekly run count"
 * doubles without dedup. We pair Strava and Garmin rows whose
 * start_time falls within ±90s and duration_s within ±30s, and
 * surface the Strava row as the canonical one (Strava-side metadata
 * is more uniform — the source_subtype collapse is canonical, the
 * pace and elevation fields are usually populated). Garmin-only or
 * Strava-only activities pass through unchanged.
 *
 * Exported for direct testing; consumers should prefer the
 * `distinctActivities` getter on the store.
 */
export function dedupActivities(rows: FitnessActivity[]): DedupedActivity[] {
  const strava = rows.filter((r) => r.source === 'strava')
  const garmin = rows.filter((r) => r.source === 'garmin')

  const result: DedupedActivity[] = []
  const matchedGarminIds = new Set<number>()

  // Sort Garmin by start_time once so we can do a bounded linear scan
  // per Strava row instead of an O(N×M) double loop. With <1000 rows
  // per source the scale doesn't matter, but it keeps the test shapes
  // honest about what the algorithm does.
  const garminByStart = [...garmin].sort(
    (a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  )

  for (const sRow of strava) {
    const sStart = new Date(sRow.start_time).getTime()
    let pair: FitnessActivity | undefined
    for (const gRow of garminByStart) {
      if (matchedGarminIds.has(gRow.id)) continue
      const gStart = new Date(gRow.start_time).getTime()
      if (gStart - sStart > DEDUP_START_TOLERANCE_MS) break
      if (sStart - gStart > DEDUP_START_TOLERANCE_MS) continue
      if (
        Math.abs(gRow.duration_s - sRow.duration_s) > DEDUP_DURATION_TOLERANCE_S
      ) {
        continue
      }
      pair = gRow
      break
    }

    if (pair) {
      matchedGarminIds.add(pair.id)
      result.push({
        representative: sRow,
        secondary_source_ids: [
          { source: pair.source, source_id: pair.source_id },
        ],
      })
    } else {
      result.push({ representative: sRow, secondary_source_ids: [] })
    }
  }

  // Garmin-only rows (no matching Strava counterpart).
  for (const gRow of garminByStart) {
    if (!matchedGarminIds.has(gRow.id)) {
      result.push({ representative: gRow, secondary_source_ids: [] })
    }
  }

  result.sort(
    (a, b) =>
      new Date(b.representative.start_time).getTime() -
      new Date(a.representative.start_time).getTime(),
  )
  return result
}

export const useFitnessStore = defineStore('fitness', () => {
  // State
  const activities = ref<FitnessActivity[]>([])
  const daily = ref<FitnessDaily[]>([])
  const syncStatus = ref<FitnessSyncStatus>({ strava: null, garmin: null })

  const loadingActivities = ref(false)
  const loadingDaily = ref(false)
  const loadingStatus = ref(false)
  const triggeringSync = ref<Record<FitnessSource, boolean>>({
    strava: false,
    garmin: false,
  })

  const activitiesError = ref<string | null>(null)
  const dailyError = ref<string | null>(null)
  const statusError = ref<string | null>(null)
  const syncError = ref<Record<FitnessSource, string | null>>({
    strava: null,
    garmin: null,
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

  return {
    activities,
    daily,
    syncStatus,
    loadingActivities,
    loadingDaily,
    loadingStatus,
    triggeringSync,
    activitiesError,
    dailyError,
    statusError,
    syncError,
    distinctActivities,
    isAnyAuthBroken,
    brokenSources,
    isFreshSetup,
    loadActivities,
    loadDaily,
    loadSyncStatus,
    startSync,
    cancelPendingStatusRefresh,
  }
})
