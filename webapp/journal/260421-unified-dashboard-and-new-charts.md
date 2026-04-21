# Unified dashboard and 4 new analytics charts

**Date:** 2026-04-21

## Unified Dashboard

Merged the separate `/insights` view into the Dashboard at `/`, eliminating ~1,300 lines of
duplicated code. The Dashboard and Insights views had significant overlap — duplicate stores,
duplicate helper functions, duplicate color palettes, and near-identical mood chart rendering.

### What changed
- Merged `useInsightsStore` into `useDashboardStore` (added entity distribution state)
- Combined all chart sections into `DashboardView.vue`: writing frequency, word count, mood
  trends (now with variance bands from Insights), and entity distribution doughnut
- Adopted the Insights view's sticky filter bar and variance-band mood chart (more informative)
- Capped the entity distribution legend at 8 items with "Show N more" expand/collapse
- Added `/insights` → `/` redirect for bookmark compatibility
- Removed the Insights sidebar link
- Deleted `InsightsView.vue`, `useInsightsStore`, and their test files

### Decision: single view over two
The two views existed because "insights" was conceived as a separate analytics page. In practice,
having the same filter controls on two views with overlapping charts was confusing. A single
unified dashboard with all charts under one sticky filter bar is simpler and more useful.

## 4 New Chart Panels

Added four new analytics charts to bring the dashboard total to 8 panels. This required
cross-cutting work: 4 new server API endpoints + frontend chart rendering + tests.

### Calendar heatmap
- GitHub-style contribution grid showing daily writing consistency
- Pure CSS grid (no Chart.js) — each cell colored by entry count (violet intensity)
- Shows streaks, gaps, weekday/weekend patterns at a glance
- Server: `GET /api/dashboard/calendar-heatmap` — simple GROUP BY entry_date

### Topic trends
- Multi-line chart showing how entity mentions change over time bins
- Entity type tabs (Topics, People, Places, etc.) — same as the doughnut chart
- Server: `GET /api/dashboard/entity-trends` — two-step query: find top N entities, then bin

### Mood-entity correlation
- Horizontal bar chart: avg mood score when each entity is mentioned
- Bars colored green/red relative to the overall average (shown as a dashed line)
- Dimension selector + entity type selector
- Server: `GET /api/dashboard/mood-entity-correlation` — joins mood_scores + entity_mentions

### Entry length distribution
- Histogram of word counts with configurable bucket size
- Summary stats (min, max, avg, median) displayed below
- Server: `GET /api/dashboard/word-count-distribution` — integer division bucketing

## Files changed

### journal-server
- `src/journal/models.py` — 5 new dataclasses
- `src/journal/db/repository.py` — 4 new repository methods + Protocol signatures
- `src/journal/api.py` — 4 new route handlers

### journal-webapp
- `src/utils/chartjs-config.ts` — registered BarController + BarElement
- `src/types/dashboard.ts` — 12 new types
- `src/api/dashboard.ts` — 4 new fetch functions
- `src/stores/dashboard.ts` — new state/actions for all 4 endpoints
- `src/views/DashboardView.vue` — 4 new chart sections (~840 lines added)
- Tests: 947 total (up from 894), coverage above 85% thresholds
