// Types for the W4–W14 fitness pipeline. Mirrors the wire shapes documented
// in journal-server's docs/api.md § Fitness endpoints — the serialiser output
// of `api/fitness.py` and `api/ingestion.py`. snake_case is preserved on
// purpose, same convention as types/job.ts: faithful to the API contract
// matters more than local camelCase consistency for this narrow layer.

import type { NamedWidth } from './tiles'

export type FitnessSource = 'strava' | 'garmin'

export type FitnessAuthStatus = 'ok' | 'broken' | 'unknown'

export type FitnessActivityType =
  | 'run'
  | 'ride'
  | 'swim'
  | 'walk'
  | 'hike'
  | 'row'
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
  /**
   * Garmin only: true iff an encrypted password is saved server-side AND
   * is currently decryptable (i.e. `FITNESS_CREDENTIAL_KEY` is set and
   * matches). Absent/false for Strava and for servers without credential
   * storage enabled.
   */
  credentials_saved?: boolean
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

/**
 * Response of `POST /api/fitness/garmin/reconnect` (login with saved
 * server-side credentials). Wire shapes are identical to the connect
 * endpoint: outright success, or an MFA challenge whose
 * `pending_session` is completed via the same
 * `/api/fitness/garmin/connect/mfa` endpoint. Failure cases (404
 * `no_saved_credentials`, 409 `credentials_unavailable`, 429 rate
 * limits) surface as ApiRequestError with a `reason` in the body.
 */
export type GarminReconnectResponse = GarminConnectResponse

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

// ── /fitness tile layout (T2/T3 — adopt dashboard's TileGrid) ──────────

export type FitnessTileId =
  | 'weekly-distinct'
  | 'sleep'
  | 'hrv'
  | 'rhr'
  | 'recent-workouts'

export interface FitnessTileDef {
  id: FitnessTileId
  title: string
  /**
   * Default named width. `/fitness` runs on a 6-column grid: `third` =
   * span 2, `half` = span 3, `full` = span 6. Three thirds in a row
   * matches the side-by-side daily-wellness layout the user accepted in
   * F1–F8, so the byte-equivalent visual is preserved when the user has
   * no saved layout yet.
   */
  defaultWidth: NamedWidth
  testId: string
}

export const FITNESS_TILES: readonly FitnessTileDef[] = [
  {
    id: 'weekly-distinct',
    title: 'Distinct workouts per week',
    defaultWidth: 'full',
    testId: 'fitness-tile-weekly-distinct',
  },
  {
    id: 'sleep',
    title: 'Sleep score',
    defaultWidth: 'third',
    testId: 'fitness-tile-sleep',
  },
  {
    id: 'hrv',
    title: 'HRV overnight',
    defaultWidth: 'third',
    testId: 'fitness-tile-hrv',
  },
  {
    id: 'rhr',
    title: 'Resting heart rate',
    defaultWidth: 'third',
    testId: 'fitness-tile-rhr',
  },
  {
    id: 'recent-workouts',
    title: 'Recent workouts',
    defaultWidth: 'full',
    testId: 'fitness-tile-recent-workouts',
  },
] as const

export const DEFAULT_FITNESS_TILE_ORDER: readonly FitnessTileId[] =
  FITNESS_TILES.map((t) => t.id)

/**
 * Layout state persisted under the `fitness_layout` key on the
 * preferences blob. Shape mirrors `DashboardLayout` from
 * `types/dashboard.ts` but with named widths because `/fitness` offers
 * three choices on its 6-column grid.
 */
export interface FitnessLayout {
  tileOrder: FitnessTileId[]
  hiddenTiles: FitnessTileId[]
  tileWidths?: Partial<Record<FitnessTileId, NamedWidth>>
}

/**
 * Width cycle order for the resize button on a `/fitness` tile.
 * Clicking the button advances to the next entry, wrapping back to the
 * start at the end.
 */
export const FITNESS_WIDTH_CYCLE: readonly NamedWidth[] = [
  'third',
  'half',
  'full',
] as const

/** CSS `grid-column` mapping for the 6-column fitness grid. */
export function fitnessWidthToGridColumn(w: NamedWidth): string {
  if (w === 'full') return '1 / -1'
  if (w === 'half') return 'span 3'
  return 'span 2'
}

/**
 * Human-readable label for the next width the resize button will set.
 * Used as the button's `title` attribute so hover discloses the
 * upcoming state.
 */
export function nextFitnessWidthLabel(current: NamedWidth): string {
  const idx = FITNESS_WIDTH_CYCLE.indexOf(current)
  const next = FITNESS_WIDTH_CYCLE[(idx + 1) % FITNESS_WIDTH_CYCLE.length]
  const labels: Record<NamedWidth, string> = {
    third: 'Third width',
    half: 'Half width',
    full: 'Full width',
  }
  return labels[next]
}
