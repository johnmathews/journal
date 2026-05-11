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
