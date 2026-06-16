# 260616 — search answer panel: synthesized answer above results

Adds an "Answer this" button to the SearchView that calls `POST /api/search/answer` and
renders a synthesized, cited answer panel above the search results. The panel shows the
answer text plus citation chips linking to the entry details pages. Graceful error
degradation: if the synthesis fails, the error is shown in a toast and the results list
remains visible.

## Answer panel UI

The panel sits above the results list and contains:

1. **Answer text** — the synthesized response (paragraph).
2. **Citation chips** — a row of badges showing the entry IDs and titles that the answer
   was grounded in. Each chip is a link to `/entries/:id` for deep-dives into context.
3. **Loading state** — while the synthesis request is in-flight, a spinner with "Generating
   answer…".
4. **Fallback text** — if the server returns `answered: false`, show "I couldn't find
   anything about that in your journal." (no chips, no error toast, just disappear the
   panel).
5. **Error state** — network/parsing/500 errors show a red toast and the panel closes;
   results remain visible below.

## Store integration: search store runAnswer + clear-on-search

The search store (`stores/search.ts`) gains a `runAnswer` action that:

1. Takes the current query and search results (already cached from the last `runSearch`).
2. Calls `POST /api/search/answer` with the query and top-N entry IDs.
3. Returns the typed `{ answered: bool, answer?: str, context_entries: [...] }` response
   from the server.
4. Updates a reactive `answer` field on the search state for template binding.

The store also clears `answer` whenever a new search is run (different query or date
range), so stale answers don't linger if the user refines the search.

## Citation chips

Each chip displays the entry title and is wrapped in a `RouterLink` to `/entries/:id`. The
chip uses the Mosaic design tokens (same color palette as the theme, responds to dark mode
via CSS variables). Chips are read-only; no copy-to-clipboard affordance (minimizing
complexity for v1).

## Graceful error handling

- **Network errors** — caught and surfaced as a red toast via the existing toast system.
  The answer panel closes, results stay.
- **Server 502 (provider failure)** — same as network error; the server error message is
  relayed to the user.
- **Malformed response** (missing `answered` field, etc.) — caught by the API client's
  type validation and shown as a red toast.
- **User closes the panel** — a small close button (×) allows dismissal. Clicking "Answer
  this" again re-fetches (not cached; each click is a fresh synthesis call per product
  requirement).

## Store structure

```typescript
// search.ts additions
interface SearchState {
  // ... existing query, results, etc. ...
  answer: AnswerResponse | null;
  answerLoading: boolean;
}

interface AnswerResponse {
  answered: boolean;
  answer?: string;
  context_entries: { id: string; title: string }[];
}

export const useSearchStore = defineStore('search', {
  state: () => ({
    // ... existing ...
    answer: null,
    answerLoading: false,
  }),

  actions: {
    async runAnswer() {
      this.answerLoading = true;
      try {
        const result = await api.search.answer({
          query: this.query,
          entries: this.results.map(r => r.id),
        });
        this.answer = result;
      } catch (err) {
        // toast shown by API client
        this.answer = null;
      } finally {
        this.answerLoading = false;
      }
    },

    async runSearch(partial?: Partial<SearchQuery>) {
      this.answer = null;  // clear on new search
      // ... existing search logic ...
    },
  },
});
```

## Files touched

- `src/stores/search.ts` — add `answer` and `answerLoading` state, `runAnswer` action.
- `src/api/search.ts` — add `answer(query, entries)` POST endpoint wrapper.
- `src/types/search.ts` — add `AnswerResponse` type.
- `src/views/SearchView.vue` — add "Answer this" button above the results list, render
  the answer panel conditionally, wire up click to `runAnswer`.
- `tests/unit/stores/search.spec.ts` — test `runAnswer` action (happy path,
  network error, `answered: false` case).
- `tests/unit/views/SearchView.spec.ts` — test button visibility, panel render, error
  toast.

## What's next

Monitor cost/latency metrics in production. If synthesis becomes a bottleneck or cost
spikes unexpectedly, add feature-flag or rate-limiting. Consider follow-up: a "Refine
answer" button that re-runs synthesis with user feedback (later roadmap item).
