import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  useFitnessStore,
  dedupActivities,
  DEDUP_OVERLAP_THRESHOLD,
} from '../fitness'
import type { FitnessActivity, FitnessSyncStatus } from '@/types/fitness'

vi.mock('@/api/fitness', () => ({
  fetchActivities: vi.fn(),
  fetchDaily: vi.fn(),
  fetchSyncStatus: vi.fn(),
  triggerSync: vi.fn(),
}))

import {
  fetchActivities,
  fetchDaily,
  fetchSyncStatus,
  triggerSync,
} from '@/api/fitness'
import { useJobsStore } from '@/stores/jobs'

const mockFetchActivities = vi.mocked(fetchActivities)
const mockFetchDaily = vi.mocked(fetchDaily)
const mockFetchSyncStatus = vi.mocked(fetchSyncStatus)
const mockTriggerSync = vi.mocked(triggerSync)

function makeActivity(over: Partial<FitnessActivity> = {}): FitnessActivity {
  return {
    id: 1,
    user_id: 1,
    source: 'strava',
    source_id: 'src-1',
    activity_type: 'run',
    source_subtype: 'Run',
    start_time: '2026-05-09T07:00:00Z',
    local_date: '2026-05-09',
    duration_s: 1800,
    moving_time_s: 1800,
    distance_m: 5000,
    elevation_gain_m: 20,
    avg_hr_bpm: 150,
    max_hr_bpm: 170,
    avg_pace_s_per_km: 360,
    calories_kcal: 400,
    perceived_exertion: null,
    extras: {},
    raw_ref_id: 1,
    normalized_at: '2026-05-09T07:30:00Z',
    ...over,
  }
}

