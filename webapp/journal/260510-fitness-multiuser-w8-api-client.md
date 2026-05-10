# W8 — webapp API client functions for the multi-user fitness flows

Date: 2026-05-10
Plan: `../server/docs/fitness-multiuser-plan.md` §5 W8.

## What shipped

Seven typed client functions on `src/api/fitness.ts`, plus the matching
type defs on `src/types/fitness.ts`:

1. `connectGarmin({ username, password })` → `GarminConnectResponse`
   (discriminated union of `ConnectedAccountResponse` and
   `GarminMfaPendingResponse`).
2. `submitGarminMfa({ pending_session, code })` → `GarminMfaResponse`
   (aliased to `ConnectedAccountResponse`).
3. `disconnectGarmin()` → `DisconnectResponse`.
4. `getStravaAuthorizeUrl()` → `StravaAuthorizeUrlResponse`.
5. `exchangeStravaCode({ code, state })` → `StravaExchangeResponse`
   (aliased to `ConnectedAccountResponse`).
6. `disconnectStrava()` → `DisconnectResponse`.
7. `triggerBackfill(source, { start, end? })` → `FitnessSyncJobResponse`
   (re-used the existing type used by `triggerSync` — same `job_id` /
   `status` / optional `already_running` shape).

Tests in `src/api/__tests__/fitness.test.ts` cover one happy-path call
per function, plus extra cases for: the `connectGarmin` union (both
branches narrow correctly), `triggerBackfill` body shape with and
without `end`, and the `already_running` flag pass-through.

## Plan-vs-code drift

Worth recording for W9/W10:

1. **The Strava authorize URL endpoint is `GET /api/fitness/strava/authorize_url`,
   not `POST /strava/authorize-url`.** The brief had it wrong on both
   method and path (underscore vs hyphen). The server route in
   `server/src/journal/api/fitness.py:833-836` confirms the GET +
   underscore form; `server/docs/api.md` documents it the same way.
   `getStravaAuthorizeUrl` is therefore a GET — no body, no method
   override, since `apiFetch` defaults to GET.
2. **All "success with upstream account" responses share one shape.** Garmin
   `/connect` (no-MFA branch), Garmin `/connect/mfa`, and Strava
   `/exchange` all return exactly `{ connected: true, upstream_user_id }`.
   Modelled as a single `ConnectedAccountResponse` interface with
   `GarminMfaResponse` and `StravaExchangeResponse` as aliases. Easier to
   evolve later (e.g. if Strava starts returning a `scopes` field, only
   that alias diverges).
3. **Disconnect responses are identical between sources** — shared
   `DisconnectResponse` rather than two parallel types. Server
   docs confirm both return `{ disconnected: boolean }` with the same
   idempotent semantics.
4. **Discriminated union on `mfa_required`-presence, not on a literal
   discriminator.** The success branch has no `mfa_required` key at all,
   so callers narrow with `if ('mfa_required' in response)` (which
   TypeScript handles correctly for unions where one branch has the key
   and the other doesn't). The W9 settings panel will branch on this.

## Things deliberately not done

- No FitnessConnectionsPanel.vue (W9), no StravaCallbackView.vue (W10),
  no Pinia store changes, no banner copy changes, no env-var work.
- No retry/backoff in the client functions. The Garmin cool-down 429 and
  the upstream-account-mismatch 409 both surface through `apiFetch`'s
  `ApiRequestError` envelope — the W9 panel decides UX.
- No webapp doc updates. The webapp's `docs/` (architecture / auth /
  deployment / development) doesn't currently document the fitness
  client surface — the server repo's `docs/api.md` is the canonical
  reference for endpoint shapes, and W8 doesn't add any new
  user-facing UI to document. W9 may want a short panel/feature note.

## Tests + coverage

- 1392 tests passing (was 1380; +12 new tests in `fitness.test.ts`).
- `src/api/fitness.ts` per-file coverage: 92.3% statements / 80%
  branches / 100% functions / 100% lines. The single uncovered branch
  is the pre-existing `entries.length === 0` early-return in
  `buildQuery`, not new code.
- Project-wide thresholds (≥85%) all clear: statements 91.56%,
  branches 85.18%, functions 88.82%, lines 93.66%.
- `npm run lint`, `npm run test:coverage`, `npm run build` all green.

## Follow-ups for W9

- The W9 panel should narrow `connectGarmin`'s response by checking
  `'mfa_required' in response` — TypeScript will flow-type both
  branches without an extra cast.
- The cross-user 403 from `submitGarminMfa` and the cool-down 429 from
  `connectGarmin` both come through as `ApiRequestError`; the panel
  needs copy for each `reason` (`cross_user_pending_session`,
  `expired_pending_session`, `invalid_mfa_code`,
  `post_mfa_profile_fetch_failed`, `upstream_account_mismatch`,
  `invalid_credentials`).
- The Strava callback view (W10) just calls `exchangeStravaCode(code,
  state)` with the query params and routes to a success/error toast +
  back to settings.
