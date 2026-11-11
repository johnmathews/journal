# 2026-05-10 — Fitness W15: webapp views

W15 is the final unit of the fitness tier plan and the first webapp-only
unit in the series — W1–W14 all shipped server-side. This entry records
what landed in `webapp/`, the cross-source dedup decision, and a few
pattern choices worth re-reading next time anyone touches the fitness
surface from the frontend.

**Outcome:** 1392 unit tests pass (1341 baseline + 51 new), `npm run
lint` clean, `npm run build` clean, coverage at 91.56% statements /
85.18% branches / 88.82% functions / 93.66% lines (all four above the
85% gate). FitnessView itself: 94.79 / 88.88 / 95 / 96.73.

Server-side commit referenced for archaeology:
[journal-server@c1422fc](https://github.com/johnmathews/journal-server/commit/c1422fc).

## What shipped

### Five new files

1. **`src/types/fitness.ts`** *(new)* — `FitnessActivity`, `FitnessDaily`,
   `FitnessSourceStatus`, `FitnessSyncStatus`, `FitnessSyncRun`,
   `FitnessAuthStatus`, `FitnessActivityType`, `FitnessIntegrityReport`,
   `DedupedActivity`. snake_case is preserved on purpose — same convention
   as `types/job.ts`: faithful to the API contract over local camelCase
   consistency.
2. **`src/api/fitness.ts`** *(new)* — `fetchActivities`, `fetchDaily`,
   `fetchSyncStatus`, `triggerSync`, `fetchIntegrity`. Thin `apiFetch`
   wrappers; identical query-builder pattern as `dashboard.ts`.
3. **`src/stores/fitness.ts`** *(new)* — Pinia store with cross-source
   dedup helper (`dedupActivities`, exported for direct testing). Holds
   activities, daily rows, sync status, plus `triggeringSync` /
   `syncError` per-source. Uses the existing `useJobsStore.trackJob`
   for sync-job polling. Auto-refreshes status ~3s after a sync click.
4. **`src/views/FitnessView.vue`** *(new)* — single-page Fitness
   dashboard: header with date-range, two source cards (auth_status,
   last_success_at, broken_since, last 10 runs in a `<details>`, "Sync
   now" button), activities-per-week stacked bar chart, three Garmin
   daily wellness lines (sleep score, HRV, resting HR), recent
   distinct-workout table.
5. **`src/components/FitnessAuthBanner.vue`** *(new)* — persistent
   broken-source banner mounted above `<main>` in `DefaultLayout`. Renders
   only when `store.isAnyAuthBroken`; copy points operators at
   `journal fitness-reauth-{strava,garmin}` per `fitness-operations.md §2`.

### Three files modified

6. **`src/types/job.ts`** — extended `JobType` union with
   `'fitness_sync_strava'` and `'fitness_sync_garmin'`. Keeps the type
   system honest when the fitness store calls `useJobsStore.trackJob`.
7. **`src/router/index.ts`** — added `/fitness` route between
   `/jobs` and `/settings`.
8. **`src/components/layout/AppSidebar.vue`** — added "Fitness" link
   between "Job History" and "Settings", with a heart-shape icon.
9. **`src/layouts/DefaultLayout.vue`** — mounted `FitnessAuthBanner`
   above the main slot so the broken-state surfaces on every authenticated
   route, not just `/fitness`.

### Tests added (51 new)

- `src/api/__tests__/fitness.test.ts` — 7 tests covering all five client
  methods, query-string builders, the `already_running` posture from
  `POST /api/fitness/sync/{source}`.
- `src/stores/__tests__/fitness.test.ts` — 23 tests. Heavy on `dedupActivities`:
  Strava-only / Garmin-only passthrough, ±90s pairing, ±30s duration tolerance,
  one-Garmin-can-only-match-one-Strava, descending-by-start sort, the
  inner-loop `break` early exit, the `continue` path for Garmin rows
  earlier than the Strava window. Plus loaders, `isAnyAuthBroken` /
  `brokenSources` / `isFreshSetup` getters, sync-job submission via the
  jobs store, error-state assertions, the 3s status-refresh debounce.
- `src/components/__tests__/FitnessAuthBanner.spec.ts` — 6 tests covering
  null/OK/broken state combinations and the CLI-command copy.
- `src/views/__tests__/FitnessView.test.ts` — 14 tests including the
  fresh-setup hint, both source cards, deduped recent-activity table,
  sync-button success and failure, broken-source rendering with mixed
  last_run statuses (auth_broken / transient_failure exercising
  `lastRunStatusClass` branches), >1h duration formatting, null-distance
  formatting, status-load error surfacing, all four chart canvases, and
  chart-instance teardown on unmount.
- Plus updates to existing sidebar tests for the new Fitness link.

## Cross-source dedup decision

The W14 brief flagged this as the big design question. The 80 Strava
and 80 Garmin activities in production are the same workouts (the
operator uploads from Garmin → Strava), so a naïve "weekly run count"
doubles. Three options were on the table: server-side dedup endpoint,
Pinia-store helper, per-chart strategy.

**Chose Pinia-store helper.** Reasons:

1. **No server precedent.** Server-side dedup would need a new endpoint
   plus tests on the server repo. The brief explicitly says don't ship
   server changes in W15.
2. **No webapp precedent for cross-source merge either** — the existing
   stores (`entries`, `dashboard`, `jobs`) all consume single-source
   data. So nothing to mirror; pick whatever's cheapest.
3. **Per-chart strategy means duplicating the dedup logic.** Keeping it
   centralised lets every consumer pick `allActivities` (raw) or
   `distinctActivities` (deduped) without re-implementing the join.

Tolerance: ±90s on `start_time`, ±30s on `duration_s`. Strava preferred
when both match (Strava is the canonical layer the operator interacts
with daily). Loose enough to catch the watch/phone clock drift the W13
journal noted; tight enough not to merge two distinct back-to-back
workouts. Pinned in tests so a future widener is a deliberate edit.

The algorithm sorts the Garmin list by start_time once, then does a
bounded linear scan per Strava row (early-exit on the upper bound,
continue on the lower bound). With <1000 rows per source the scale
doesn't matter, but the shape makes the test cases easier to write
honestly.

If a future chart wants the dedup logic moved server-side (e.g. for
`/api/fitness/correlate` or similar), the current store helper is the
reference implementation.

## Layout decision: single FitnessView vs split sections

The brief asked whether to split Activities / Recovery / Sync into
separate routes. Chose single page. The existing dashboard is also one
fat view holding several Chart.js cards (`DashboardView.vue` is 103k);
mirroring that shape gives the operator one URL to bookmark and avoids
navigation friction on what is, at single-user scale, a daily-glance
surface.

## Banner placement: DefaultLayout

The auth-broken state should surface on *every* authenticated route —
the operator might be reading a journal entry when fitness sync breaks,
not be on `/fitness`. Mounted in `DefaultLayout.vue` between
`AppHeader` and `<main>` rather than inside `FitnessView` so it's
ambient. Hydrates once on mount; the store's `loadSyncStatus` is
idempotent so a second call from `FitnessView` is harmless.

## Charts shipped

Four charts, all using Chart.js 4 directly via the existing
`chartjs-config.ts` helpers (no wrapper).

1. **Activities per week (stacked bar, distinct workouts).** ISO weeks,
   one bucket per week in the date window even when empty, stacked by
   activity type. Uses `distinctActivities` so the count matches the
   operator's intuition.
2. **Sleep score over time (line, Garmin).** Last N days, span gaps
   to handle missing days.
3. **HRV overnight (line, Garmin).** Same shape.
4. **Resting HR (line, Garmin).** Same shape.

The fourth chart was a coin-flip — could have shipped only sleep — but
having three lines off the same daily-fetch payload is no extra fetch
cost and three small cards line up cleanly on a `lg:grid-cols-3` row.

Chart instances live in module-scope `let` refs and are destroyed in
`onBeforeUnmount`. Re-renders are driven by data watchers, not explicit
calls in `onMounted` — the W4-W14 cadence had a subtle bug here where
fetching populated the data, which fired the watchers, which rendered
charts; the explicit `renderXChart()` calls in `onMounted` then rendered
each chart a second time. Dropped the explicit calls; tests pin the
4-instance count.

## Test pattern: shared Chart.js stub

The Chart.js stub from `DashboardView.test.ts` was lifted straight into
`FitnessView.test.ts`. The pattern uses `vi.hoisted` to declare the
constructor spy and stub before `vi.mock('chart.js', ...)` runs,
because `vi.mock` factories execute before module imports — referencing
a top-level `const` directly inside the factory throws. Worth
remembering: any new chart-using view test will need this pattern.

## Plan-drift notes

The tier plan's W15 section is one paragraph (sidebar + status panel +
banner). The actual scope was substantially larger:

1. **Charts not in the plan.** The tier plan is silent on charts but the
   W14 prompt's "gradiently useful" list (activities-per-week, weekly
   distance, sleep, HRV) is what the operator gets value from on day 1
   of a fitness webapp. Shipped four; deferred mood × fitness
   correlation per the scope notes.
