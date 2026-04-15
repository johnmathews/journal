# Search UX improvements

## Changes

Four improvements to the `/search` view:

1. **Default mode switched to keyword.** Keyword search is the more common use case
   (looking for a specific name, word, or phrase). Semantic search remains one click away.
   Updated the store default, `reset()`, and `lastRunMode` initial values.

2. **Button order: Keyword first, Semantic second.** The default/primary option is now
   visually first (leftmost) in the mode toggle.

3. **Mode click triggers search.** Previously, clicking a mode button only toggled the
   local form state — the user still had to click "Search" to re-run. Now `selectMode()`
   sets the mode and immediately calls `submit()` if there's a non-empty query. This lets
   users compare keyword vs semantic results with a single click.

4. **Semantic match explanation.** Semantic results now show a "Matched by meaning" label
   with the top chunk's similarity percentage, plus up to 2 additional matching chunks
   (score + text preview). This makes it clear *why* a result appeared when the search
   term doesn't literally appear in the text.

## Files changed

- `src/stores/search.ts` — default mode `'semantic'` → `'keyword'`
- `src/views/SearchView.vue` — button order, `selectMode()`, semantic explanation block
- `src/stores/__tests__/search.test.ts` — updated default assertions
- `src/views/__tests__/SearchView.test.ts` — updated default test, added tests for
  auto-search on mode click, semantic explanation visibility
- `docs/architecture.md` — updated SearchView description
