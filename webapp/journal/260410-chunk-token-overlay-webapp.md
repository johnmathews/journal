# 2026-04-10 — Chunk & token overlay webapp

Frontend side of the overlay feature. Server-side companion commit lands on `journal-server`'s `feature/chunk-token-overlay` branch.

## What shipped

A new **Overlay** segmented control on `EntryDetailView.vue` with three options:

1. **off** — default. Corrected panel is the existing diff-editor (mirror-div backdrop + transparent textarea + live diff highlights).
2. **chunks** — corrected panel becomes a read-only view that renders chunk boundaries from the server's persisted chunker output. Alternating sky/green backgrounds with a left border per chunk; overlap regions (from `overlap_tokens` in the fixed chunker or weak-cut lead-ins in the semantic chunker) get a distinct violet highlight. Hover shows `chunk <index> — <token_count> tokens`.
3. **tokens** — corrected panel renders per-token spans from `cl100k_base` (the tiktoken encoding matching `text-embedding-3-large`). Sky/green alternating backgrounds, no borders, hover shows `token <index> — id <token_id>`. Leading whitespace is part of the token as the model sees it (e.g. `" world"`).

Switching modes fetches lazily and caches on the view; switching back to `off` restores the textarea and any unsaved edits are preserved.

## Key design calls

**Overlay renders against `currentEntry.final_text`, not `editedText`.** The chunk offsets came from the server's last run of the chunker against the persisted text. If the overlay rendered against the live edit, offsets would silently misalign the moment the user added a word. Rather than try to keep the overlay in sync with every keystroke, the textarea is hidden entirely while overlay is active — you can inspect chunks/tokens on what the server actually has, then turn overlay off to resume editing.

**Chunk overlap is first-class.** The fixed chunker's `overlap_tokens` and the semantic chunker's weak-cut lead-ins both mean chunks can cover the same character range. Rather than picking one chunk per position (which would hide overlap), the renderer does a breakpoint sweep: collect every chunk start/end as a breakpoint, walk intervals between breakpoints, classify each by the set of chunks covering it. Intervals covered by 0 chunks are plain, 1 chunk get alternating sky/green by chunk index, 2+ chunks get the violet overlap kind. This keeps the overlap visible — which is the whole point of the feature, since understanding overlap is one of the things the diagnostic is supposed to show.

**New composable, not an extension of `useDiffHighlight`.** The diff highlighter and the overlay highlighter share the "emit `<mark>` spans with escaped text" shape, but their highlight kinds, colour palettes, and data sources are entirely independent. Extending `HighlightKind` across both use cases would have coupled them for no gain — `useOverlayHighlight.ts` duplicates the ~15 lines of `escapeHtml` / `segmentsToHtml` infrastructure locally.

**`<input type="radio">` segmented control, not a third-party component.** PrimeVue is mentioned in the CLAUDE.md but isn't actually installed in this project, and the existing diff toggle is a plain `form-checkbox`. The overlay mode switcher follows that same low-ceremony pattern: three radios wrapped in Tailwind-styled labels, with `peer-checked` styling for the selected state.

## Error handling

`ApiRequestError.errorCode` already surfaces the server's `error` field, so the view distinguishes `chunks_not_backfilled` (entry ingested before the chunk persistence migration) from a generic 404 and shows a yellow banner with the server's message. The overlay stays in whatever mode the user selected — they just see no highlighted data, same as before.

## Tests

151 webapp tests passing. Coverage: 95.99% / 89.18% / 96.03% / 97.51% (well above the 90/85/90/90 thresholds).

New coverage:

- **`useOverlayHighlight.test.ts`** — 22 tests covering segment construction for chunks (alternation, overlap, gaps, out-of-range clamping, hover titles), for tokens (partition reconstruction, trailing text, token id titles), `segmentsToHtml` (HTML escaping, empty drop, mark wrapping), and the composable itself (all three modes, loading state, reactivity to mode changes).
- **`EntryDetailView.test.ts`** — five new tests: default-off mode, switching to chunks fetches and renders, switching to tokens fetches and renders, switching back to off restores the textarea, and the `chunks_not_backfilled` error banner.

## Follow-ups

1. **End-to-end visual verification.** I haven't actually run this in a browser yet — the tests prove the rendering math, but UX polish (colour contrast in dark mode, hover title readability, overlap border interactions) needs real eyes on a real entry. Next session: spin up both servers, open the app, and actually look.
2. **Chunk/token refresh on save.** Right now, after editing and saving, the cached chunks/tokens on the view are stale. The watcher invalidates on entry-id change, not on successful save. Not breaking (the user can switch off→on to refetch) but it'd be cleaner to clear the caches in the `save` function.
3. **Long entries and performance.** For journal-scale entries (~ few thousand tokens) this renders instantly. If entries ever got into the 10k+ token range, per-token `<mark>` spans might start to feel sluggish. Virtualisation was deliberately left out of scope.
4. **The 277 → 5 chunks investigation.** This was the original prompt for building the overlay in the first place. Now that the feature exists, the next step is to open that specific entry in the browser, flip the chunks overlay on, and see what the boundaries actually look like. Expected outcome: the multipage OCR join (`"\n\n".join(page_texts)`) is forcing paragraph breaks that the chunker turns into chunk breaks before the token budget fills. If confirmed, likely fix is either raising `max_tokens` or joining pages with a single `\n` instead of `\n\n`. Deferred to a separate commit.
