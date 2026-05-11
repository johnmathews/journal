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
  /**
   * Legacy total counts (workouts + wellness). Kept for backward compat
   * with rows persisted before T7 (2026-05-11). The per-bucket fields
   * below are the source of truth for the UI's split display.
   */
  rows_fetched: number
  rows_normalized: number
  /**
   * T7: per-bucket counts. Garmin populates both; Strava is workouts-only
   * so wellness_* are always 0. Rows persisted before the T7 migration
   * (2026-05-11) have 0 for all four fields — the UI presents that as "—"
   * rather than a misleading "0".
   */
  workouts_fetched: number
  wellness_fetched: number
  workouts_normalized: number
  wellness_normalized: number
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

// ── W8: multi-user connect/backfill flow types ────────────────────────
//
// Mirrors the wire shapes documented in journal-server's docs/api.md for
// the W2 (Garmin), W3 (Strava), and W5 (backfill) endpoints.

/**
 * Success shape returned by both Garmin connect/MFA endpoints and the
 * Strava OAuth exchange endpoint. `upstream_user_id` is the upstream
 * account identifier (Garmin `displayName` or Strava `athlete.id` as a
 * string) used for the D8 reconnect-with-different-account check.
 */
export interface ConnectedAccountResponse {
  connected: true
  upstream_user_id: string
}

/**
 * MFA-required branch of `POST /api/fitness/garmin/connect`. The opaque
 * `pending_session` is a CSRF token bound to the calling user for 10
 * minutes and must be presented back to `/api/fitness/garmin/connect/mfa`
 * with the 6-digit code.
 */
export interface GarminMfaPendingResponse {
  mfa_required: true
  pending_session: string
  expires_at: string
}

/**
 * Discriminated union: Garmin connect either succeeds outright or
 * returns an MFA challenge. Callers narrow on the presence of
 * `mfa_required` (or equivalently, the absence of `connected`).
 */
export type GarminConnectResponse =
  | ConnectedAccountResponse
  | GarminMfaPendingResponse

/** Success shape of `POST /api/fitness/garmin/connect/mfa`. */
export type GarminMfaResponse = ConnectedAccountResponse

/** Success shape of `POST /api/fitness/strava/exchange`. */
export type StravaExchangeResponse = ConnectedAccountResponse

/** Shape of `GET /api/fitness/strava/authorize_url`. */
export interface StravaAuthorizeUrlResponse {
  authorize_url: string
  state: string
  expires_at: string
}

/**
 * Shared shape returned by both `POST /api/fitness/garmin/disconnect`
 * and `POST /api/fitness/strava/disconnect`. `disconnected` is `true`
 * if a row was removed, `false` if the source was already disconnected
 * (idempotent).
 */
export interface DisconnectResponse {
  disconnected: boolean
}

/** Request body for `POST /api/fitness/backfill/{source}`. */
export interface FitnessBackfillRequest {
  start: string
  end?: string
}
