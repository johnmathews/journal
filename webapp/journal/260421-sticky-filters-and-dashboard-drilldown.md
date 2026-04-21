# Sticky filter bar and dashboard mood drill-down

**Date:** 2026-04-21

## Sticky filter bar fix

The range/bin-width picker on /insights had `sticky top-0`, which caused it to slide under the
sticky header (`sticky top-0 z-30`, h-16). Changed to `sticky top-16` so it sits below the
header when scrolling.

## Dashboard mood chart drill-down

The mood trends chart on /insights supported clicking data points to see which entries
contributed to the score (date, score, rationale table). The same chart on the dashboard (home
page) did not support this. Now both are consistent.

Changes:
- Added drill-down state (drillPeriod, drillDimension, drillEntries, drillLoading, drillError)
  and actions (loadDrillDown, clearDrillDown, periodEndDate) to the dashboard store
- Added onClick handler to the dashboard mood chart
- Added the drill-down panel UI below the dashboard chart (same markup as insights)
- Added tests for loadDrillDown and clearDrillDown in the dashboard store

## Files changed

- `src/views/InsightsView.vue` — sticky top-0 → top-16
- `src/views/DashboardView.vue` — onClick handler, drill-down panel, helper functions
- `src/stores/dashboard.ts` — drill-down state, actions, periodEndDate
- `src/stores/__tests__/dashboard.test.ts` — two new tests
