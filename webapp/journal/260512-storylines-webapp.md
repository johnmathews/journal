# 2026-05-12 — Storylines webapp cycle

Webapp UI for the server-side storylines feature that shipped earlier today
(`journal-server@8396c7e`). Pairs with
`../../server/journal/260512-storylines-server-spike.md`.

## What shipped

- `/storylines` — paginated list view mirroring `EntryListView.vue`. Sort
  by name, entity, last-generated, or created. Click a row → detail view.
- `/storylines/:id` — detail view with the two-panel layout (curation +
  narrative). Header has Regenerate (queues a `storyline_generation` job,
  tracks it via `useJobsStore`, refetches the detail when the job lands
  in a terminal state) and Delete (window.confirm → DELETE → router push
  back to list).
- `src/components/StorylineSegments.vue` — the load-bearing rendering
  primitive. Walks `Segment[]` and emits plain text plus `<RouterLink
  :to="/entries/N">` footnote links. Numbers citations per-panel.
- `src/api/storylines.ts`, `src/types/storyline.ts`, `src/stores/storylines.ts`
  with `loading`/`detailLoading` split (mirrors `entities.ts`).
- Routes wired in `src/router/index.ts`. Sidebar entry added between
  Entities and Job History in `AppSidebar.vue`. `JobType` gained
  `'storyline_generation'` so jobs-store tracking type-checks.

## Decisions

1. **No markdown library.** The brief warned against adding one and the
   recon doc from the server cycle confirmed none exists. The segment
   renderer is a ~50-line Vue component that walks structured JSON; no
   `marked` / `vue-markdown`.
2. **Two quote modes by length, single threshold.** Citation `quote`
   length varies wildly: curation segments carry short
   `entity_mentions.quote` excerpts (~10-150 chars); narrative segments
   carry the whole wrapped journal entry (often 1000+ chars) because the
   server still uses `source: "content"` documents for the Citations API.
   Rather than thread a `variant` prop down from each view, the renderer
   gates on length: ≤200 chars inline, longer collapses behind a
   `<details>` disclosure. Single threshold prop keeps the API tight and
   lets the test suite cover both branches by varying quote length.
3. **Citation labels are sequential footnotes.** `[1]`, `[2]`, `[3]` —
   simpler than entry numbers, predictable, doesn't expose internal IDs in
   the visual scan. Per-panel numbering (curation and narrative restart at
   1) because the panels read independently.
4. **No synchronized scrolling between panels.** v1 ships with
   independent scrolling, matching the EntryDetailView edit-mode pattern.
   Adding sync-scroll is cheap if it proves useful but neither obviously
   useful nor in scope today.
5. **Stack-on-mobile via `flex flex-col lg:flex-row`.** Mirrors
   EntryDetailView's two-pane edit mode at the same 1024px breakpoint.
6. **No create form.** The brief said skip unless it falls out naturally;
   it didn't. Empty-state copy nudges the user to seed via
   `journal_create_storyline` MCP tool or `POST /api/storylines`. The store
   has `createStoryline` plumbing in place for a future cycle.
7. **Regenerate refetch via job-watcher.** The detail view subscribes to
   the queued job through `useJobsStore.getJobById` and reloads the
   storyline when the job lands in `succeeded`. Failure leaves the old
   panels in place and surfaces the toast.

## Gotchas hit

1. **`vi.spyOn(window, 'confirm')` fails under happy-dom** — `window.confirm`
   is undefined in the test env, so the spy throws. Switched to direct
   assignment (`window.confirm = vi.fn().mockReturnValue(true)`), matching
   the existing `EntryDetailView.test.ts` pattern.
2. **Prettier touched one unrelated file** —
   `src/components/settings/FitnessSyncPanels.vue` was already
   format-drifted on `main` (pre-existing); `prettier --write src/` (which
   the project's `format` script invokes) normalized it. Confirmed via
   `prettier --check` on the main checkout. Leaving the cleanup in this PR
   rather than splitting it out — the pre-push hook would have failed on
   any future change to that file otherwise.
3. **EnterWorktree's repo anchoring** — the engineering-team skill
   suggested EnterWorktree, but the session was anchored on the wrong
   sibling repo (we're inside `journal/` parent which is not a git repo).
   Worked around by creating the worktree manually via `git -C webapp
   worktree add` and operating with absolute paths from the worktree dir.
   Note for future sessions in this parent layout: `cd` into the target
   sub-repo *before* invoking EnterWorktree, or do the same manual
   workaround.

## Test coverage

1574 tests pass, all metrics above the 85% pre-push thresholds:
statements 91.99%, branches 85.4%, functions 90.67%, lines 94.09%.

New test files:

- `src/api/__tests__/storylines.test.ts` (7 tests)
- `src/stores/__tests__/storylines.test.ts` (21 tests)
- `src/components/__tests__/StorylineSegments.spec.ts` (9 tests)
- `src/views/__tests__/StorylineListView.test.ts` (11 tests)
- `src/views/__tests__/StorylineDetailView.test.ts` (12 tests)

## Follow-ups

Both server-side, neither blocking:

1. **Citation granularity** — switching the narrator from
   `source: "content"` to `source: "text"` would let `StorylineSegments`
   drop the collapsed-disclosure path. Today's bloated narrative quotes
   are visible if the user expands them; future short quotes would just
   render inline like curation.
2. **Entity backfill** — `journal extract-entities --stale-only` would
   reduce reliance on the FTS fallback. No webapp-side change needed.

## Acceptance

Tested locally against prod via the two seeded storylines (Running entity
513; Atlas entity 511). Both panels populate, citation links navigate to
the right entries, regenerate queues a job and the detail refreshes when
it completes. List view paginates correctly with the two existing rows.