describe('dedupActivities', () => {
  it('passes Strava-only or Garmin-only rows through unchanged', () => {
    const a = makeActivity({ id: 1, source: 'strava', source_id: 's1' })
    const b = makeActivity({
      id: 2,
      source: 'garmin',
      source_id: 'g1',
      start_time: '2026-05-08T07:00:00Z',
    })

    const result = dedupActivities([a, b])

    expect(result).toHaveLength(2)
    expect(result.every((r) => r.secondary_source_ids.length === 0)).toBe(true)
  })

  it('merges 42m Strava and 41m Garmin at the same start (F2 regression)', () => {
    // The 2026-05-09 case from the user review: a one-minute duration
    // gap (Strava moving-time vs Garmin total-time) was enough to make
    // the old start+duration-tolerance algorithm fail to merge.
    const strava = makeActivity({
      id: 1,
      source: 'strava',
      source_id: 's1',
      start_time: '2026-05-09T07:00:00Z',
      duration_s: 42 * 60,
    })
    const garmin = makeActivity({
      id: 2,
      source: 'garmin',
      source_id: 'g1',
      start_time: '2026-05-09T07:00:00Z',
      duration_s: 41 * 60,
    })

    const result = dedupActivities([strava, garmin])

    expect(result).toHaveLength(1)
    expect(result[0].representative.source).toBe('strava')
    expect(result[0].secondary_source_ids).toEqual([
      { source: 'garmin', source_id: 'g1' },
    ])
  })

  it('merges activities offset by 1 minute (moving-time vs total-time scenario)', () => {
    // Strava 60m at 08:00; Garmin 58m at 08:01. Overlap = 57 min;
    // shorter = 58 min; ratio ≈ 98% — comfortably over 75%.
    const strava = makeActivity({
      id: 1,
      source: 'strava',
      source_id: 's1',
      start_time: '2026-05-09T08:00:00Z',
      duration_s: 60 * 60,
    })
    const garmin = makeActivity({
      id: 2,
      source: 'garmin',
      source_id: 'g1',
      start_time: '2026-05-09T08:01:00Z',
      duration_s: 58 * 60,
    })

    const result = dedupActivities([strava, garmin])

    expect(result).toHaveLength(1)
  })

  it('keeps two distinct activities 35 minutes apart as separate rows', () => {
    // 30m run at 7:00 ends at 7:30. 30m run at 8:05 starts after the
    // first ends — overlap is 0 — must not merge.
    const a = makeActivity({
      id: 1,
      source: 'strava',
      source_id: 'a',
      start_time: '2026-05-09T07:00:00Z',
      duration_s: 30 * 60,
    })
    const b = makeActivity({
      id: 2,
      source: 'strava',
      source_id: 'b',
      start_time: '2026-05-09T08:05:00Z',
      duration_s: 30 * 60,
    })

    const result = dedupActivities([a, b])

    expect(result).toHaveLength(2)
  })

  it('handles three-source case: Strava + matching Garmin + phantom Garmin', () => {
    // Strava 30m at 07:00, Garmin 30m at 07:00 (real pair), phantom
    // Garmin 30m at 09:00 (no Strava counterpart). Two distinct
    // workouts, three input rows.
    const strava = makeActivity({
      id: 1,
      source: 'strava',
      source_id: 's1',
      start_time: '2026-05-09T07:00:00Z',
      duration_s: 30 * 60,
    })
    const garminPair = makeActivity({
      id: 2,
      source: 'garmin',
      source_id: 'g1',
      start_time: '2026-05-09T07:00:00Z',
      duration_s: 30 * 60,
    })
    const garminSolo = makeActivity({
      id: 3,
      source: 'garmin',
      source_id: 'g2',
      start_time: '2026-05-09T09:00:00Z',
      duration_s: 30 * 60,
    })

    const result = dedupActivities([strava, garminPair, garminSolo])

    expect(result).toHaveLength(2)
    const merged = result.find((r) => r.secondary_source_ids.length > 0)
    expect(merged?.representative.source).toBe('strava')
    expect(merged?.secondary_source_ids).toEqual([
      { source: 'garmin', source_id: 'g1' },
    ])
    const solo = result.find((r) => r.secondary_source_ids.length === 0)
    expect(solo?.representative.source_id).toBe('g2')
  })

  it('matches by UTC window regardless of how the original ISO is formatted', () => {
    // Strava sends `Z`; Garmin (normalize.py converts to UTC) also
    // produces `Z`-suffixed ISO. Same UTC moment must merge even if
    // someone tests with an offset notation that resolves to the same
    // instant.
    const strava = makeActivity({
      id: 1,
      source: 'strava',
      source_id: 's1',
      start_time: '2026-05-09T07:00:00Z',
      duration_s: 30 * 60,
    })
    const garmin = makeActivity({
      id: 2,
      source: 'garmin',
      source_id: 'g1',
      // Same UTC moment expressed as +02:00 offset.
      start_time: '2026-05-09T09:00:00+02:00',
      duration_s: 30 * 60,
    })

    const result = dedupActivities([strava, garmin])

    expect(result).toHaveLength(1)
  })

  it('picks the longer activity as the representative', () => {
    // 60m Garmin should win over 42m Strava because it is longer,
    // even though the tie-break otherwise prefers Strava.
    const strava = makeActivity({
      id: 1,
      source: 'strava',
      source_id: 's1',
      start_time: '2026-05-09T07:00:00Z',
      duration_s: 42 * 60,
    })
    const garmin = makeActivity({
      id: 2,
      source: 'garmin',
      source_id: 'g1',
      start_time: '2026-05-09T07:00:00Z',
      duration_s: 60 * 60,
    })

    const result = dedupActivities([strava, garmin])

    expect(result).toHaveLength(1)
    expect(result[0].representative.source).toBe('garmin')
  })

  it('breaks ties (equal duration) by preferring Strava', () => {
    const strava = makeActivity({
      id: 1,
      source: 'strava',
      source_id: 's1',
      start_time: '2026-05-09T07:00:00Z',
      duration_s: 1800,
    })
    const garmin = makeActivity({
      id: 2,
      source: 'garmin',
      source_id: 'g1',
      start_time: '2026-05-09T07:00:00Z',
      duration_s: 1800,
    })

    const result = dedupActivities([strava, garmin])

    expect(result).toHaveLength(1)
    expect(result[0].representative.source).toBe('strava')
  })

  it('sorts results by start_time descending', () => {
    const older = makeActivity({
      id: 1,
      source: 'strava',
      source_id: 'older',
      start_time: '2026-05-08T07:00:00Z',
    })
    const newer = makeActivity({
      id: 2,
      source: 'strava',
      source_id: 'newer',
      start_time: '2026-05-09T07:00:00Z',
    })

    const result = dedupActivities([older, newer])

    expect(result.map((r) => r.representative.source_id)).toEqual([
      'newer',
      'older',
    ])
  })

  it('does not mutate the caller-supplied array order', () => {
    const a = makeActivity({
      id: 1,
      start_time: '2026-05-09T08:00:00Z',
      source_id: 'late',
    })
    const b = makeActivity({
      id: 2,
      start_time: '2026-05-08T07:00:00Z',
      source_id: 'early',
    })
    const input = [a, b]
    dedupActivities(input)
    expect(input.map((r) => r.source_id)).toEqual(['late', 'early'])
  })

  it('exposes the overlap threshold constant', () => {
    // Pinned so a future caller knows the threshold without reading
    // the implementation; widening or narrowing should be a deliberate edit.
    expect(DEDUP_OVERLAP_THRESHOLD).toBe(0.75)
  })
})

