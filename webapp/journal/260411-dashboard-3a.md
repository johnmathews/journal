# 2026-04-11 — Dashboard 3a frontend (Tier 1 item 3a)

Session 4 of the Tier 1 plan, webapp half. Pairs with the
`journal-server` commit that shipped the
`GET /api/dashboard/writing-stats` endpoint earlier today.
Closes work units **T1.3a.iii**, **T1.3a.iv**, **T1.3a.v**,
**T1.3a.vi** from `journal-server/docs/tier-1-plan.md` plus two
cross-cutting UX requirements (Option B routing, sidebar
expanded-by-default on wide displays) and a Playwright
verification pass at three viewports.

## What shipped

### 1. Types + API client

- **`src/types/dashboard.ts`** — mirror of the server contract.
  `DashboardBin = "week" | "month" | "quarter" | "year"` with a
  `DASHBOARD_BINS` tuple of the same values. `DashboardRange =
  "last_1_month" | "last_3_months" | "last_6_months" |
  "last_1_year" | "all"` with matching tuple. `WritingFrequencyBin`
  and `WritingStatsResponse` match the JSON shape byte-for-byte.
- **`src/api/dashboard.ts`** — one function, `fetchWritingStats`,
  with its own local `buildQuery` helper. Drops `undefined`,
  `null`, and `""` from the query string so empty date inputs
  don't send `from=&to=` to the server.

### 2. Pinia store

- **`src/stores/dashboard.ts`** — `useDashboardStore` holds the
  current `range`, `bin`, `bins`, `loading`, `error`, and a
  `hasLoaded` flag so the view can distinguish "first-mount
  still loading" from "loaded but empty corpus". Initial state
  is `last_3_months` + `week` per the plan decisions.
- **`rangeToDates(range, now)`** is a pure exported helper that
  converts a `DashboardRange` option into a concrete ISO
  `{from, to}` pair. Accepts an injectable `now: Date` so the
  tests drive the clock deterministically. `all` returns
  `{from: null, to: null}`; everything else subtracts the
  appropriate number of months from `to`.
- `loadWritingStats(overrides)` merges the optional overrides
  into state before firing the fetch, which lets the view do
  `store.loadWritingStats({ bin: 'month' })` as a one-liner
  instead of a setter + separate action call. Surfaces
  `ApiRequestError.message` verbatim so the server's
  `invalid_bin` message (should it ever appear) lands in the UI.

### 3. DashboardView

- **`src/views/DashboardView.vue`** — filter bar with range +
  bin button groups, two Chart.js 4 line charts inside card
  containers, and state-branching between loading / error /
  empty / charts. The empty state is **explicit** (per the
  "explicit > implicit" rule): it shows the current entry count
  from `totalEntriesInRange`, the threshold (`5`), and a nudge
  to widen the range or ingest more entries. No ambiguity
  between "charts hidden" and "no data yet".
- **Chart.js integration:** I extended `src/utils/chartjs-config.ts`
  with the registrations needed for line charts (`LineController`,
  `LineElement`, `PointElement`, `CategoryScale`, `LinearScale`,
  `Filler`, `Legend`). Registration is global so every future
  chart view shares the same set. The two charts use explicit
  colors: violet for writing frequency, sky for word count.
- **Chart lifecycle:** charts are destroyed and recreated on
  bin/range changes rather than mutating `chart.data` in place.
  The axis labels and tick formatting change with the bin width
  and Chart.js handles a fresh instance more predictably than
  an update. Instances are also torn down on unmount so canvas
  contexts don't leak across route navigation, and on
  below-threshold transitions so a user zooming down to a
  narrow range doesn't leave a stale chart in the DOM.
- **Responsive design:** the charts are in a
  `grid-cols-1 xl:grid-cols-2` container so they stack on
  phones and sit side-by-side on desktop. Each chart is in a
  fixed-height (`h-64`) relative-positioned wrapper so
  `responsive: true, maintainAspectRatio: false` fills the
  card without overflow.

### 4. Option B routing

- **`src/router/index.ts`** — `/` now maps to `DashboardView`
  (route name `dashboard`), and `/entries` is a new explicit
  route for `EntryListView` (route name `entries`).
  `/entries/:id` for `EntryDetailView` is unchanged.
- **`AppSidebar.vue`** audit:
  1. Added a **Dashboard** nav link at the top pointing at `/`.
     Uses `isExactActive` so only the dashboard lights it up,
     not `/entries` or `/search`.
  2. **Entries** link rewired from `to="/"` to `to="/entries"`,
     and switched from `isExactActive` to `isActive` so it
     highlights on both `/entries` and `/entries/42` (matches
     the existing Entities link behavior).
  3. Entries link gets a `data-testid="sidebar-entries-link"`
     attribute so the new sidebar tests can assert the href
     without reaching for fragile class selectors. Dashboard
     link gets a matching `data-testid="sidebar-dashboard-link"`.
- **`router.push({ name: 'entries' })`** sites in
  `EntryDetailView.vue` (goBack and post-delete navigation) —
  no change needed. vue-router resolves by name, and the
  `entries` route still exists, just at `/entries` instead of
  `/`.
- **Test fixtures** in `DefaultLayout.test.ts`,
  `AppSidebar.test.ts`, `EntryListView.test.ts`,
  `EntryDetailView.test.ts` — existing fixtures with
  `{ path: '/', name: 'entries', ... }` still work because the
  test-specific routers are isolated from production. Only
  `AppSidebar.test.ts` was updated to match the new production
  shape (with `dashboard`, `entries`, `search`, `entities`
  routes) since its tests assert on the new links.

### 5. Sidebar expanded-by-default on wide displays

