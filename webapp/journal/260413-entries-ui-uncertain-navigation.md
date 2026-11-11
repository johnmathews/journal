# Entries UI: OCR doubts column, corrected text highlighting, uncertain region navigation

## What changed

### Entries list (`/entries`)

- **Column reorder** for mobile usability: Date, Ingested, OCR Doubts, Words,
  Pages, Chunks. Most important columns appear leftmost.
- **New "OCR Doubts" column**: shows `uncertain_span_count` from the API with
  color coding — green (0), amber (1-2), red (3+). Sortable like all columns.
- **Responsive hiding**: Pages and Chunks columns are hidden below the `sm`
  breakpoint (640px). Landscape mode shows all columns with horizontal scroll.

### Entry detail (`/entries/:id`)

- **Review (N) label**: the Review checkbox now shows the count of uncertain
  spans when they exist, e.g. "Review (3)".
- **Corrected text highlighting**: uncertain spans are now highlighted in both
  the Original OCR panel AND the Corrected Text panel. The corrected-side
  highlighting uses regex matching — for each uncertain span, the literal text
  is extracted from `raw_text` via char offsets, then searched for in
  `final_text`. If the user has already corrected the uncertain word, the regex
  won't match and the highlight disappears (correct behavior). Short spans
  (< 3 chars) include surrounding context in the regex to avoid false positives.
- **Floating navigation bar**: a sticky bar appears when Review mode is active
  and uncertain spans exist. Shows "X / Y doubts" with Prev/Next buttons.
  Navigation targets only the Corrected Text panel (where edits happen), not the
  read-only Original OCR panel. A violet ring highlights the current region.
  Initially navigation traversed marks in both panels, doubling the count and
  causing the counter to show nonsensical values like "3/2 doubts" — fixed by
  scoping DOM queries to a `correctedPanelRef`. Removed the redundant "Jump"
  button (it just re-scrolled to the already-current mark).

### Implementation details

- `mapUncertainToCorrected()` added to `useDiffHighlight.ts` — pure function
  that maps raw_text uncertain spans to corrected text positions via regex.
- `segmentsToHtml()` now emits `data-uncertain="N"` attributes on uncertain
  `<mark>` elements, enabling DOM queries for navigation.
- `EntrySummary` type updated with `uncertain_span_count: number`.
- All existing tests updated to include the new field in fixtures.
- 9 new tests added across composable and view test files.

## Coverage

All thresholds met: Statements 91.89%, Branches 85.53%, Functions 90.36%, Lines 93.48%.
