# Non-blocking upload flow and mobile editor improvements

## What changed

### Non-blocking image upload
The upload flow (`ImageUploadPanel`) was blocking: after clicking "Upload & Process",
the user had to wait for OCR processing to finish before starting a new entry. The
processing screen also auto-navigated to the entry detail page on completion,
interrupting any attempt to batch-upload multiple entries.

Fixed by:
- Registering submitted jobs with the jobs store (`trackJob`) instead of polling
  locally in the component
- Adding an "OK" button to the processing screen that dismisses it and resets the
  form for a new entry
- Removing the auto-navigation to `entry-detail` on job completion
- The jobs store handles polling; `AppNotifications` shows progress in the header

### Toast notification system
Created a lightweight toast system (`useToast` composable + `AppToast` component)
with module-level reactive state, auto-dismiss, and success/error/info types.
Mounted globally in `DefaultLayout`.

Used in two places:
- `AppNotifications` fires toasts when any job reaches terminal state (success or
  error), so the user gets non-blocking feedback even if they've navigated away
- `EntryDetailView` fires a toast on save: "Text saved. Entity extraction running
  in background." (or just "Text saved." when no extraction job is triggered)

### Auto-sizing text areas on mobile
The OCR editor panels (`EntryDetailView` edit mode) had fixed minimum heights
(`min-h-[300px]`) and internal scrolling (`overflow-auto`). On mobile, this meant
the text areas were small and needed scrolling to see all content.

Fixed by:
- Switching the corrected text panel from `relative` + `absolute inset-0`
  positioning to a CSS Grid overlay pattern (`[grid-area:1/1]`). An invisible
  sizer div, a visible backdrop, and the transparent textarea all share one grid
  cell. The sizer determines the natural height.
- Removing `overflow-auto`, `min-h-[300px]`, and `flex-1` constraints from both
  panels on mobile. Sections use `lg:flex-1` (flex only on desktop for equal widths).
- Removing the scroll sync function (`syncCorrectedScroll`) and its watcher, since
  panels no longer scroll internally.

## Files changed

- `src/composables/useToast.ts` (new)
- `src/components/AppToast.vue` (new)
- `src/components/ImageUploadPanel.vue` — non-blocking flow
- `src/components/layout/AppNotifications.vue` — toast on job completion
- `src/views/EntryDetailView.vue` — auto-sizing, save toast, cleanup
- `src/views/CreateEntryView.vue` — removed unused `@created` binding
- `src/layouts/DefaultLayout.vue` — mount `AppToast`
- `docs/architecture.md` — updated composable and view descriptions

## Tests

- New: `useToast.test.ts` (8 tests), `AppToast.spec.ts` (5 tests)
- Updated: `ImageUploadPanel.spec.ts` (+4 tests for non-blocking flow)
- Updated: `CreateEntryView.test.ts` (removed `created` emit from stub)
- 588/588 passing, all coverage thresholds met
