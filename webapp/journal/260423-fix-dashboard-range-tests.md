# Fix tests after default dashboard range change

After changing the default chart range from `all` to `last_3_months` in commit 62bea4b,
two tests expected the old default and failed. CI was red.

## Changes

- Updated `dashboard.test.ts` initial-state test to expect `last_3_months`
- Updated `DashboardView.test.ts` aria-pressed assertion to check `last_3_months` button
- Added 14 targeted tests across 4 files to close a branch-coverage gap (84.6% -> 85.0%):
  - `entities.test.ts`: non-Error rejection fallbacks, null survivor merge, falsy pagination params
  - `settings.test.ts`: null-settings guards for updateRuntime/updatePricing, null output cost,
    empty pricing array, category fall-through
  - `entries.test.ts`: `updateDate` success, Error rejection, non-Error rejection
  - `search.test.ts`: empty-params query string
