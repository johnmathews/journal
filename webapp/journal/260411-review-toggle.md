# 260411 — Review toggle for OCR uncertainty spans (webapp side)

Cross-cutting change with
`journal-server/journal/260411-ocr-uncertainty-review.md`. Server side
lands the ingestion + storage + API plumbing. This commit lands the
UI that consumes it.

## What shipped

### Type (`src/types/entry.ts`)

Added an `UncertainSpan` interface (`{char_start, char_end}`) and a
required `uncertain_spans: UncertainSpan[]` field on `EntryDetail`.
Made it required rather than optional because the server contract
guarantees the field is always present (empty for old entries,
populated for new ones).

Updating the type surfaced four fixture files that were constructing
`EntryDetail` objects without the new field — all four were updated
to include `uncertain_spans: []`. No runtime change, just stricter
type coverage.

### `useDiffHighlight` composable

Extended with two new `HighlightKind` values:
- `uncertain` — yellow background + dotted underline, for the normal
  case of a flagged word in unchanged text.
- `diff-delete-uncertain` — composite for the overlap case, rendered
  as a red-delete background with an additional yellow ring outside
  the rounded corners. Both signals stay visible.

Added a new `applyUncertainOverlay(segments, spans)` helper that
walks the original-side segments (whose concatenation equals the
source text) with a running offset, re-segmenting any character
ranges that overlap an uncertain span. Normalises the input spans
first (sort, drop invalid, merge overlaps) so callers don't need to
clean their data. The output still satisfies
`join(segments.text) === original` — the invariant matters because a
future downstream consumer (e.g. click-to-scroll deep linking) might
rely on the character offsets.

Extended `diffToSegments` to accept an optional `uncertainSpans`
parameter and apply the overlay to the original-side segments only.
The corrected-side segments are untouched — uncertainty is a
property of the raw OCR reading, not the user's correction.

Extended `useDiffHighlight` to accept a `{ uncertainSpans, showReview }`
options bag. The options object is preferred over positional args so
future overlays don't make the signature balloon. When
`showReview.value` is false (or `uncertainSpans` is missing), the
output is identical to the pre-change composable — guaranteed by 34
unit tests covering every combination of diff-on/off, review-on/off,
plain spans, spans crossing delete boundaries, out-of-order input
spans, and overlapping input spans.

### `EntryDetailView` toolbar

1. Added a `showReview = ref(false)` alongside the existing
   `showDiff`. Wired into `useDiffHighlight` via the new options bag.
2. Added a computed `uncertainSpans` that reads
   `store.currentEntry?.uncertain_spans ?? []` and a
   `hasUncertainSpans` computed that gates the toggle's disabled
   state.
3. A `watch` on `store.currentEntry?.id` resets `showReview` to false
   whenever the user navigates to a different entry — carrying the
   old toggle state into a different entry (especially one with no
   spans) would be confusing.
4. Added a Review checkbox to the toolbar, copying the `showDiff`
   pattern. When the current entry has no `uncertain_spans`, the
   checkbox is disabled and its label carries a tooltip explaining
   why. When it has spans, the tooltip describes what the toggle
   does.
5. Extended the diff legend to show an "uncertain" swatch when the
   Review toggle is on. The legend is visible whenever either
   `showDiff` or `showReview` is on.

### Tests

