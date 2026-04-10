# 2026-04-10 — Test coverage setup and maximization

Second session of the day, after the Mosaic migration merged. Three distinct
pieces of work: wiring up coverage reporting, pushing coverage as high as was
practical without writing bad tests, and gating CI on the result.

## Scope of the session

1. Install `@vitest/coverage-v8` and configure it in `vitest.config.ts` with
   reasonable excludes.
2. Add a `test:coverage` npm script and document it in CLAUDE.md and
   `docs/development.md`.
3. Push coverage from the 64% baseline to the mid-90s by writing tests for
   every module that had obvious gaps.
4. Enforce a minimum coverage threshold in CI and upload the HTML report as a
   GitHub Actions artifact.
5. Extend `.gitignore` to cover standard secret file patterns (`*.key`,
   `*.pem`, `credentials.json`). This one was surfaced by the previous `/done`
   run and landed before the coverage work started.

## Why this was worth doing now

When the migration landed earlier today, the full test suite was 28 tests
covering the data layer and a couple of smoke tests on the views. The layer
that changed most in the migration — the shell components and the rewritten
views — had no real coverage at all, which meant the "28/28 green" confidence
signal was weaker than it looked.

Adding coverage reporting surfaces the asymmetry. Writing targeted tests for
the gaps converts that asymmetry into real confidence. Gating CI locks the
result in as a baseline so future changes can't silently erode it.

## Key decisions

### `@vitest/coverage-v8`, not istanbul

Vitest supports two providers. The V8 provider uses Node's built-in coverage
instrumentation, is faster, and is the default recommendation in the Vitest
docs. Istanbul is more accurate for certain JSX/TSX edge cases but slower and
needs an extra transform step. For a Vue 3 + TS project with SFCs, v8 is the
right default.

### CSS-first configuration, global thresholds (not per-file)

Thresholds live under `test.coverage.thresholds` with four keys: `statements`,
`branches`, `functions`, `lines`. Vitest treats positive values as "minimum
percent required" and fails the run if any metric drops below. I set them at
90/85/90/90 — a few points below the current baseline (96/91/97/98) so
incidental drift during a refactor doesn't flicker CI red, but a real
regression (dropping a whole test file, adding an untested feature) will fail
the build and block the Docker image.

I considered per-file thresholds (via a glob under `thresholds`) but rejected
them. Per-file gating would fail the build as soon as `EntryDetailView.vue`
drops below 90% — which it currently is (86.36%) because the
`onBeforeRouteLeave` guard is genuinely difficult to test without a
router-view wrapper and isn't worth the test plumbing. A global threshold
averages across the whole tree and accepts that one file can be imperfect as
long as the suite as a whole stays strong.

### Coverage thresholds slightly below the baseline, not at it

Setting the threshold equal to the current number creates a ratchet that
breaks on every tiny reformatting. Setting it 5-8 points below gives room to
absorb "added three uncovered lines during a refactor" without a CI failure,
while still catching "deleted the entire sidebar test file" (which would drop
everything ~10 points). When a legitimate refactor drops a metric close to
its threshold, the right move is to bump the threshold up or down
deliberately, not let it erode silently.

### What I did not test, and why

Three things were deliberately left uncovered:

1. **`EntryDetailView.vue` `onBeforeRouteLeave` guard** (~7 lines). Testing
   requires mounting the component inside `<router-view>` so vue-router
   registers the guard against the active matched route. Direct `mount()`
   leaves the guard un-registered. The test plumbing to set this up roughly
   doubles the test file size for 7 lines of gain. Documented with an inline
   comment in the test file.

2. **`src/stores/entries.ts` `|| 20` fallback branches** in the `totalPages`
   and `currentPage` computed properties. These branches only fire if
   `currentParams.limit` is exactly 0 or undefined, which neither the UI nor
   the API contract produces. Manufacturing the test requires directly
   mutating store state to values that would otherwise be invalid.

3. **`AppSidebar.vue` defensive-null branches and viewport-dependent spans**.
   Most of the remaining uncovered lines are `if (!body) return` guards and
   `lg:block` / `sidebar-expanded:hidden` CSS-driven elements that happy-dom
   doesn't exercise meaningfully.

