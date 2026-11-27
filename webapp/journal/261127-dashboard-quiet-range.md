# Dashboard: opening on a range with enough entries

> Purpose: why the dashboard's first load can now move off "Last 3 months", and what was checked first.

## 1. The report

Prod's home page said "Not enough data yet". The account (user 1) has 77 entries, the newest on
16 Oct 2026. Running the server's own `get_writing_frequency(..., "week", user_id=1)` on prod
through a read-only connection gave 2 entries (1 week) for the last 3 months and 77 (28 weeks)
for all time. So "All time" draws the charts and the empty card was behaving as coded: not a
bug. The "115 entries" figure counts all 3 users. The range isn't persisted, so every visit
opened on "Last 3 months".

## 2. The decision

Four options on `brand/design-system/mockups/261127-dashboard-empty-state`. John picked C: on the
first load only, a default range under 5 entries widens to the shortest range with 5 or more,
with an `accent-tint` note and a link back. A, B (buttons in the empty card) and D (drop the
threshold) were the alternatives.

## 3. How it works

- `useDashboardStore().loadInitialWritingStats()` loads the current range, then tries each wider
  range in `DASHBOARD_RANGES` order with a real request, so the counts are exact. Worst case is 3
  extra requests, only when the default range is sparse.
- When no range reaches 5 (a new account) it restores the start range and its bins, and the
  empty card shows as before.
- An error on the first request stops it and leaves the run un-armed, so the next mount retries.
- `widenedFrom` drives the note. Any explicit range change clears it; a bin change keeps it.
- Tests freeze the clock at 2026-11-27 and use prod's real per-range counts.

## 4. Left as is

- `reset()` sets the range to `'all'`, unlike the `'last_3_months'` initial value. A test pins it
  and it predates this change, so it stays.
- The range is still not remembered between visits.
