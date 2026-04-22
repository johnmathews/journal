# Dynamic dashboard descriptions and heatmap fill-width

**Date:** 2026-04-22

## Summary

Improved the dashboard chart panel descriptions to be dynamic and context-aware, and made the
Writing Consistency heatmap fill its tile width intelligently.

## Changes

### Dynamic chart descriptions

All 7 dashboard chart tiles now display descriptions that reflect the current range and bin width
selections instead of static text. A `rangePhrase` computed maps the selected range to a
human-readable phrase (e.g., "over the last 6 months", "across all time"). Charts that use bin
width also interpolate `store.bin` (e.g., "grouped per week").

### Heatmap fills tile width

The Writing Consistency calendar heatmap now expands backward in time to fill the available tile
width. Previously, selecting "Last 3 months" would render ~13 weeks of cells with blank space on
the right. Now it measures the container width via `useElementSize` from VueUse and calculates how
many week columns fit, extending the start date backward accordingly. The selected range acts as a
minimum bound.

### Heatmap data independence from range selector

The heatmap API fetch is now driven by a `heatmapDateRange` computed that calculates the visible
date range from container width. This means the heatmap always shows accurate data for every
visible day, regardless of the range selector. Switching between "Last 3 months" and "Last 6
months" no longer causes previously-colored days to go grey.

A watch on the stringified `heatmapDateRange` re-fetches data when the visible range changes (from
range selector changes or window resizes crossing a 21px column boundary).

### Responsive heatmap description

The Writing Consistency description dynamically reflects the actual visible span: "Daily word count
over the last 15 months." at wide viewports, "Daily word count over the last 8 months." when
narrower. A `heatmapSpanLabel` computed derives the human-readable duration from `heatmapDateRange`.

### Scrollbar fix

Removed the persistent horizontal scrollbar below the heatmap by changing the content container
from `overflow-x-auto` to `overflow-hidden`. The grid is now sized to fit within the container, so
overflow is not expected.

## Files changed

- `src/views/DashboardView.vue` — all description updates, heatmap computeds, watch, ref placement,
  overflow fix
- `src/stores/dashboard.ts` — `loadCalendarHeatmap` now accepts optional `{from, to}` params

## Decisions

- The heatmap ref was moved to the always-rendered `<section>` element (rather than the conditional
  content div) so the container width is available before data loads, avoiding a double-fetch on
  initial page load.
- The watch uses a stringified key (`"from|to"`) to avoid triggering on every computed
  re-evaluation when the values haven't actually changed.
- For "all time" with no data bounds known ahead of time, the expanded start is calculated purely
  from container width.
