import { apiFetch } from './client'
import type { JobSubmissionResponse } from '@/types/job'
import type {
  FitnessActivitiesResponse,
  FitnessDailyResponse,
  FitnessSource,
  FitnessSyncStatus,
  FitnessIntegrityReport,
  FitnessActivityType,
  GarminConnectResponse,
  GarminMfaResponse,
  GarminReconnectResponse,
  StravaAuthorizeUrlResponse,
  StravaExchangeResponse,
  DisconnectResponse,
  FitnessBackfillRequest,
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

// ── W8: multi-user connect / OAuth / backfill client functions ────────
//
// One typed wrapper per W2/W3/W5 server endpoint. Response shapes match
// the JSON bodies documented in journal-server's docs/api.md verbatim.
// Errors (cool-down 429, expired pending session, upstream-account
// mismatch 409, etc.) surface via apiFetch's ApiRequestError envelope —
// these functions deliberately do not bake in retry/backoff. UX
// decisions belong to the W9 settings panel.

export interface ConnectGarminParams {
  username: string
  password: string
}

/**
 * Begin the Garmin per-user login. Returns either an immediate success
 * shape or an MFA-pending shape — model the union by narrowing on
 * `'mfa_required' in response`. The plaintext password is consumed once
 * by the server; servers with credential storage enabled also keep an
 * encrypted copy so `reconnectGarmin` can re-login without re-entry.
 */
export function connectGarmin(
  params: ConnectGarminParams,
): Promise<GarminConnectResponse> {
  return apiFetch<GarminConnectResponse>('/api/fitness/garmin/connect', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export interface SubmitGarminMfaParams {
  pending_session: string
  code: string
}

/**
 * Complete a Garmin MFA login using the `pending_session` token from a
 * prior `connectGarmin` call plus the 6-digit code. The pending session
 * is consumed on success and on a cross-user replay 403; expired or
 * unknown tokens are 410. The webapp surfaces both as ordinary errors.
 */
export function submitGarminMfa(
  params: SubmitGarminMfaParams,
): Promise<GarminMfaResponse> {
  return apiFetch<GarminMfaResponse>('/api/fitness/garmin/connect/mfa', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/**
 * Re-login to Garmin using the credentials saved (encrypted) server-side
 * by a previous connect — no request body, the user never re-types their
 * password. Same response union as `connectGarmin`: outright success or
 * an MFA challenge to complete via `submitGarminMfa`. Failures surface
 * as ApiRequestError: 404 `no_saved_credentials`, 409
 * `credentials_unavailable` (rotated/unset key), and the same 429
 * rate-limit shapes as connect.
 */
export function reconnectGarmin(): Promise<GarminReconnectResponse> {
  return apiFetch<GarminReconnectResponse>('/api/fitness/garmin/reconnect', {
    method: 'POST',
  })
}

/**
 * Delete the calling user's Garmin auth state. Idempotent — a request
 * with no existing row returns `{disconnected: false}`. Historical
 * activity/daily rows are preserved.
 */
export function disconnectGarmin(): Promise<DisconnectResponse> {
  return apiFetch<DisconnectResponse>('/api/fitness/garmin/disconnect', {
    method: 'POST',
  })
}

/**
 * Mint a Strava OAuth authorize URL plus a one-shot CSRF state token
 * bound to the calling user for 10 minutes. The SPA redirects the
 * browser to `authorize_url`; Strava redirects back to
 * `/settings/fitness/strava/callback?code=&state=`, which is then
 * exchanged via `exchangeStravaCode`.
 */
export function getStravaAuthorizeUrl(): Promise<StravaAuthorizeUrlResponse> {
  return apiFetch<StravaAuthorizeUrlResponse>(
    '/api/fitness/strava/authorize_url',
  )
}

export interface ExchangeStravaCodeParams {
  code: string
  state: string
}

/**
 * Complete the Strava OAuth flow: server validates `state`, exchanges
 * `code` for refresh/access tokens, captures the upstream `athlete.id`,
 * and persists into `fitness_auth_state`. State is single-use — a
 * replay after consume returns 410.
 */
export function exchangeStravaCode(
  params: ExchangeStravaCodeParams,
): Promise<StravaExchangeResponse> {
  return apiFetch<StravaExchangeResponse>('/api/fitness/strava/exchange', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/**
 * Delete the calling user's Strava auth state. Idempotent — same
 * semantics as `disconnectGarmin`.
 */
export function disconnectStrava(): Promise<DisconnectResponse> {
  return apiFetch<DisconnectResponse>('/api/fitness/strava/disconnect', {
    method: 'POST',
  })
}

/**
 * Queue a historical fitness backfill for `source` over `[start, end]`
 * (end defaults to today UTC on the server when omitted). Shares
 * spanning idempotency with `triggerSync`: at most one fetch job
 * (sync or backfill) per `(user, source)` is in flight, and a request
 * that finds an in-flight peer returns its `job_id` plus
 * `already_running: true`.
 */
export function triggerBackfill(
  source: FitnessSource,
  body: FitnessBackfillRequest,
): Promise<FitnessSyncJobResponse> {
  // The server accepts `end` as optional and defaults to today (UTC).
  // Omit the key entirely rather than sending `null`/empty string —
  // the API client never sends fields the request type doesn't declare.
  const payload: FitnessBackfillRequest = { start: body.start }
  if (body.end !== undefined) payload.end = body.end
  return apiFetch<FitnessSyncJobResponse>(
    `/api/fitness/backfill/${encodeURIComponent(source)}`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}
