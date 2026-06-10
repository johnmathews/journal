# 2026-06-10 — Quality round (engineering-team run)

Webapp half of the one-day evaluate → plan → implement cycle driven by
the engineering-team run at
`.engineering-team/runs/manual-20260610T160013Z/` (parent workspace).
The server-side round summary lives at
`server/journal/260610-quality-round.md`.

## What merged today

Six PRs (#11–#16) plus dependabot #9 (js-cookie):

| PR | What |
|---|---|
| #11 | `row` as a first-class activity type (pairs with server PR #21 / migration 0029; merged after it). Also carried the calendar-heatmap clock-pin fix for the two wall-clock test failures, and the archived storylines-plan link fix |
| #12 | Admin API client tests + stale `App.test.ts` dedup, search "All time" range + friendly 5xx error polish (`src/api/admin.ts` was previously only mocked by its consumer) |
| #13 | Deploy config: working self-contained compose stack; anchored the Vite `/api` proxy key (`'^/api/'`) so `/api-keys` no longer proxies to the backend |
| #14 | Fill empty dashboard bins (`src/utils/bins.ts`) so chart x-axes show real writing gaps |
| #15 | Storylines anchor-edit UX — `StorylineAnchorEditor` on the detail view, closing the named roadmap gap |
| #16 | Dashboard decomposition — per-tile chart components extracted from `DashboardView` (now ~400 lines of wiring) |

## Key decisions

- **Anchor-edit design questions resolved (PR #15):** the editor is an
  inline panel on `StorylineDetailView` (not a modal), seeded from the
  current anchors with a diff-vs-current display; saving warns that
  existing panels go stale and offers **Save & regenerate** (PUT then
  chain the existing regenerate flow with job tracking) or **Save
  only**. The PUT response is authoritative for the resulting anchor
  set — the store refreshes state from it rather than echoing the
  caller's selection.
- **Zero-fill on the client (PR #14):** the server's `GROUP BY` only
  returns non-empty bins; rather than changing the API, `bins.ts`
  expands sparse bins into a contiguous UTC grid (ISO-week Mondays,
  month/quarter/year starts), matching the pattern `FitnessView` had
  already established with `bucketByWeek`.
- **Fake only `Date` in date-pinned tests (PR #11/#14):**
  `vi.useFakeTimers({ toFake: ['Date'] })` pins wall-clock-sensitive
  dashboard tests without freezing the microtask queue, so
  `flushPromises` still works. Applied first to the failing heatmap
  specs (pinned to 2026-03-15) and reused for the bins work.
- **Per-tile dashboard components (PR #16):** each chart tile owns its
  Chart.js lifecycle; shared palette + `filledWritingBins` helper live
  in `src/components/dashboard/shared.ts`.

## Numbers

- Tests went from **1,648 passed / 2 failed** at evaluation (the two
  heatmap tests failing on wall-clock alone) to a green suite from
  PR #11 onwards, growing with each unit's specs.
- Coverage held **≥85% on all four metrics** (statements, branches,
  functions, lines) throughout — the pre-push hook and CI gate
  enforced it on every push.

## Docs (W26, this branch)

`docs/architecture.md` caught up with reality: storylines
(views/store/api + `StorylineAnchorEditor`), fitness (`FitnessView`,
`StravaCallbackView`, store, api), the dashboard decomposition,
`src/utils/bins.ts`, and the full route list. The parent workspace
`CLAUDE.md`'s stale PrimeVue mention was corrected to the actual
Tailwind CSS 4 / Cruip Mosaic shell (plain file edit — the parent is
not a repo).