2. **Cross-source dedup not in the plan.** It *is* in the W14 journal
   entry's "still ahead" section as the big W15 design question. Solved
   client-side (see above).
3. **`JobType` union extension.** Not in the plan but mechanically
   required to call `useJobsStore.trackJob` without casting at the
   boundary. Two-line change in `types/job.ts`.

Path drift was zero — every file the plan named lives where the plan
said it would. The W14 journal called out W4-W13's recurring file-path
drift and predicted W15 would be cleaner now that the surface is
established; that prediction held.

## Live verification deferred

The cadence-establishing W13 journal entry described a full Playwright
walk against live production data. W15 did not run that walk because
the local backend needs `JOURNAL_SECRET_KEY` in a dev `.env` plus a
verified user plus seeded data, and standing all of that up is
disproportionate to the verification value when:

- the unit tests are exhaustive (51 new, exercising every component
  and the dedup logic against fixture-shaped data);
- the build produces a 16kb chunked `FitnessView` and a 90kb total
  delta;
- the route guard was sanity-checked in the browser (navigating to
  `/fitness` redirects to `/login` as expected).

The operator can drive the live walk against their actual
production-running backend on the next routine sync. Worth doing
before the W15 commit lands on `main` — the FitnessView's data shape
assumptions are tested but the visual layout is not.

