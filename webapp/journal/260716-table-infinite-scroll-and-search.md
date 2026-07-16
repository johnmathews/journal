# 1. Infinite scroll + whole-dataset table search

**Date:** 2026-07-16
**Sibling change:** `journal-server` `server/journal/260716-table-search-whole-dataset.md`
(adds the `search` query params these UIs call).

## 1.1 Goal

Two user requests: (1) **priority** — table search must run over the whole dataset, not
just the current page / loaded rows; (2) replace pagination with infinite scroll app-wide.

## 1.2 What shipped

- **Shared composable `src/composables/useInfiniteList.ts`** — wraps `@vueuse/core`'s
  `useInfiniteScroll` (guarded for missing `IntersectionObserver`), returns
  `{ sentinelRef, loadMore, canLoadMore }`. A visible **"Load more"** button drives the
  same `loadMore` as an accessible fallback and the deterministic test hook (happy-dom's
  IntersectionObserver stub never fires). No new dependency.
- **Stores** gained an append path + `hasMore = items.length < total`, keeping the
  existing replace/reset path:
  - `entities.ts` → `loadMoreEntities`
  - `entries.ts` → `loadMoreEntries`
  - `storylines.ts` → `loadMoreStorylines`
  - `JobHistoryView` keeps its list state locally (not in the jobs store); it got an
    equivalent `loadMoreJobs` + `refreshLoadedWindow`.
- **Views converted** (pager removed, sentinel + "Load more" + "showing N of M" caption
  added): `EntityListView`, `StorylineListView`, `EntryListView`, `JobHistoryView`. Stable
  `data-testid`s: `<table>-scroll-sentinel`, `<table>-load-more`, `<table>-count-caption`
  (+ `<table>-search-input` where applicable).
- **Search boxes** (Entities already had one; added to Storylines + Jobs): debounced
  250 ms, call the store reset path with `search` + `offset: 0`, so the server does the
  whole-dataset match and infinite scroll appends within the filtered set. `/entries` has
  no table search box on purpose — full journal-content search lives on `/search`.
- **Bug fix — Entities → Quarantined dead search box:** the input was wired to nothing
  (`applyFilters` bailed for non-active tabs and `sortedEntities` never read `searchQuery`).
  Fixed with a client-side `filteredQuarantined` computed over the fully-loaded quarantined
  list (whole-dataset by construction) and corrected the misleading comment. Bug-fix TDD:
  reproduction test failed before, passes after.

## 1.3 Decisions

- **Search is always a server-side query param** (except the fully-loaded Quarantined
  list) — this is what guarantees whole-dataset results; infinite scroll only affects how
  the filtered set is paged in.
- **Column sort stays client-side over loaded rows (D3)** — a sort re-orders loaded rows
  and becomes globally correct once scrolled to the bottom; the "N of M" caption makes a
  partial view legible. Server-side sort was explicitly deferred (user-approved).
- **JobHistoryView 3s auto-poll** refreshes the loaded window in place (`refreshLoadedWindow`,
  offset 0 → current length), race-guarded on the `loading` flag so a poll and an append
  can't double-fetch. `v-for` keys on `job.id` so replacing the array preserves scroll +
  expanded-row state.

## 1.4 Verification

Full suite **1977 passed**, coverage all ≥85% (stmts 92.5 / branches 85.4 / funcs 91.5 /
lines 94.8), `vue-tsc` build + eslint + prettier clean. Fixed one cross-unit seam
(`store.hasEntities` typo → `hasEntries`) and one review nit (entries store append action
renamed `loadMoreEntities` → `loadMoreEntries`).

## 1.5 Known minor items (not blocking)

- Transient Vue duplicate-key warning possible if a new job is created in the ≤3s gap
  between polls and the user clicks "Load more" in that window — inherent to offset
  pagination over a mutating newest-first list; the next poll heals it.