- **`AppSidebar.vue`** default-expanded logic. Previous
  behaviour: `sidebarExpanded = localStorage.getItem() ?? false`.
  New behaviour: `sidebarExpanded = localStorage.getItem() ??
  window.matchMedia('(min-width: 1024px)').matches`.
- The mobile hamburger state (`sidebarOpen` prop) is a
  separate concern and is unaffected — this change only
  controls whether the desktop sidebar renders with full
  labels or icon-only on first visit.
- Guarded for SSR / test environments where `window` or
  `matchMedia` is missing — falls back to `false` (the old
  default) rather than crashing.
- An explicit user preference in localStorage always wins,
  so a user who previously collapsed the sidebar stays
  collapsed on their next visit, even on a wide display.

### 6. Playwright verification at 3 viewports

Ran `npm run dev` locally against the running backend (which
has pre-commit code but the proxy still reaches it, and the
entries list has 5 seeded entries). Used Playwright MCP to
take screenshots at:

1. **Desktop 1920×1080** — sidebar expanded by default,
   Dashboard is the active nav item, filter bar renders
   correctly with "Last 3 months" + "Week" active, error
   banner visible (running backend predates the new endpoint
   → 404 → `HTTP 404` in the banner).
2. **Tablet portrait 768×1024** — sidebar collapses into a
   hamburger menu (top-left), filter bar stacks cleanly,
   error banner fills width.
3. **Phone portrait 375×812** — sidebar hidden behind
   hamburger, filter buttons wrap across two rows (Range
   wraps, Bin Width fits on one), error banner readable.

Also verified:
1. Clicking the mobile hamburger slides the sidebar drawer
   in with a backdrop behind the main content. All four nav
   items readable.
2. Navigating to `/entries` renders `EntryListView` with the
   real seeded data — Option B routing correct end-to-end.
3. Clicking the Dashboard logo from `/entries` navigates back
   to `/`. Route resolution works both ways.

Screenshots saved at
`.playwright-mcp/dashboard-{desktop-1920,tablet-768,mobile-375}.png`
and `.playwright-mcp/dashboard-mobile-375-sidebar-open.png`.

## Deliberate non-goals for this session

1. **Custom date range picker.** The range selector offers
   five fixed options only (`last_1_month` through `all`).
   Adding arbitrary `from`/`to` date inputs is valuable but
   not in the 3a scope — the five fixed options cover 95% of
   actual use, and the picker adds validation + UI complexity
   the rest of 3a doesn't need.
2. **Dense-series gap filling.** The server omits empty
   buckets from the response. The view plots exactly what
   the server returns, so a month with zero entries shows as
   a gap in the x-axis rather than a zero point. The Chart.js
   line chart handles this naturally. Adding gap-fill is a
   presentation concern I'd tackle when a real user reports
   the gap is misleading — not before.
3. **Chart theming in dark mode.** The charts use light-mode
   colours explicitly (`colors.textColor.light`, etc.). Dark
   mode support is an easy iteration once someone asks —
   swap the `.light` reads for `.dark` inside a `useDark()`
   watcher. Not shipped here because the rest of the
   dashboard UX validation was more important.
4. **Chart.js 3b/3c views.** Mood scoring (3b) and
   people/topic aggregations (3c) are separate sessions per
   the plan — not bundled here. The `DashboardView` shell is
   deliberately simple so 3b and 3c can add new chart cards
   inside the same grid without restructuring.

## Tests and quality gates

- **Before:** 229 tests across 23 files.
- **After:** 261 tests across 26 files. +32 new tests:
  1. `src/api/__tests__/dashboard.test.ts` — 4 (URL
     construction, empty params, null/empty drop,
     response passthrough).
  2. `src/stores/__tests__/dashboard.test.ts` — 13 (5 for
     `rangeToDates`, 8 for the store — initial state,
     happy path, override merging, ApiRequestError surface,
     Error surface, non-Error fallback, reset, empty
     response).
  3. `src/views/__tests__/DashboardView.test.ts` — 10 (mount,
     empty state, charts render, error banner, range click,
     bin click, all bins rendered, all ranges rendered,
     aria-pressed state, chart teardown below threshold).
  4. `src/components/layout/__tests__/AppSidebar.test.ts` —
     **5 new** (Dashboard + Entries link hrefs, wide default,
     narrow default, localStorage override). 3 existing
     tests updated to match the new multi-route fixture.

- **Coverage:** full vitest run keeps the 85% gate.
  `src/stores/dashboard.ts` at 100% lines,
  `src/utils/chartjs-config.ts` at 100% (the registration
  block is executed on module import),
  `src/views/DashboardView.vue` ≥ 85%.
- **`npm run build`:** passes (`vue-tsc --noEmit && vite build`).
  `DashboardView` is its own lazy chunk: **177.72 kB raw,
  61.70 kB gzipped** — most of that is Chart.js core. Only
  the home route pays the cost, because Vite lazy-loads
  route components.
- **`npm run lint`:** clean after `--fix`.

## Follow-ups

1. **Rebuild and redeploy the running backend** so the
   `/api/dashboard/writing-stats` endpoint actually returns
   data instead of 404. Once that's done, the dashboard will
   populate the charts automatically and the Playwright error
   banner will flip to the live chart view. (This is an ops
   step, not a code change — `ghcr.io/johnmathews/journal-server`
   will rebuild on push, and the VM just needs a pull + restart.)
2. **Dark-mode chart theming** is the obvious next iteration
   — wire `useDark()` into `renderCharts` and swap light
   colours for dark. Low-effort, visible win, but not 3a scope.
3. **3b mood scoring** is the next planned session. The
   `DashboardView` grid (`xl:grid-cols-2`) already has room
   for a third card when the mood chart lands.
