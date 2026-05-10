// Types for the W4–W14 fitness pipeline. Mirrors the wire shapes documented
// in journal-server's docs/api.md § Fitness endpoints — the serialiser output
// of `api/fitness.py` and `api/ingestion.py`. snake_case is preserved on
// purpose, same convention as types/job.ts: faithful to the API contract
// matters more than local camelCase consistency for this narrow layer.

export type FitnessSource = 'strava' | 'garmin'

export type FitnessAuthStatus = 'ok' | 'broken' | 'unknown'

export type FitnessActivityType =
  | 'run'
  | 'ride'
  | 'swim'
  | 'walk'
  | 'hike'
  | 'strength'
  | 'other'

/** One row of `fitness_activities`. */
export interface FitnessActivity {
  id: number
  user_id: number
  source: FitnessSource
  source_id: string
  activity_type: FitnessActivityType
  source_subtype: string | null
  start_time: string
  local_date: string
  duration_s: number
  moving_time_s: number | null
  distance_m: number | null
  elevation_gain_m: number | null
  avg_hr_bpm: number | null
  max_hr_bpm: number | null
  avg_pace_s_per_km: number | null
  calories_kcal: number | null
  perceived_exertion: number | null
  extras: Record<string, unknown>
  raw_ref_id: number
  normalized_at: string
}

/** One row of `fitness_daily`. Garmin only at present. */
export interface FitnessDaily {
  id: number
  user_id: number
  source: FitnessSource
  local_date: string
  sleep_score: number | null
  sleep_duration_s: number | null
  sleep_efficiency_pct: number | null
  hrv_overnight_ms: number | null
  resting_hr_bpm: number | null
  body_battery_high: number | null
  body_battery_low: number | null
  stress_avg: number | null
  training_load_acute: number | null
  training_load_chronic: number | null
  training_readiness: number | null
  extras: Record<string, unknown>
  raw_ref_ids: number[]
  normalized_at: string
}

/** One element of `last_runs` in the sync-status response. */
export interface FitnessSyncRun {
  id: number
  started_at: string
  finished_at: string | null
  status: 'success' | 'auth_broken' | 'transient_failure' | 'running'
  rows_fetched: number
  rows_normalized: number
  error_class: string | null
  error_message: string | null
}

/** Per-source snapshot returned by GET /api/fitness/sync/status. */
export interface FitnessSourceStatus {
  auth_status: FitnessAuthStatus
  auth_broken_since: string | null
  last_success_at: string | null
  last_runs: FitnessSyncRun[]
}

/** Top-level shape of GET /api/fitness/sync/status. */
export interface FitnessSyncStatus {
  strava: FitnessSourceStatus | null
  garmin: FitnessSourceStatus | null
}

/** GET /api/fitness/integrity orphan report. */
export interface FitnessIntegrityReport {
  activities: Array<{ id: number; raw_ref_id: number }>
  daily: Array<{ id: number; raw_ref_ids: number[] }>
}

export interface FitnessActivitiesResponse {
  items: FitnessActivity[]
}

export interface FitnessDailyResponse {
  items: FitnessDaily[]
}

/**
 * Identifier for one canonical workout when the same activity exists in both
 * Strava and Garmin — see stores/fitness.ts dedup logic. `representative` is
 * the row chosen to surface (Strava preferred); `secondary_source_ids` are
 * the source-row ids that matched the representative within tolerance.
 */
export interface DedupedActivity {
  representative: FitnessActivity
  secondary_source_ids: Array<{ source: FitnessSource; source_id: string }>
}
