import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  useFitnessStore,
  dedupActivities,
  DEDUP_START_TOLERANCE_MS,
  DEDUP_DURATION_TOLERANCE_S,
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

  it('pairs Strava and Garmin rows within ±90s start_time and ±30s duration_s', () => {
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
      start_time: '2026-05-09T07:00:30Z', // +30s — within tolerance
      duration_s: 1810, // +10s — within tolerance
    })

    const result = dedupActivities([strava, garmin])

    expect(result).toHaveLength(1)
    expect(result[0].representative.source).toBe('strava')
    expect(result[0].representative.source_id).toBe('s1')
    expect(result[0].secondary_source_ids).toEqual([
      { source: 'garmin', source_id: 'g1' },
    ])
  })

  it('does NOT pair rows when start_time exceeds tolerance', () => {
    const strava = makeActivity({
      id: 1,
      source: 'strava',
      start_time: '2026-05-09T07:00:00Z',
    })
    const garmin = makeActivity({
      id: 2,
      source: 'garmin',
      // +91 seconds — just over the ±90s window.
      start_time: '2026-05-09T07:01:31Z',
    })

    const result = dedupActivities([strava, garmin])

    expect(result).toHaveLength(2)
  })

  it('does NOT pair rows when duration_s exceeds tolerance', () => {
    const strava = makeActivity({
      id: 1,
      source: 'strava',
      start_time: '2026-05-09T07:00:00Z',
      duration_s: 1800,
    })
    const garmin = makeActivity({
      id: 2,
      source: 'garmin',
      start_time: '2026-05-09T07:00:00Z',
      duration_s: 1850, // +50s — over the ±30s tolerance
    })

    const result = dedupActivities([strava, garmin])

    expect(result).toHaveLength(2)
  })

  it('does NOT match the same Garmin row to two Strava rows', () => {
    const stravaA = makeActivity({
      id: 1,
      source: 'strava',
      source_id: 'sA',
      start_time: '2026-05-09T07:00:00Z',
      duration_s: 1800,
    })
    const stravaB = makeActivity({
      id: 2,
      source: 'strava',
      source_id: 'sB',
      start_time: '2026-05-09T07:00:30Z',
      duration_s: 1800,
    })
    const garmin = makeActivity({
      id: 3,
      source: 'garmin',
      source_id: 'gOne',
      start_time: '2026-05-09T07:00:15Z',
      duration_s: 1800,
    })

    const result = dedupActivities([stravaA, stravaB, garmin])

    // First Strava claims the Garmin; second Strava is solo.
    expect(result).toHaveLength(2)
    const claimed = result.find((r) => r.secondary_source_ids.length > 0)
    const solo = result.find((r) => r.secondary_source_ids.length === 0)
    expect(claimed?.representative.source_id).toBe('sA')
    expect(solo?.representative.source_id).toBe('sB')
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

  it('breaks the inner scan once the Garmin window is past the Strava start', () => {
    // sortedAscending — the inner loop should stop scanning the Garmin
    // list as soon as gStart is more than 90s ahead of sStart.
    const strava = makeActivity({
      id: 1,
      source: 'strava',
      start_time: '2026-05-09T07:00:00Z',
    })
    const garminFar1 = makeActivity({
      id: 10,
      source: 'garmin',
      start_time: '2026-05-09T07:05:00Z', // +5 min — past tolerance
    })
    const garminFar2 = makeActivity({
      id: 11,
      source: 'garmin',
      start_time: '2026-05-09T07:10:00Z', // +10 min — past tolerance
    })

    const result = dedupActivities([strava, garminFar1, garminFar2])

    expect(result).toHaveLength(3)
    expect(result.every((r) => r.secondary_source_ids.length === 0)).toBe(true)
  })

  it('skips Garmin rows whose start_time is before the Strava window (continue path)', () => {
    const strava = makeActivity({
      id: 1,
      source: 'strava',
      start_time: '2026-05-09T07:05:00Z',
    })
    const garminEarly = makeActivity({
      id: 10,
      source: 'garmin',
      start_time: '2026-05-09T07:00:00Z', // 5 min earlier — out of window
    })
    const garminMatch = makeActivity({
      id: 11,
      source: 'garmin',
      start_time: '2026-05-09T07:05:30Z', // within tolerance
    })

    const result = dedupActivities([strava, garminEarly, garminMatch])

    // Strava paired with garminMatch; garminEarly is solo.
    expect(result).toHaveLength(2)
    const paired = result.find((r) => r.secondary_source_ids.length > 0)
    expect(paired?.secondary_source_ids[0].source_id).toBe(
      garminMatch.source_id,
    )
  })

  it('exposes the tolerance constants', () => {
    // Pinned so a future caller knows the window without reading
    // the implementation; widening or narrowing should be a deliberate edit.
    expect(DEDUP_START_TOLERANCE_MS).toBe(90_000)
    expect(DEDUP_DURATION_TOLERANCE_S).toBe(30)
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
    expect(store.distinctActivities[0].representative.source).toBe('strava')
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