1. `useDiffHighlight.test.ts` — added 22 tests covering:
   - `applyUncertainOverlay` with every edge case (empty input,
     middle/start/end spans, adjacent spans, multi-span, overlap
     with delete, span crossing a segment boundary, out-of-order
     input, overlapping input, zero-length spans).
   - `diffToSegments` with uncertain spans (original side gets them,
     corrected side doesn't).
   - `useDiffHighlight` with the Review toggle (suppression, apply,
     reactive toggle, works with diff off, composite overlap class).
2. `EntryDetailView.test.ts` — added 6 tests for the toggle UI:
   renders in the toolbar, disabled state, enabled state, applies
   highlighting on Original OCR panel, doesn't affect Corrected
   Text panel, legend visibility gated on toggle state.

Final webapp suite: **322 tests pass**, build clean, lint clean.

## Playwright visual verification

Rather than rely only on the component tests (which run in
happy-dom), I booted the full stack locally and verified the toggle
in a real browser:

1. Started a fresh ChromaDB (`uv run chroma run --path /tmp/chroma-playwright`).
2. Seeded a temp SQLite DB (`/tmp/journal-review-playwright.db`) with two entries:
   - Entry 1: "Today I walked to the park and met Ritsya near the
     fountain by Vienna Street. The sky was a brilliant cerulean blue
     and the magnolias had just begun to bloom." — with `uncertain_spans`
     pointing at `Ritsya`, `Vienna Street`, `cerulean`, and `magnolias`.
   - Entry 2: "A second entry with no uncertain spans recorded…" —
     no spans at all.
3. Started `journal-server` with the temp DB and a test bearer token.
4. Started `journal-webapp` dev server with the matching token.
5. Navigated to `/entries/1` and toggled Review on. All four
   uncertain words/phrases lit up yellow on the Original OCR panel;
   the Corrected Text panel stayed untouched; the legend added an
   "uncertain" swatch. No console errors (aside from a stock missing
   `/favicon.ico` 404).
6. Navigated to `/entries/2`. Review toggle rendered in the
   disabled/greyed state as expected.

Screenshots live at `~/projects/journal/entry-detail-review-*.png`
(temporary, not committed). Cleaned up the temp DB, ChromaDB, and
env files after verification.

## Key decisions

### Options bag vs positional args on `useDiffHighlight`

Went with `useDiffHighlight(original, corrected, enabled, options)`
rather than adding two positional args. If we add a third or fourth
overlay dimension in the future, the options bag stays clean.
Existing call sites that don't care about Review are unchanged.

### Required `uncertain_spans` field, not optional

The server contract always returns the field, so making it optional
on the client would be lying about the contract. The small amount of
fixture churn (four test files) was worth the stricter type coverage
— future tests that try to build an `EntryDetail` without the field
will get a TypeScript error at compile time.

### Disabled vs hidden when no spans

Chose "disabled with tooltip" over "hidden entirely" because the
toggle's absence would be more surprising than its greyed presence —
a user coming back to an old entry after using the feature would
wonder whether the toggle was removed. The tooltip explains exactly
why the toggle is inert for that entry.

### Yellow + dotted underline rather than a plain background

Went with `bg-yellow-200 + underline decoration-dotted decoration-yellow-700`
(dark mode: `bg-yellow-400/40`) rather than a solid yellow block.
The dotted underline reads as a "pay attention to this" cue rather
than a "this was deleted/added" cue, which matches the mental model
— the user is being asked to review, not told the word is wrong.

### Composite style for the overlap case

An uncertain span that falls inside a diff-delete region uses a
composite class: red-delete background + `ring-1 ring-yellow-500`.
Ring sits outside the rounded corners, so it reads as a distinct
signal rather than blending into the red. Tested explicitly so a
Tailwind purge that dropped one of the two wouldn't silently degrade.

## What didn't change

- **Corrected Text panel** — uncertainty never touches it. The
  panel is unaffected whether Review is on or off, whether the
  overlay is on chunks/tokens/off, whether the user is editing or
  not.
- **Tokens API consumer** — no changes to `useOverlayHighlight` or
  the chunks/tokens radio group.
- **Pinia store** — no store changes. The Review toggle state is
  component-local (matches the `showDiff` pattern). The span data
  already flows through `store.currentEntry`, which the detail view
  populates via `fetchEntry`.

## Followups

- The server may eventually graduate the binary signal to a graded
  one (low / medium / high). The composable's `HighlightKind` union
  can grow without reshaping the API — the `applyUncertainOverlay`
  helper would need to pick the class based on the span's level.
- A re-OCR flow for old entries would populate historical
  `uncertain_spans`. Out of scope here.
