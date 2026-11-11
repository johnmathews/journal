# Entry content-window UI (feature/multipage-entry-boundaries)

Date: 2026-06-18

## What shipped

The webapp gained a content-window rendering and boundary adjustment UI to support
multi-page OCR entries where a single scan covers two adjacent journal pages (server
PR #48, feature branch `feature/multipage-entry-boundaries`).

## The `content_boundary` field

The server now includes `content_boundary: { char_start: number; char_end: number } | null`
on every entry API response (typed in `src/types/entry.ts`). When set, it identifies the
contiguous slice of `raw_text` that belongs to this entry — text outside those offsets is
the neighbouring entry's content that appeared on the same scanned page.

## Out-of-bounds greying — `applyOutOfBoundsOverlay`

`src/composables/useDiffHighlight.ts` gained a new `HighlightKind` value `'out-of-bounds'`
(styled `opacity-40 line-through decoration-gray-400`) and the exported function
`applyOutOfBoundsOverlay(segments, boundary, textLength)`.

The function walks the existing segment list and splits any segment that straddles a
boundary edge, promoting the out-of-bounds pieces to `'out-of-bounds'`. It is a no-op when
`boundary` is null or covers the entire text. It is applied in `useDiffHighlight` after
`applyUncertainOverlay`, so diff and uncertainty highlights are preserved for in-bounds
text and the greying only affects the neighbour-entry portions.

`EntryDetailView` passes `contentBoundary` (a computed ref from `store.currentEntry?.content_boundary`)
into `useDiffHighlight` via the options bag, so the Original OCR panel automatically
greys out-of-bounds text whenever a boundary is present. The Corrected Text panel is
unaffected — it contains only the in-bounds text.

## Boundary control bar

A `data-testid="boundary-controls"` bar is conditionally rendered in edit mode when
`store.currentEntry.content_boundary` is non-null. It contains:

- A **char-range label** showing the current `char_start`–`char_end` values.
- A **"Use full page"** button — calls `saveBoundary(null, null)` which sends
  `PATCH /api/entries/{id}` with `content_boundary: null`, removing the boundary.
- **"Start paragraph"** and **"End paragraph"** `<select>` dropdowns, each offering
  one option per paragraph-break offset in `raw_text` (double-newline split).

`paragraphBreaks` is a computed array of char offsets (`[0, ...]`) built from `raw_text`.
`nearestBreakIdx` maps a stored `char_start`/`char_end` to the closest paragraph break
index for the initial select value.

### Inverted-window guard

`onStartBreakChange` and `onEndBreakChange` read the persisted opposite endpoint from
`content_boundary` (not from the other select) so that adjusting one end does not
silently re-snap the untouched end. Before calling `saveBoundary`, each handler checks
`start >= end` and returns early if the window would be zero-width or inverted.

## Save path — `updateEntryBoundary` / `saveEntryBoundary`

`src/api/entries.ts`: `updateEntryBoundary(id, start, end)` sends
`PATCH /api/entries/{id}` with `{ content_boundary: start !== null && end !== null ? { char_start: start, char_end: end } : null }`.

`src/stores/entries.ts`: `saveEntryBoundary(id, start, end)` calls the API function,
writes the full updated entry back to `currentEntry`, and returns
`{ extractionJobId, reprocessJobId, moodJobId }` from the server response. The view
tracks those jobs via `useJobsStore` (grouped under "Boundary update") exactly as it
does for text saves — entity extraction, embedding reprocessing, and mood scoring all
rerun against the new content window. A success toast reads
"Boundary saved. Background jobs running."
