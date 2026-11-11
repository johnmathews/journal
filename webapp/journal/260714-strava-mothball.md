# Strava UI hidden behind server-driven strava_enabled flag (W2 of strava-mothball plan)

**Date:** 2026-07-14

## 1. Context

Strava paywalled Standard-tier API access (~$11.99/mo effective 2026-06-30);
no subscription is held and Garmin already covers all activities. The server
mothballed its Strava wiring behind `STRAVA_ENABLED=false` (journal-server W1
— routes 404, scheduler and CLI Garmin-only). This session made the webapp
follow the flag instead of showing dead Strava buttons.

## 2. Flag consumption pattern

1. **Backend-driven, no client env var.** `ServerSettings.features` gains
   `strava_enabled: boolean` (from `GET /api/settings`), mirroring the
   existing `mood_scoring` flag.
2. **`settingsStore.ensureLoaded()`** — new store action that loads settings
   at most once: joins an in-flight `load()` (SettingsView's eager load, or a
   sibling panel's) via a store-scoped in-flight promise, resolves immediately
   when settings are already present, and retries on the next call after a
   failed load. Co-mounted fitness panels each call it; one fetch results.
3. **Fail-closed.** Every reader computes
   `settingsStore.settings?.features.strava_enabled ?? false` — before
   settings load, or if the load fails, Strava is treated as disabled, which
   matches the server default. No flash of Strava UI on slow connections.

## 3. What is hidden when the flag is off

- **FitnessConnectionsPanel** (Settings → Fitness) — `StravaConnectionCard`
  is not rendered; the `?strava_error=<reason>` query handling is skipped so
  a stale error param can't surface UI for a mothballed integration.
- **FitnessSyncPanels** — sources collapse from `['strava','garmin']` to
  `['garmin']`; only the Garmin sync/backfill panel renders.
- **FitnessView** (`/fitness`) — the Strava on-page sync button and its
  per-source error slot are gone (`syncSources` is Garmin-only); the header
  subtitle and the dedup caption drop the Strava wording.
- **StravaCallbackView** — awaits `ensureLoaded()`, then redirects straight
  to `/settings#fitness` without calling the exchange API (the server 404s
  it anyway).

## 4. What is preserved

1. **Historical Strava activities still render** — the activities table,
   `dedupActivities`, and source badges are untouched; the server keeps
   serving `source='strava'` rows.
2. **`GET /api/fitness/sync/status` contract unchanged** — the server keeps
   both source keys, so the fitness store needed no changes.
3. **Mothballed components keep their tests** — `StravaConnectionCard` and
   `StravaCallbackView` stay in-tree with specs running against them directly
   (coverage thresholds are global). New specs cover both flag states via the
   `src/__tests__/fixtures/server-settings.ts` fixture.

## 5. Fresh-setup hint fix

The `/fitness` empty-state ("No fitness data yet") wrongly told users to run
`journal fitness-reauth-strava`. It now links to Settings → Fitness
(`data-testid="fitness-fresh-setup-connect-link"`) for the Garmin connect
flow, then `journal fitness-backfill` on the server — accurate whether or not
Strava is ever revived.

## 6. Revival

Nothing to do client-side: when the server ships
`features.strava_enabled: true` (operator sets `STRAVA_ENABLED=true` + OAuth
creds and restarts), all Strava UI reappears automatically. See the server
repo's `docs/fitness-operations.md` § Reviving Strava.
