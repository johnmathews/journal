# Entry review flow improvements

## What changed

Two UX improvements to the `/entries/:id` view for the OCR review and edit workflow:

### 1. Auto-open edit + review mode when doubts exist

When navigating to an entry that has uncertain spans (OCR doubts), the view now
automatically opens in edit mode with the review toggle enabled. Previously, the user
had to manually switch to edit mode and check the review box — unnecessary friction
when the entry clearly needs review.

The view-mode watcher now checks `uncertain_spans.length > 0` on entry load. If doubts
exist, it forces `viewMode = 'edit'` and `showReview = true`. Entries without doubts
retain the previous behavior (read mode if already corrected, edit mode if fresh).

### 2. "All Verified" button also saves the entry

Clicking "All Verified" now saves any pending text edits before verifying doubts.
Previously, if the user had corrected text and then clicked "All Verified", only the
doubts were verified — the text edits were lost unless separately saved. The button now
calls `save()` first when `isDirty` is true, and aborts if the save fails.

### Tests updated

- 3 existing tests adapted for auto-review behavior (review toggle is now pre-checked
  when doubts exist, so assertions about "before toggling" state changed)
- 3 new tests: auto-open with doubts, no auto-open without doubts, verify-saves-dirty
- 1 new test: verify-skips-save-when-clean
- Added `verifyDoubts` mock to the API mock setup
