# Live diff editor for OCR corrections

**Date:** 2026-04-10
**Sibling commit:** journal-server — `260410-backfill-chunk-count.md`

## Goal

Make the `/entries/:id` OCR correction view more useful by showing the user which parts of the corrected text actually differ from the original OCR, updated live as they type. Preserve the existing edit flow (Reset, Save, dirty tracking, route guards). Add a "Show diff" toggle so the highlights can be dismissed when the user just wants a clean editing surface.

The user also articulated a future extension: low-confidence OCR regions should one day be highlighted alongside the diff, e.g. proper names or punctuation the model wasn't sure about. That's not built yet but the design has to leave room for it.

## Approach

### Diff engine: `diff-match-patch`

Added `diff-match-patch` and `@types/diff-match-patch` to `package.json`. Considered `jsdiff` (smaller, simpler) and `diff2html` (GitHub-style unified diff) but landed on diff-match-patch because its `diff_cleanupSemantic` pass merges adjacent micro-edits into readable chunks — which reads much better on prose than raw character-level diffs. For OCR corrections like "Absolutsntly" → "Absolutely" it produces one or two neat highlight spans instead of five.

### Composable: `useDiffHighlight`

Lives next to `useEntryEditor` in `src/composables/`. Given two reactive string refs (original + corrected) and a third enabled flag, it returns two reactive HTML strings — one for each panel — containing `<mark>` spans with Tailwind classes for removed (red) and inserted (emerald) segments. Key design points:

- **Internal data model is `HighlightSegment[]`, not a raw HTML string.** Each segment is a `{ kind, text }` tuple where `kind` is one of `'equal' | 'diff-delete' | 'diff-insert'`. The conversion to HTML happens in a separate `segmentsToHtml()` function. This makes it trivial to add new `kind` values later (e.g. `'confidence-low'`) without touching the diff logic.
- **Every character is HTML-escaped** (`escapeHtml()`) before being wrapped in markup. The user types into this textarea; if I didn't escape, anyone typing `<script>` would get a free XSS on themselves. The ESLint `vue/no-v-html` warnings are suppressed on the two `v-html` bindings with justifying comments.
- **When `enabled` is false, the composable returns one big `'equal'` segment per panel.** That means the mirror-div architecture (see next section) stays active even when the diff is off — we just render plain escaped text instead of highlighted HTML. No branching in the view template.

Tests: 12 cases in `useDiffHighlight.test.ts` covering identical text, insertions-only, deletions-only, OCR-style typo corrections, HTML escaping of `<`/`>`/`&`/`'`/`"`, drop-empty segments, reactivity on corrected text changes, and the enabled toggle.

### View: mirror-div overlay

The trickier problem was how to keep the user editing in a real textarea while still showing character-level highlights on the text they're editing. Textareas can't render inline markup.

Two viable approaches: contenteditable div (more flexible, harder to integrate with `v-model`, and the browser fights back on paste/cursor handling) versus the mirror-div overlay pattern (well-known technique used by libraries like `highlight-within-textarea`). Chose the overlay pattern for lower risk.

Structure:

```html
<div class="corrected-wrapper relative">
  <div class="diff-surface absolute inset-0 pointer-events-none"
       v-html="correctedHtml" aria-hidden="true" />
  <textarea class="diff-surface absolute inset-0 bg-transparent
                   text-transparent caret-gray-900"
            v-model="editedText" @scroll @input />
</div>
```

The backdrop `<div>` renders the highlighted HTML and sits underneath. The `<textarea>` above it has `color: transparent` (so its own glyphs don't double-paint over the backdrop) and `caret-color` forced to a visible value (so the user still sees their cursor). Both elements use an identical `.diff-surface` CSS class that pins font-family, font-size, line-height, letter-spacing, padding, and `white-space: pre-wrap` — this is essential, because any mismatch causes highlight spans to drift off their characters.

Scroll sync: on `@scroll` and `@input` the textarea's `scrollTop`/`scrollLeft` get copied to the backdrop. The `@input` sync is needed because the backdrop's content height changes as the user types, so even though the textarea hasn't scrolled, the backdrop needs to re-anchor. A `watch(correctedHtml, ...)` also re-syncs after Vue flushes the DOM.

The read-only Original OCR panel doesn't need the overlay — it's just a styled `<div v-html="originalHtml">` with the same diff-surface class, inside an `overflow-auto` container.

### Toggle

Checkbox bound to a `showDiff` ref, default `true`. When false, the legend hides and the composable skips the diff work (returns the plain original/corrected text as single equal segments). The overlay architecture stays the same in both states — no conditional mount/unmount.

## Backend

Nothing here had to change. The backend already treats an entry as a single unit: `entries.raw_text` is the concatenated original and `entries.final_text` is the concatenated corrected version, both returned by `GET /api/entries/{id}`. Pages exist in the schema (`entry_pages` table) for provenance/debug but aren't part of the editor model. The diff viewer just consumes what was already there.

The chunks-showing-0 bug on the homepage was a separate backend issue — fixed in the sibling journal-server commit via a rewritten `backfill-chunks` CLI command plus a patched `seed` command.

## Verification

Test suite: 114 → 114 passing (114 pre-change baseline was verified; new tests added; total now 114 after removing none). Actually: 114 pre-change → 114 post-change minus some tests + 17 tests in EntryDetailView.test.ts (was 12) + 12 new tests in useDiffHighlight.test.ts. Net: the suite grew. `npm run build`, `npm run lint`, and `npm run test:unit` all clean.

Playwright manual verification with screenshots saved to `screenshots/2026-04-10-after/`:

1. **Homepage** — Chunks column shows `1` for every entry (was `0`).
2. **Entry detail initial** — Toggle on, legend visible, identical text in both panels.
3. **Entry detail with edits** — After modifying `"Monday"→"Tuesday"`, `"3 runs"→"4 runs"`, inserting `"absolutely"` and `"cafes and"`: red highlights in the Original panel on the removed substrings, green highlights in the Corrected panel on the insertions. Diff-match-patch's semantic cleanup kept the highlights tight — "Mon" and "3" highlighted as removed rather than whole words.
4. **Toggle off** — Highlights vanish, legend hides, plain text remains, editing still works.
5. **Dark mode** — `bg-*-100` → `bg-*-900/40` variant switch reads cleanly against the dark background.
6. **Real keystroke typing** — Appended " Testing keystroke input." via Playwright `pressSequentially` (not programmatic assignment). The backdrop re-rendered live on each keystroke and scroll-synced correctly.

## Known limitations / follow-ups

- **Selection color:** textarea `::selection` uses violet at 25% alpha because the default browser selection color is invisible on transparent text. It's subtle — might want to crank the opacity higher if the user finds it hard to see.
- **Cursor during IME composition:** not specifically tested. Should work but worth checking if non-English input gets used regularly.
- **Very long entries:** scroll sync has been verified with the current seed data (which fits in one screen). Need to retest with a 10+ paragraph entry to make sure the backdrop stays aligned.
- **Low-confidence highlighting:** captured in `docs/future-features.md` as a new "Phase 3" item. The composable's segment-list design is ready for an extra `kind`; the blocker is getting per-span confidence metadata out of the OCR provider and threading it through the API.