describe('useFitnessStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loadActivities populates state', async () => {
    mockFetchActivities.mockResolvedValue({ items: [makeActivity()] })

    const store = useFitnessStore()
    await store.loadActivities('2026-05-01', '2026-05-09')

    expect(store.activities).toHaveLength(1)
    expect(store.loadingActivities).toBe(false)
    expect(store.activitiesError).toBeNull()
  })

  it('loadActivities surfaces a network error message', async () => {
    mockFetchActivities.mockRejectedValue(new Error('Network down'))

    const store = useFitnessStore()
    await store.loadActivities('2026-05-01', '2026-05-09')

    expect(store.activities).toEqual([])
    expect(store.activitiesError).toBe('Network down')
    expect(store.loadingActivities).toBe(false)
  })

  it('loadDaily populates state and clears prior errors', async () => {
    mockFetchDaily.mockResolvedValue({
      items: [
        {
          id: 1,
          user_id: 1,
          source: 'garmin',
          local_date: '2026-05-09',
          sleep_score: 78,
          sleep_duration_s: 25200,
          sleep_efficiency_pct: 91.2,
          hrv_overnight_ms: 78.4,
          resting_hr_bpm: 41,
          body_battery_high: 72,
          body_battery_low: 18,
          stress_avg: 24,
          training_load_acute: 412,
          training_load_chronic: 388,
          training_readiness: 73,
          extras: {},
          raw_ref_ids: [1, 2, 3, 4, 5, 6],
          normalized_at: '2026-05-09T08:00:00Z',
        },
      ],
    })

    const store = useFitnessStore()
    await store.loadDaily('2026-05-01', '2026-05-09')

    expect(store.daily).toHaveLength(1)
    expect(store.daily[0].sleep_score).toBe(78)
  })

  it('loadDaily surfaces a network error message', async () => {
    mockFetchDaily.mockRejectedValue(new Error('boom'))

    const store = useFitnessStore()
    await store.loadDaily('2026-05-01', '2026-05-09')

    expect(store.dailyError).toBe('boom')
  })

  it('loadSyncStatus populates state', async () => {
    const status: FitnessSyncStatus = {
      strava: {
        auth_status: 'ok',
        auth_broken_since: null,
        last_success_at: '2026-05-09T18:42:11Z',
        last_runs: [],
      },
      garmin: null,
    }
    mockFetchSyncStatus.mockResolvedValue(status)

    const store = useFitnessStore()
    await store.loadSyncStatus()

    expect(store.syncStatus).toEqual(status)
  })

  it('loadSyncStatus surfaces a network error message', async () => {
    mockFetchSyncStatus.mockRejectedValue(new Error('Failed status'))

    const store = useFitnessStore()
    await store.loadSyncStatus()

    expect(store.statusError).toBe('Failed status')
  })

  it('isAnyAuthBroken is true when any source reports broken', async () => {
    mockFetchSyncStatus.mockResolvedValue({
      strava: {
        auth_status: 'broken',
        auth_broken_since: '2026-05-09T00:00:00Z',
        last_success_at: '2026-05-08T07:00:00Z',
        last_runs: [],
      },
      garmin: {
        auth_status: 'ok',
        auth_broken_since: null,
        last_success_at: '2026-05-09T07:00:00Z',
        last_runs: [],
      },
    })

    const store = useFitnessStore()
    await store.loadSyncStatus()

    expect(store.isAnyAuthBroken).toBe(true)
    expect(store.brokenSources).toEqual(['strava'])
  })

  it('isAnyAuthBroken is false when both sources are ok or null', async () => {
    mockFetchSyncStatus.mockResolvedValue({
      strava: {
        auth_status: 'ok',
        auth_broken_since: null,
        last_success_at: null,
        last_runs: [],
      },
      garmin: null,
    })

    const store = useFitnessStore()
    await store.loadSyncStatus()

    expect(store.isAnyAuthBroken).toBe(false)
    expect(store.brokenSources).toEqual([])
  })

  it('isFreshSetup is true when both sources are null', () => {
    const store = useFitnessStore()
    expect(store.isFreshSetup).toBe(true)
  })

  it('distinctActivities applies dedup over the loaded rows', async () => {
    mockFetchActivities.mockResolvedValue({
      items: [
        makeActivity({
          id: 1,
          source: 'strava',
          source_id: 's1',
          start_time: '2026-05-09T07:00:00Z',
          duration_s: 1800,
        }),
        makeActivity({
          id: 2,
          source: 'garmin',
          source_id: 'g1',
          start_time: '2026-05-09T07:00:10Z',
          duration_s: 1810,
        }),
      ],
    })

    const store = useFitnessStore()
    await store.loadActivities('2026-05-01', '2026-05-09')

    expect(store.activities).toHaveLength(2)
    expect(store.distinctActivities).toHaveLength(1)
    // Representative is the longer of the pair — here Garmin's 1810s.
    expect(store.distinctActivities[0].representative.source).toBe('garmin')
  })

  it('startSync queues a job, registers it with the jobs store, and schedules a status refresh', async () => {
    mockTriggerSync.mockResolvedValue({ job_id: 'job-fit-1', status: 'queued' })
    mockFetchSyncStatus.mockResolvedValue({ strava: null, garmin: null })

    const store = useFitnessStore()
    const jobsStore = useJobsStore()
    const trackJobSpy = vi
      .spyOn(jobsStore, 'trackJob')
      .mockImplementation(() => {})

    const jobId = await store.startSync('strava')

    expect(jobId).toBe('job-fit-1')
    expect(trackJobSpy).toHaveBeenCalledWith(
      'job-fit-1',
      'fitness_sync_strava',
      {
        source: 'strava',
      },
    )
    expect(store.syncError.strava).toBeNull()
    expect(store.triggeringSync.strava).toBe(false)

    // Refresh fires ~3s later.
    await vi.advanceTimersByTimeAsync(3000)
    expect(mockFetchSyncStatus).toHaveBeenCalled()
  })

  it('startSync sets syncError on failure and does not schedule a refresh', async () => {
    mockTriggerSync.mockRejectedValue(new Error('503 not configured'))

    const store = useFitnessStore()

    const jobId = await store.startSync('garmin')

    expect(jobId).toBeNull()
    expect(store.syncError.garmin).toBe('503 not configured')
    expect(store.triggeringSync.garmin).toBe(false)

    // No refresh scheduled — confirm by advancing time and seeing no fetch.
    await vi.advanceTimersByTimeAsync(5000)
    expect(mockFetchSyncStatus).not.toHaveBeenCalled()
  })

  it('cancelPendingStatusRefresh stops a pending refresh tick', async () => {
    mockTriggerSync.mockResolvedValue({ job_id: 'j1', status: 'queued' })

    const store = useFitnessStore()
    const jobsStore = useJobsStore()
    vi.spyOn(jobsStore, 'trackJob').mockImplementation(() => {})

    await store.startSync('strava')
    store.cancelPendingStatusRefresh()

    await vi.advanceTimersByTimeAsync(5000)
    expect(mockFetchSyncStatus).not.toHaveBeenCalled()
  })

  it('two rapid syncs collapse to a single status refresh', async () => {
    mockTriggerSync.mockResolvedValue({ job_id: 'j', status: 'queued' })
    mockFetchSyncStatus.mockResolvedValue({ strava: null, garmin: null })

    const store = useFitnessStore()
    const jobsStore = useJobsStore()
    vi.spyOn(jobsStore, 'trackJob').mockImplementation(() => {})

    await store.startSync('strava')
    await store.startSync('garmin')

    await vi.advanceTimersByTimeAsync(3000)
    expect(mockFetchSyncStatus).toHaveBeenCalledTimes(1)
  })
})