These gaps are documented in the journal so future-me knows they were
considered, not missed.

## Numbers

### Before (baseline, pre-coverage setup)

No coverage tooling installed. `npm run test:unit` ran 28 tests with no
coverage output.

### After step 1 (setup + mosaic tests)

| Metric     | Coverage | Tests |
| ---------- | -------- | ----- |
| Statements | 70.18%   | 40    |
| Branches   | 64.36%   |       |
| Functions  | 59.70%   |       |
| Lines      | 71.31%   |       |

Adding 12 tests for `mosaic.ts` (adjustColorOpacity across hex/hsl/oklch and
error cases, plus `getCssVariable` trim behavior) pushed it from 0% to 100%.

### After step 2 (data layer gaps)

| Metric     | Coverage | Tests | Δ stmts |
| ---------- | -------- | ----- | ------- |
| Statements | 72.00%   | 53    | +1.82   |
| Branches   | 70.21%   |       | +5.85   |
| Functions  | 62.68%   |       | +2.98   |
| Lines      | 72.86%   |       | +1.55   |

13 new tests: store error paths (loadEntry, saveEntryText with and without
Error instances), hasEntries/currentPage/param merging, api client non-JSON
fallback, method/body forwarding, composable reset-with-null-entry.

### After step 3 (layout tests)

| Metric     | Coverage | Tests | Δ stmts |
| ---------- | -------- | ----- | ------- |
| Statements | 79.63%   | 69    | +7.63   |
| Branches   | 79.78%   |       | +9.57   |
| Functions  | 76.11%   |       | +13.43  |
| Lines      | 80.62%   |       | +7.76   |

Four new test files (ThemeToggle, AppHeader, AppSidebar, DefaultLayout).
AppSidebar was the biggest: click-outside, ESC, expand button, mount/unmount,
body class toggling, localStorage persistence. Had one fumble where two
buttons both carried `aria-controls="sidebar"` and my DefaultLayout test
matched the wrong one — fixed by scoping the selector to `header button[...]`.

### After step 4 (view tests)

| Metric     | Coverage | Tests | Δ stmts |
| ---------- | -------- | ----- | ------- |
| Statements | 89.09%   | 88    | +9.46   |
| Branches   | 88.29%   |       | +8.51   |
| Functions  | 92.53%   |       | +16.42  |
| Lines      | 90.31%   |       | +9.69   |

The biggest single jump. 19 new tests across EntryListView and
EntryDetailView: pagination button behavior, row click navigation, error and
empty states, save success and error paths, dirty tracking, Modified badge
rendering, beforeunload handler. Required `enableAutoUnmount(beforeEach)` on
the detail view tests to prevent `beforeunload` listeners from leaking
between tests — a bug that produced a false-positive pass-then-fail sequence
until I traced it.

### After step 5 (chartjs-config tests)

| Metric     | Coverage | Tests | Δ stmts |
| ---------- | -------- | ----- | ------- |
| Statements | 96.00%   | 98    | +6.91   |
| Branches   | 91.48%   |       | +3.19   |
| Functions  | 95.52%   |       | +2.99   |
| Lines      | 97.67%   |       | +7.36   |

`chartjs-config.ts` had been sitting at 0% because nothing in the project
imported it yet — none of the views use Chart.js. Just importing the module
in a test covers the module-level side effects (Chart.register(Tooltip),
Chart.defaults mutation). Adding tests for `chartAreaGradient` (all four
null-return cases, gradient creation math, colorStop application order) and
`getChartColors` (shape check, CSS-var reading, opacity adjustment on the
derived gridColor dark variant) pushed the file to ~100%.

One gotcha: `getChartColors` calls `adjustColorOpacity(getCssVariable('--color-gray-700'), 0.6)`,
and happy-dom returns an empty string for unset CSS variables, which causes
`adjustColorOpacity` to throw. The fix was a `beforeEach` that seeds
`--color-gray-700` on `document.documentElement.style`.

