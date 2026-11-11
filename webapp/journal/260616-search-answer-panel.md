# 260616 — search answer panel: synthesized answer above results

Adds an "Answer this" button to `SearchView` that calls `POST /api/search/answer` and
renders a synthesized, cited answer panel inline above the search results. Graceful
degradation: on error the inline panel shows a friendly message and the results list
remains visible below.

## Types: `src/types/search.ts`

- `AnswerRequestParams` — `{q}` extending `DateFilterParams`.
- `AnswerCitation` — `{entry_id, entry_date, snippet}`.
- `AnswerResponse` — `{question, answer, answered, citations, model}`.

## API client: `src/api/search.ts`

`answerQuestion(params: AnswerRequestParams)` — `POST /api/search/answer` with JSON body
`{q, start_date?, end_date?}`.

## Store: `src/stores/search.ts`

Pinia setup/composition store. New refs: `answer`, `answered`, `answerCitations`,
`answerLoading`, `answerError`.

`runAnswer()` action: no-ops on empty query; sets `answerLoading`; calls `answerQuestion`
with the current query and active date filters; on success populates `answer`, `answered`,
`answerCitations`; on ANY error sets `answerError` to "Answer unavailable — see the
results below." and clears answer/answered/citations.

A private `clearAnswer()` runs at the start of `runSearch` and inside `reset()` so a
stale answer never sits above fresh results.

## View: `src/views/SearchView.vue`

An always-visible "Answer this" button sits beside the Search button. It is disabled while
`answerLoading` is true or the query is empty; its label shows "Thinking…" while loading.

An inline answer panel renders ABOVE the results in three states:

1. **Loading** — shows "Thinking…".
2. **Error** — shows the `answerError` message inline (no toast, no close button).
3. **Success** — shows the answer text and a row of citation chips. Each chip is a
   `RouterLink` to `/entries/:id` showing the entry date (not the entry title). When
   `answered=false`, the panel shows the "I couldn't find anything about that in your
   journal." message inline.

There is NO toast, NO close/dismiss button, and NO entry titles in chips.

## Files touched

- `src/types/search.ts`
- `src/api/search.ts`
- `src/stores/search.ts`
- `src/views/SearchView.vue`
- `tests/unit/stores/search.spec.ts`
- `tests/unit/views/SearchView.spec.ts`
