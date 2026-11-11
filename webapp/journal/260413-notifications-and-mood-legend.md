# Notification system and Grafana-style mood legend

**Date:** 2026-04-13

## Notification system for background jobs

Added a notification bell + dropdown to the AppHeader (top-right, next to the
theme toggle). It surfaces background job status from the existing jobs store:

- Bell icon with violet badge showing count of active (queued/running) jobs
- Dropdown lists all jobs sorted newest-first with status icon, label, and progress
- Running jobs with progress show `current/total`, failed jobs show error message
- Completed jobs auto-dismiss after 8 seconds, or can be manually dismissed
- Click-outside closes the dropdown

### Wiring: entry save → entity extraction → notification

The `setTimeout(() => loadEntryEntities(entryId), 5000)` hack from the cursor-fix
session was replaced with proper job tracking:

1. `updateEntryText` API now returns `entity_extraction_job_id` from the server
2. `saveEntryText` in the entries store extracts and returns the job ID
3. EntryDetailView calls `jobsStore.trackJob(id, 'entity_extraction', ...)` to
   register the server-created job and start polling
4. A watcher on the job reloads entity chips when extraction finishes
5. The notification dropdown shows the extraction progress in real time

New `trackJob` action added to the jobs store for registering externally-created
jobs (vs. `startEntityExtraction` which also submits the job).

## Grafana-style mood legend

Changed the mood dimension toggle buttons from "toggle off/on" to Grafana-style
"isolate series":

- **Default:** all dimensions visible
- **Click a dimension:** show ONLY that dimension (all others hidden at 40% opacity)
- **Click it again:** restore all dimensions
- **Click a different one while isolated:** switch isolation to the new one

Implementation is in `toggleMoodDimension()` in the dashboard store. The visual
change is replacing `line-through` with `opacity-40` for hidden dimensions.

## Mood chart: stable colors and no re-animation

- Series colors are now assigned by the dimension's index in the full
  `moodDimensions` list, not the filtered dataset index. Isolating "joy"
  no longer shifts it to index 0 / a different color.
- Y-axis fixed at [-1, +1] — already was in the code, added regression tests.
- Animation only runs on the first render (`moodChartRenderedOnce` flag).
  Toggling series, changing range/bin renders instantly with `animation: false`.

## Job History page

- New `/jobs` route with `JobHistoryView.vue` — paginated table of all
  historical jobs (type, status badge, params, created time, duration, details).
- Filters by status and type, refresh button, pagination.
- Backend: `GET /api/jobs` endpoint with `list_jobs()` on `SQLiteJobRepository`.
- Sidebar: "Job History" nav item with clock icon added as last item.
- Notification dropdown renamed from "Background jobs" to "Running jobs".

## Sidebar title collapse fix

- Title text now fades out when sidebar is collapsed on desktop using the
  same `lg:opacity-0 / lg:sidebar-expanded:opacity-100` pattern as nav labels.
- `lg:whitespace-nowrap` only when collapsed; `lg:sidebar-expanded:whitespace-normal`
  restores wrapping when expanded. Initial fix used bare `whitespace-nowrap` which
  prevented wrapping in expanded state — caught and fixed with regression tests.

## Test changes

- AppHeader, DefaultLayout, and App tests now provide Pinia (needed for AppNotifications)
- Dashboard store toggle tests rewritten for Grafana-style behavior
- DashboardView test updated from `line-through` to `opacity-40` assertion
- New AppNotifications component tests (bell, badge, dropdown, job entries, auto-dismiss)
- JobHistoryView tests (table, filters, pagination, error, status badges, all job labels)
- Jobs API client tests for `listJobs()` with params/no-params/filter
- Jobs store test for `trackJob` action
- Sidebar regression tests (title overflow-hidden, responsive nowrap, opacity fade, Job History link)
- Mood chart y-axis fixed at [-1, +1] tests (initial + after isolation)
- Mood chart animation test (first render animates, subsequent do not)