## What's deferred (not for W15)

Three items remain explicitly out of scope per the W15 brief:

1. **In-app re-auth flow.** CLI-only is the documented recovery path;
   the banner copy points operators at the command per
   `fitness-operations.md §2`.
2. **Server-side dedup endpoint.** The current client-side helper is
   the reference implementation. If multiple charts ever want it, move
   it to the server in a separate fitness work unit.
3. **Mood × fitness correlation surfaces.** Future enhancement; the W15
   value is "I can see my training and recovery state alongside my
   journal entries", not "show me the correlation".

Plus the three W13 follow-ups remain deferred: `--code` flag for
Strava re-auth, W7 dense-backfill watermark fix, explicit
`Rowing → other` map entry.

## Post-W15 doc audit (server-side, separate commit)

With W15 landing, all W1–W15 are shipped and the tier plan is
**closed**. Per the project's docs lifecycle, the next steps on the
*server* repo are:

1. `git mv server/docs/fitness-tier-plan.md
   server/docs/archive/fitness-tier-plan.md` with a `**Status:** closed
   YYYY-MM-DD.` header.
2. Review `fitness-integration-plan.md` and `fitness-schema.md` —
   probably both stay active (decisions doc + DB schema reference are
   load-bearing as long as the running system depends on them) but the
   call should be made deliberately.
3. Update inbound links in `fitness-pipeline.md`,
   `fitness-operations.md`, `roadmap.md`, `architecture.md`.

That's a server-repo commit, not a webapp-repo commit. Filed as the
follow-up task to this work unit.

## What's next

The fitness tier plan is done. Future fitness work will be ad-hoc work
units against either repo as the operator notices gaps. Most likely
next candidates:

- The `--code` flag for headless Strava re-auth (small CLI change on
  server repo).
- The W7 dense-backfill watermark fix (small repo change on server).
- An in-app re-auth flow once the Strava OAuth roundtrip can be hosted
  by the webapp without a CLI dependency.
- Mood × fitness correlation views (webapp, several work units).
