# Insights Page

## What changed

New `/insights` route with sidebar navigation, combining mood analysis with entity-based analytics.

### Mood Trends with Variance Bands
- Replicates the dashboard mood chart but adds min/max variance bands — semi-transparent filled regions between the minimum and maximum individual entry scores in each time bin. This reveals whether a week's average score represents consistent entries or wild fluctuation.
- `MoodTrendBin` type extended with `score_min` and `score_max` fields.
- Chart.js implementation uses paired boundary datasets (invisible lines for min/max) with `fill: '-1'` between them.

### Mood Drill-Down
- Click any data point on the mood chart to open an inline panel showing the individual journal entries that contributed to that period's average score.
- Each entry shows its date, individual score (color-coded green/red), and a rationale — a 1-2 sentence explanation from the LLM about why that score was given.
- Clicking an entry row navigates to EntryDetailView.
- The drill-down panel dismisses on filter changes or when clicking the same data point again.

### Entity Distribution (What I Write About)
- Doughnut chart showing entity mention frequency, filterable by type: Topics, Activities, Places.
- HTML legend beside the chart lists each entity with its mention count.
- New `fetchEntityDistribution()` API client calling `GET /api/dashboard/entity-distribution`.

### Architecture
- New `useInsightsStore` Pinia store (independent from dashboard store) with its own range/bin state, mood trends, drill-down, and entity distribution.
- New `src/types/insights.ts` and `src/api/insights.ts`.
- `ArcElement` and `DoughnutController` registered in `chartjs-config.ts`.
- Sidebar link with bar chart icon between Entities and Job History.

### Tests
- 31 new webapp tests: API client (7), store (18), view (7), sidebar (1).
- All 877 tests passing, build clean.
