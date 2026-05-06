# 2026-05-06 — Entity-list filter-state leak + merge-candidate inline context

Webapp-only follow-up to the day's broader entity work. No sibling commit on the server.

## Context

Two unrelated rough edges on `EntityListView` surfaced while the operator was using the
day's quarantine + merge UIs:

1. **Filter state leaked across remounts.** Navigating away from the entity list and back
   sometimes returned a "mysteriously filtered" view: the search box was visibly empty but
   the list was still scoped to the previous search term. The store's `loadEntities`
   merges params with `currentParams`, so an empty call on remount kept the prior session's
   `search` / `type` filters in the request payload.
2. **Merge candidates were hard to judge without context.** A row like
   `Pull Ups ~ Bar (77%)` is ambiguous: `Bar` could be the pull-up bar (merge!) or a wine
   bar (don't!). Operators had to open each entity in a new tab to see mention quotes
   before deciding.

## What shipped

### Filter-state leak fix

- `src/views/EntityListView.vue` — `onMounted` now passes explicit `undefined` for
  `type` and `search` alongside `offset: 0`, so the store's param merge resets stale
  filters on every mount instead of inheriting them.
- `src/views/__tests__/EntityListView.test.ts` — regression test mounts the view twice
  with the same Pinia instance: first mount types `wave` into the search box and asserts
  the API call carries `search: 'wave'`; second mount asserts the API call's `search` and
  `type` are both `undefined` and `offset === 0`.

### Inline merge-candidate context

- `src/views/EntityListView.vue` — each merge-candidate row now has a chevron toggle
  that expands an inline two-column block showing each side's mention count, date range,
  aliases, and up to 3 mention quotes (clickable, deep-link to `entry-detail` with
  `?highlight=<canonical>`).
  - Mentions fetched lazily via `fetchEntityMentions(id, { limit: 3 })` on first expand,
    cached per entity ID so collapse → re-expand doesn't re-fetch.
  - The merge-candidates response embeds bare `Entity` records without
    aggregated `mention_count` / `last_seen`, so the component prefers the mentions
    endpoint's `total` and derives the latest date from the fetched mention list.
- 3 new component tests: parallel fetch on expand, cache hit on re-expand,
  empty-state line when an entity has no mention quotes.

## Test results

- `npm run test:unit`: **1326 passing** (was 1322 at the end of the prior session), 0
  failures, 74 files. +4 tests (3 expand-context + 1 filter-leak regression).
- `npm run lint`: clean.
- `npm run test:coverage`: statements 91.47% / branches 85.22% / functions 88.69% /
  lines 93.58%. All ≥ 85% threshold. `EntityListView.vue` specifically: 93.81 / 87.31 /
  91.89 / 97.18.
- `vue-tsc --noEmit`: clean.

## Visual verification

Captured eight screenshots (`step1-after-search.png` … `step8-dark-mode.png`, plus
`entities-fresh-load.png` and `entities-with-data.png`) walking through:
search-then-back-nav (filter-leak repro), candidate row collapse/expand toggles, both
sides expanded, dark mode. The screenshots aren't committed — they live in the worktree
as a record of the manual smoke pass.

## Notes for future work

- The merge-candidates server response carrying bare `Entity` rather than `EntitySummary`
  is the underlying limitation that forced the dual-cache (mentions + totals) here. If
  that endpoint ever populates `mention_count` and `last_seen`, the component falls back
  cleanly without code changes — `getMentionCount()` already prefers an embedded value
  when present.
