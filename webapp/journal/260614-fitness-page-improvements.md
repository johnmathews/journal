# Fitness page improvements (4 items)

**Date:** 2026-06-14

Four cohesive improvements to `/fitness`, from the project notes.

## What

1. **Workouts per week — Count ↔ Duration toggle.** Renamed the tile from "Distinct
   workouts per week" to "Workouts per week" and added a Count/Duration segmented toggle.
   The weekly bucketing now tracks both the distinct count and the summed `duration_s` per
   activity type; Duration mode stacks **hours per type** (`duration_s/3600`, "Hours" axis,
   `Xh Ym` tooltip) with the same colors.

2. **Selectable moving-average window (3/5/7).** Generalized `movingAverage3` →
   `movingAverage(values, window)` (centered, `movingAverage3` kept as a wrapper so existing
   callers/tests are untouched). A global `Smoothing: 3/5/7` selector (styled like the
   Range/Bin controls, persisted via `useStorage('fitness:maWindow', 3)`) re-renders the
   Sleep/HRV/RHR charts; the bold line's label tracks the window (`5-day avg`, etc.).

3. **On-page Garmin/Strava sync buttons.** Header "Sync Garmin"/"Sync Strava" buttons call
   the existing `store.startSync(source)` and then **watch the tracked job to a terminal
   state** (the `jobsStore.getJobById` + `isTerminal` pattern from `StorylineDetailView`).
   The button spins for the whole job lifecycle; on success the page data refreshes
   immediately (`reloadAll`), on failure an inline error links to Settings · Fitness. The
   watcher is per-source, guarded against double-clicks, and torn down on resolve and on
   unmount.

4. **Explain F/N.** Added a "F/N = Fetched / Normalized" caption + header tooltip in the
   Settings sync panel, where the F/N counts actually appear.

## Notes

- The view keeps its own `syncBusy` ref rather than the store's `triggeringSync`, because
  `triggeringSync` only covers the submit phase while the button must stay busy through the
  whole job run.
- `docs/chart-style-guide.md` updated to note the MA window is now user-selectable (default 3).
- Built directly with TDD (no formal spec/plan) per the same light process as the dashboard
  tooltip fix; reviewed by an independent agent (sync-watcher teardown, duration math, MA
  centering, test meaningfulness). Coverage held ≥85%.
