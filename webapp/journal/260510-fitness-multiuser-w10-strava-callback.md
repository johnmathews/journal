# W10 — Strava OAuth callback view

Date: 2026-05-10
Plan: `../server/docs/fitness-multiuser-plan.md` §5 W10.

## What shipped

1. `src/views/StravaCallbackView.vue` — landing page for Strava's
   OAuth redirect. Reads `code` / `state` / `error` from the query
   string, calls `exchangeStravaCode`, then redirects back to
   `/settings#fitness` with optional `?strava_error=<reason>` on
   failure. Renders a transient "Connecting Strava…" spinner while the
   exchange is in flight; the page never lingers because the redirect
   fires from `onMounted`.
2. Route registration in `src/router/index.ts` for
   `/settings/fitness/strava/callback` → `StravaCallbackView` (named
   `strava-callback`). Authenticated by default — public routes are
   tagged with `meta.public: true`, and this view is not.
3. Inline surfacing in `FitnessConnectionsPanel.vue` for the
   `?strava_error=<reason>` query param. Without this the failure
   redirect would be silent — the user would land back on settings
   with a flash error in the URL bar and no visible UI feedback. The
   panel maps known reason codes to friendly copy and falls back to
   a generic message for unknown reasons.

## State-machine recap (across W3 → W8 → W9 → W10)

```
StravaConnectionCard               StravaCallbackView          FitnessConnectionsPanel
  click "Connect Strava"
    │
    ├── getStravaAuthorizeUrl()  ─────────────────────────▶ (server mints state)
    │
    └── window.location = authorize_url
                                              user grants/denies on strava.com
                                                      │
                                       /settings/fitness/strava/callback?
                                          code=…&state=…       (granted)
                                              OR
                                          error=access_denied  (denied)
                                                      │
                                       ┌──────────────┴──────────────┐
                                       │                             │
                          exchangeStravaCode(code,state)        skip exchange
                                       │                             │
                          ┌────────────┴───────────┐                 │
                          │                        │                 │
                       success                  failure              │
                          │                        │                 │
              /settings#fitness     /settings#fitness?strava_error=<reason>
                          │                        │                 │
                          └────────────────────────┴─────────────────┘
                                                   │
                                       Panel reads route.query.strava_error
                                       and shows the corresponding message,
                                       or refreshes sync status on a clean
                                       redirect and renders the connected card.
```

## Reason-code mapping (callback view → panel)

The callback view passes through `reason` codes from the server's
exchange endpoint (per `server/docs/api.md`):

| Server reason / source         | URL param value              | Panel copy                                                   |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------ |
| Strava `?error=access_denied`  | `access_denied`              | "Strava connection cancelled — you denied authorization."    |
| 410 `expired_pending_state`    | `expired_pending_state`      | "The Strava authorization expired before it could complete." |
| 403 `cross_user_pending_session` | `cross_user_pending_session` | "That Strava authorization belongs to another account."      |
| 409 `upstream_account_mismatch`  | `upstream_account_mismatch`  | "The returning Strava account differs from the one currently connected. Disconnect first." |
| client: missing `code`/`state`   | `missing_params`             | "Strava did not return an authorization code."               |
| client: any other exception      | `exchange_failed`            | "Strava connection failed."                                  |
| unknown                          | `<as-is>`                    | "Strava connection failed: \<reason\>."                      |

The view never surfaces a stack trace or HTTP status — only the
machine-readable `reason` is forwarded. The fallback `exchange_failed`
covers transport errors and ApiRequestErrors that don't carry a
`reason` body.

## Test coverage

- `StravaCallbackView.test.ts` (8 cases):
  - pending spinner state while exchange is in flight,
  - happy path (code+state → redirect to `/settings#fitness`),
  - `?error=` (user denied) → forwarded as-is,
  - missing `code` or `state` → `missing_params`,
  - 403 cross-user replay → `cross_user_pending_session`,
  - 410 expired state → `expired_pending_state`,
  - non-ApiRequestError fall-through → `exchange_failed`,
  - duplicate `?code=a&code=b` (array query value) → `missing_params`.
- `FitnessConnectionsPanel.spec.ts` (4 new cases on top of the existing
  5): `access_denied` copy, `expired_pending_state` copy, unknown
  reason fallback, no-banner-when-clean-redirect.

Total project tests: 1432 → 1444 (+12). Coverage stays above the 85%
thresholds (statements 91.48%, branches 85.18%, functions 89.04%,
lines 93.58%).

## Plan-vs-code drift

Minor: the plan said "redirect to /settings#fitness on success" — Vue
Router treats hash and query as separate fields on `RouteLocationRaw`,
so the actual call is `router.replace({ path: '/settings', hash:
'#fitness', query: { strava_error: '…' } })`. The rendered URL ends
up as `/settings?strava_error=…#fitness`. The user-visible behaviour
matches the plan.

## Scope notes

- The view assumes the user is already authenticated. Strava's OAuth
  bounce will fail upstream if the session has expired (cookies don't
  survive the round trip differently than any other endpoint), and the
  exchange endpoint will return 401, which surfaces as a generic
  `exchange_failed` error. The router guard already redirects 401s to
  `/login`; W14's manual run-through is the natural moment to verify
  that path end-to-end.
- The Strava developer-app redirect URI still needs to match the
  webapp's actual production hostname — that's W13 (operator step),
  not in scope here.
- The panel's `strava_error` banner does not auto-clear when the user
  retries Connect; it persists until the next navigation that drops
  the query string. Acceptable: the banner is informational, and the
  card's own redirecting spinner takes over the moment Connect is
  clicked again.
