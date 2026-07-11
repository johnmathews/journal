# 1. Job History — configurable columns, tiles removed

**Date:** 2026-07-11 · **Branch:** `feat/jobs-column-tool`

Follow-up to the same-day jobs throughput/observability work. Two changes driven by user feedback on the deployed `/jobs` view.

## 1.1 Why

The per-page summary tiles ("Cost / Input / Output (this page)") were confusing — read as "cost *per page*" — and a page-scoped sum isn't a useful metric. More importantly, the per-job In/Out/Cost columns were appended at positions 7–9 and scrolled off the right edge, so the metric the user actually wanted (cost *per job*) was effectively invisible.

## 1.2 What shipped

1. **Removed the three summary tiles** and their `totalInputTokens`/`totalOutputTokens`/`totalCost` computeds.
2. **Added a column show/hide + reorder tool**, reusing `EntryListView`'s pattern verbatim: a "Columns" button opening a menu with per-column checkboxes + drag handles + "Reset to defaults". The column engine is identical (`ColumnDef[]`, `COLUMN_MAP`, `columnVisibility`/`columnOrder` refs, `visibleOrderedColumns`, drag handlers, outside-click close, debounced persist + merge-with-defaults load). Preferences persist per-user to the server under the `job_list_columns` key via `@/api/preferences` (the preferences PATCH accepts arbitrary keys, so no server change was needed).
3. **Default layout** orders columns `type, status, In, Out, Cost, entry, created, duration, params, details` and default-hides `params` (raw `{ }`), so per-job cost is visible without horizontal scrolling out of the box. Users can rearrange freely.

## 1.3 Key implementation note

`EntryListView` renders cells as plain text (`{{ cellValue(col, entry) }}`), but the jobs table has rich cells — type/status badges, the running `animate-spin` spinner + live counting-up duration, entry `RouterLink`, the `JobParamsCell`, and the expandable details `<dl>`. So the column *engine* was reused wholesale, but cells are rendered via a per-`col.key` `v-if` chain inside `<td v-for="col in visibleOrderedColumns">` rather than a text renderer, preserving all existing cell markup, behaviour, and `data-testid`s. Header order, cell order, and visibility are all driven by `visibleOrderedColumns`.

## 1.4 Testing

Existing positional cell-index assertions (`cells[2]/[3]/[5]`) were rewritten to locate cells by `data-testid` (columns are now dynamic and reorderable, and `params` is hidden by default). Removed the totals-tile tests; kept/adapted the live-duration/spinner/poll/unmount tests. Added a column-tool suite mirroring EntryListView's: menu toggle, checkbox show/hide, reset, drag reorder, and prefs load/save against a mocked `@/api/preferences`. `npm run test:unit`: 1950 passed (68 in JobHistoryView). Coverage above the 85% gate on all metrics (branches 85.60%). Lint + build clean.

## 1.5 Minor deviations from the EntryListView pattern

- Dropped `sortTestId` from `ColumnDef` (the jobs table has no column sorting); headers use a `col-header-<key>` testid instead.
- Numeric columns stay left-aligned to match the existing jobs-table look rather than right-aligning as EntryListView does.
