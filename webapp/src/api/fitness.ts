import { apiFetch } from './client'
import type { JobSubmissionResponse } from '@/types/job'
import type {
  FitnessActivitiesResponse,
  FitnessDailyResponse,
  FitnessSource,
  FitnessSyncStatus,
  FitnessIntegrityReport,
  FitnessActivityType,
} from '@/types/fitness'

function buildQuery(
  params: Record<string, string | number | undefined | null>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  )
  if (entries.length === 0) return ''
  return (
    '?' +
    new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
  )
}

export interface FetchActivitiesParams {
  start: string
  end: string
  type?: FitnessActivityType
}

/**
 * Activities (run/ride/swim/walk/hike/strength/other) in a `[start, end]`
 * inclusive window. Both `start` and `end` are required `YYYY-MM-DD`. Both
 * sources contribute; cross-source dedup is the caller's responsibility
 * (see stores/fitness.ts).
 */
export function fetchActivities(
  params: FetchActivitiesParams,
): Promise<FitnessActivitiesResponse> {
  const query = buildQuery({
    start: params.start,
    end: params.end,
    type: params.type,
  })
  return apiFetch<FitnessActivitiesResponse>(`/api/fitness/activities${query}`)
}

export interface FetchDailyParams {
  start: string
  end: string
}

/**
 * Daily wellness rollups (sleep, HRV, resting HR, body battery, stress,
 * training load/readiness). Garmin-only today.
 */
export function fetchDaily(
  params: FetchDailyParams,
): Promise<FitnessDailyResponse> {
  const query = buildQuery({ start: params.start, end: params.end })
  return apiFetch<FitnessDailyResponse>(`/api/fitness/daily${query}`)
}

/** Per-source snapshot — auth status, last_success_at, last 10 sync runs. */
export function fetchSyncStatus(): Promise<FitnessSyncStatus> {
  return apiFetch<FitnessSyncStatus>('/api/fitness/sync/status')
}

/**
 * Queue a fetch+normalize job for `source`. Returns the job id immediately;
 * caller polls via the existing jobs store. The server dedupes against an
 * in-flight job per (user, source) and may return `already_running: true`,
 * which we surface unchanged.
 */
export interface FitnessSyncJobResponse extends JobSubmissionResponse {
  already_running?: boolean
}

export function triggerSync(
  source: FitnessSource,
): Promise<FitnessSyncJobResponse> {
  return apiFetch<FitnessSyncJobResponse>(
    `/api/fitness/sync/${encodeURIComponent(source)}`,
    { method: 'POST' },
  )
}

/** Soft-pointer orphan report. Empty arrays mean a clean DB. */
export function fetchIntegrity(): Promise<FitnessIntegrityReport> {
  return apiFetch<FitnessIntegrityReport>('/api/fitness/integrity')
}
