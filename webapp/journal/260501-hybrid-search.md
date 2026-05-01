# 2026-05-01 — Hybrid search (webapp side)

Server shipped a unified hybrid search pipeline (BM25 + dense + RRF
+ rerank). Webapp side: drop the keyword/semantic toggle; render
the new mixed-signal results.

## Changes

`src/types/search.ts`:
- Removed `SearchMode` type and the `mode` fields on
  `SearchRequestParams` and `SearchResponse`.
- Added `reranker: string` to the response shape (echoes the active
  L2 stage on the server — useful for debugging and cache busting).
- Updated `SearchResultItem` JSDoc: `snippet` and `matching_chunks`
  may now both be present on a single item.

`src/stores/search.ts`:
- Dropped `mode` and `lastRunMode` state.
- `runSearch()` no longer sends `mode` to the API.

`src/views/SearchView.vue`:
- Removed the Keyword/Semantic radio group entirely.
- `displayHtml()` — prefer `snippet` when present, else fall back to
  the top dense chunk. Pruned the `text.slice(0, 200)` defensive
  fallback since at least one signal is always present (a result
  that neither retriever produced wouldn't be in the response).
- `matchExplanation()` — new helper that surfaces lexical vs.
  semantic vs. both contributions: "Matched by keywords",
  "Matched by meaning", or "Matched by keywords and meaning". The
  explanation panel now renders for any result that carries a
  signal, not just semantic-mode results.

`src/api/__tests__/search.test.ts`,
`src/stores/__tests__/search.test.ts`,
`src/views/__tests__/SearchView.test.ts`:
- Removed mode-toggle tests; added a positive assertion that the
  toggle isn't rendered.
- Replaced semantic-vs-keyword tests with three new ones: BM25-only
  hit (snippet, "Matched by keywords"), dense-only hit
  (matching_chunks, "Matched by meaning"), both signals (combined
  "keywords and meaning" label).
- Asserted `mode` does not appear in the request URL or in the
  serialized request body.

## Coverage

After the changes, branches landed at 85.03% — just above the 85%
pre-push threshold. Two unreachable branches were pruned from
`SearchView.vue` rather than padded with tests for impossible
states (CLAUDE.md "no dead code" guidance).

## Ships in lockstep

This branch must merge alongside the server's `hybrid-search`
branch. The retired `mode` parameter is a hard `400 mode_removed`
on the server, so a webapp that still passes it would break
immediately. Both repos branched from `main` at the same point.