### After step 6 (DefaultLayout close handler)

| Metric     | Coverage | Tests |
| ---------- | -------- | ----- |
| Statements | 96.36%   | 99    |
| Branches   | 91.48%   |       |
| Functions  | 97.01%   |       |
| Lines      | 98.06%   |       |

DefaultLayout had been stuck at 50% functions because the inline
`@close-sidebar="sidebarOpen = false"` handler was never triggered. Added one
test that opens the sidebar via the hamburger, then dispatches ESC on
`document` to make the child Sidebar emit `close-sidebar`, verifying the
parent's handler flips sidebarOpen back.

### Final

**99 tests passing across 13 test files. Coverage: 96.36% statements,
91.48% branches, 97.01% functions, 98.06% lines.**

## CI gating

Wiring thresholds into CI was the last step and the one that locks everything
in place. Three changes:

1. **`vitest.config.ts`:** added `coverage.thresholds` with the 90/85/90/90
   values. Vitest exits non-zero if any metric drops below, which fails the
   test job.

2. **`.github/workflows/ci.yml`:** swapped `npm run test:unit` for
   `npm run test:coverage`, and added an `actions/upload-artifact@v4` step
   (with `if: always()`) that uploads the `coverage/` directory as
   `coverage-report` with 14-day retention.

3. **`docs/development.md`:** documented the thresholds table, the CI gating,
   and how to download the coverage artifact from a past run.

The Docker job already had `needs: test`, so coverage regressions now block
the image from being built and published — same gate as a failing unit test.

Verified the first run after enabling this (CI run `24237714644`): test job
green in 23s, docker job green in 27s, coverage artifact uploaded.

## Files changed in this session

### New
- `src/utils/__tests__/mosaic.test.ts`
- `src/utils/__tests__/chartjs-config.test.ts`
- `src/components/layout/__tests__/ThemeToggle.test.ts`
- `src/components/layout/__tests__/AppHeader.test.ts`
- `src/components/layout/__tests__/AppSidebar.test.ts`
- `src/layouts/__tests__/DefaultLayout.test.ts`

### Modified
- `package.json`, `package-lock.json` — added `@vitest/coverage-v8`, added
  `test:coverage` script
- `vitest.config.ts` — coverage provider, reporters, excludes, thresholds
- `.github/workflows/ci.yml` — coverage run + artifact upload
- `.gitignore` — `*.key`, `*.pem`, `credentials.json`
- `CLAUDE.md` — `test:coverage` command
- `docs/development.md` — coverage workflow and threshold table
- `src/api/__tests__/client.test.ts` — HTTP status fallback, method/body
  forwarding
- `src/stores/__tests__/entries.test.ts` — error paths, non-Error fallbacks,
  currentPage, hasEntries, merged params (+9 tests)
- `src/composables/__tests__/useEntryEditor.test.ts` — reset with null entry,
  saveError clearing (+2 tests)
- `src/views/__tests__/EntryListView.test.ts` — pagination, row click,
  error and empty states (+8 tests)
- `src/views/__tests__/EntryDetailView.test.ts` — save flow, error banner,
  beforeunload, enableAutoUnmount (+11 tests)

## Follow-ups

1. **Node 20 action deprecation warning.** GitHub Actions surfaced a heads-up
   that `actions/checkout@v4`, `actions/setup-node@v4`, and
   `actions/upload-artifact@v4` are running on Node.js 20, which becomes
   non-default on June 2, 2026 and gets removed from the runner on
   September 16, 2026. When the next major of these actions ships bundling
   Node 24, bump them. Not urgent.

2. **`onBeforeRouteLeave` test, if desired.** Mounting the component inside
   a `<router-view>` wrapper would let the guard register properly and cover
   the last ~7 lines of `EntryDetailView.vue`. Noted in the test file with a
   comment explaining the trade-off.

3. **Coverage threshold bumps.** If the suite settles into a higher baseline
   over time (say, 98% statements), the thresholds should be bumped to match
   so the ratchet stays meaningful. This is a manual, deliberate action —
   never let CI pass silently at a lower number.
