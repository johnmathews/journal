# Fix flaky AbortError test failures — block real network in unit tests

**Date:** 2026-07-13

## Symptom

`npm run test:coverage` intermittently exited 1 with unhandled
`DOMException [AbortError]` rejections even though all 1888 tests passed.
Stray `GET http://localhost:3000/api/jobs/... 404` lines appeared in stderr.

## Root cause

Several tests spied on jobs-store actions with `vi.spyOn(store, 'trackJob')`
**without** `.mockImplementation`, so the real action ran and started the
store's polling loop. happy-dom's `fetch` performs *real* HTTP requests
against the environment's default origin (`http://localhost:3000`) — which on
this machine happens to be a Docker container answering 404. The poll loop
schedules 1s retries, so fetches were still in flight when the test
environment tore down; happy-dom aborts them, and the `AbortError` rejections
surfaced as vitest "unhandled errors". Whether the run failed depended on
whether a rejection landed inside a test window — hence the flake.

## Fix (two layers)

1. **Guard (defense-in-depth):** new `vitest.setup.ts` (registered via
   `setupFiles`) replaces `globalThis.fetch` with a stub that rejects and an
   `afterEach` that fails the offending test with the leaked URLs. This turned
   the intermittent flake into deterministic, attributable failures.
2. **Fix the leaks the guard exposed** (35 tests across 7 files, most passing
   silently before because the poll loop swallows fetch errors):
   - `TextEntryPanel.spec.ts`, `entities.test.ts` — `trackJob` spies now use
     `.mockImplementation(() => {})`.
   - `AppHeader.test.ts`, `DefaultLayout.test.ts` — mock `@/api/jobs`
     (`AppNotifications` calls `hydrateActiveJobs()` on mount); DefaultLayout
     also mocks `@/api/fitness` (`FitnessAuthBanner` hydrates sync status).
   - `FitnessView.test.ts` — mock `@/api/preferences` (the fitness store's
     `loadLayout()` fetches user preferences).
   - `FitnessBackfillForm.spec.ts`, `FitnessSyncPanels.spec.ts` — stub
     `@/stores/jobs` (both flows register jobs via the real `trackJob`).

## Outcome

Full suite green (1888/1888) across three consecutive coverage runs, no
AbortErrors, no network dependence. Unit test results no longer vary with
whatever service happens to listen on port 3000. Documented in
`docs/development.md` § Testing.
