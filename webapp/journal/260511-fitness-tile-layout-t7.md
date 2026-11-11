# Fitness tile-layout plan — T7 webapp side shipped

Date: 2026-05-11 (late). Plan (server-side):
[`server/docs/fitness-tile-layout-plan.md`](../../server/docs/fitness-tile-layout-plan.md)

## What landed

Webapp half of T7. Server side (migration 0026, fetch/normalize plumbing,
API serialisation) is in the server commit from the same session; this commit
just reads the new fields and renders them.

- `FitnessSyncRun` type adds `workouts_fetched`, `wellness_fetched`,
  `workouts_normalized`, `wellness_normalized` as required fields. TypeScript
  caught three existing fixtures that had to be updated — that's the value
  of `required` over `optional`: it would have been easy to keep them
  optional and let the UI silently render `undefined` somewhere.
- `FitnessSyncPanels` Recent-runs table is now source-aware:
  - **Strava panel** — single "Workouts F/N" column. Wellness is structurally
    zero for Strava, so the column is hidden rather than rendered as a
    confusing "0 / 0".
  - **Garmin panel** — "Workouts F/N" + "Wellness F/N" side-by-side.
- `formatCounts(run, source)` helper handles the pre-T7 fallback: if every
  new bucket field is `0` but the legacy `rows_fetched` / `rows_normalized`
  is non-zero, push the legacy total into the most-likely bucket (workouts
  for Strava, wellness for Garmin since wellness rows dominate Garmin syncs)
  and render the other bucket as `—`. This preserves the visible signal on
  rows persisted before the deploy.

## What I'd do differently

1. **Column-header text — `"Workouts F/N"` is terse.** Worth checking in
   person whether it reads cleanly. Alternative: two-line headers stacking
   "Fetched / Normalized" below "Workouts" or "Wellness". Defer until the
   user's review.
2. **The "—" fallback for one bucket per source is a soft heuristic, not
   a fact.** A Strava row with new bucket fields all 0 but legacy total > 0
   could in principle have come from a future code path that recorded
   wellness rows for Strava (which we don't). The heuristic is correct
   today; if Strava ever gains a wellness analogue, the helper needs
   updating. Flagged in the helper's comments.
3. **No store-level test for the per-bucket counts** — the store doesn't
   touch the per-bucket fields directly, it just passes them through from
   the API response. Adequate coverage today, but if any aggregation logic
   on those fields lands later, that's where the regression would slip.

## Cross-references

- Server counterpart: `../server/journal/260511-fitness-tile-layout-t1-t7.md`
- Plan: [`server/docs/fitness-tile-layout-plan.md`](../../server/docs/fitness-tile-layout-plan.md) — T7 now closed; T2–T6 pending in a fresh session.
