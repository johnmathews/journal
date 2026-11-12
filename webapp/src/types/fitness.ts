// Fitness types. The response shapes of the `/api/fitness/*` routes are
// generated from the server's API contract
// (server/src/journal/api/contract/schemas.py); the backfill request body,
// the client-side dedup shape and the `/fitness` tile layout stay
// hand-written below. snake_case is preserved on purpose: faithful to the
// API contract matters more than local camelCase consistency here.
//
// - Numeric metrics follow the server's SQLite columns, but all arrive as
//   TS `number`. Every value is nullable except ids, `duration_s` and the
//   sync-run counters.
// - `FitnessSourceStatus.credentials_saved` is sent for Garmin only.
// - `DivergenceSummary` omits a quadrant that has no days.
// - Garmin connect and reconnect return either `ConnectedAccountResponse`
//   or an MFA challenge (`GarminMfaPendingResponse`); narrow on
//   `'mfa_required' in response`.

import type { NamedWidth } from './tiles'
import type {
  ConnectedAccountResponse,
  FitnessActivity,
  FitnessSource,
  GarminConnectResponse,
} from './generated/api'

export type {
  ConnectedAccountResponse,
  DisconnectResponse,
  DivergenceQuadrant,
  DivergenceResponse,
  DivergenceRow,
  DivergenceSummary,
  FitnessActivitiesResponse,
  FitnessActivity,
  FitnessActivityOrphan,
  FitnessActivityType,
  FitnessAuthStatus,
  FitnessDaily,
  FitnessDailyOrphan,
  FitnessDailyResponse,
  FitnessIntegrityReport,
  FitnessSource,
  FitnessSourceStatus,
  FitnessSyncJobResponse,
  FitnessSyncRun,
  FitnessSyncRunStatus,
  FitnessSyncStatus,
  GarminConnectResponse,
  GarminMfaPendingResponse,
  MoodRecoveryResponse,
  MoodRecoveryRow,
  StravaAuthorizeUrlResponse,
} from './generated/api'

/** Success shape of `POST /api/fitness/garmin/connect/mfa`. */
export type GarminMfaResponse = ConnectedAccountResponse

/**
 * Response of `POST /api/fitness/garmin/reconnect` (login with saved
 * server-side credentials): the same union as connect. Failures (404
 * `no_saved_credentials`, 409 `credentials_unavailable`, 429 rate limits)
 * surface as ApiRequestError with a `reason` in the body.
 */
export type GarminReconnectResponse = GarminConnectResponse

/** Success shape of `POST /api/fitness/strava/exchange`. */
export type StravaExchangeResponse = ConnectedAccountResponse

/** Request body for `POST /api/fitness/backfill/{source}`. */
export interface FitnessBackfillRequest {
  start: string
  end?: string
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

// ── /fitness tile layout (T2/T3 — adopt dashboard's TileGrid) ──────────

export type FitnessTileId =
  | 'mood-fitness'
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
    id: 'mood-fitness',
    title: 'Training load vs. how I feel',
    defaultWidth: 'full',
    testId: 'fitness-tile-mood-fitness',
  },
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
