# Verify All Doubts Button

Added an "All Verified" button to the OCR doubt review floating nav bar,
allowing users to confirm that all remaining uncertain words are correct
without editing them.

## What changed

- **Types**: Added `doubts_verified: boolean` to both `EntrySummary` and
  `EntryDetail` interfaces.
- **API client**: New `verifyDoubts(id)` function calling
  `POST /api/entries/{id}/verify-doubts`.
- **Store**: New `verifyDoubts` action that calls the API and updates
  `currentEntry` with the verified state.
- **EntryDetailView**: Green "All Verified" button in the floating doubt
  navigation bar (visible when reviewing doubts). Uses `window.confirm`
  for confirmation, consistent with the existing delete confirmation
  pattern. After verification, the review panel closes automatically.
- **Tests**: 3 new store tests + updated all existing test fixtures to
  include the `doubts_verified` field.

## UX flow

1. User opens an entry and enables the Review toggle
2. The floating nav bar shows "X / N doubts" with Prev/Next/Jump
3. User reviews the highlighted uncertain words
4. If all look correct, clicks "All Verified"
5. Confirmation dialog appears
6. On confirm: API call sets `doubts_verified`, review panel closes,
   list view shows 0 doubts with green color
