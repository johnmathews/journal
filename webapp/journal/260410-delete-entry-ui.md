# Delete entry from the webapp

Webapp side of the DELETE endpoint work. Server changes land in journal-server
under the matching date.

## UI placement

Delete only lives on `EntryDetailView`, not on the list row. Rationale:

- The list row is already a click target for navigation — adding a secondary
  click target means stop-propagation and a new visual affordance. Avoidable.
- Delete is destructive. Forcing the user to open the entry first means they
  see the actual text one last time before confirming. That's useful friction.
- The "entry as fundamental unit" framing from the existing memory note —
  users work one entry at a time, so the detail view is the right home for
  single-entry mutations.

The button sits in the editor toolbar, left of Reset/Save, styled with a
red outline so the destructive action is visually distinct from the
violet "commit your edits" button. `window.confirm` guards the click.

## Store action

`useEntriesStore.deleteEntry(id)`:

1. Calls the DELETE API
2. On success, patches local state optimistically — **but after** the network
   call, so we don't flash a stale entry back if the server 404s:
   - `entries` filtered to exclude the deleted id
   - `total` decremented (floored at 0)
   - `currentEntry` cleared if it's the one we just removed
3. On failure, sets `error` and rethrows so the view can surface an inline
   banner and keep the user on the page

## Route-guard interaction

`EntryDetailView` has an `onBeforeRouteLeave` guard that prompts on unsaved
edits. The first pass of this work called `reset()` before the delete API
call to avoid a second confirm dialog. During review I realised that's both
wasteful (we're throwing the edits away anyway) and wrong on failure (if
delete fails, the user's in-progress edits are gone with no API roundtrip
to explain it).

The cleaner fix: `useEntryEditor`'s `isDirty` already returns `false` when
`currentEntry` is null. The store clears `currentEntry` on successful
delete, so by the time `router.push` fires, the guard sees
`isDirty === false` and lets us through. No reset needed, no lost edits
on failure.

## Tests

- `api/__tests__/entries.test.ts`: one test verifying `deleteEntry` sends
  the right HTTP method
- `stores/__tests__/entries.test.ts`: four tests — list/total patch, clearing
  `currentEntry` when it matches, error-and-rethrow, fallback error message
- `views/__tests__/EntryDetailView.test.ts`: five tests in a new
  `delete flow` block — button renders, cancel short-circuits, confirm
  calls API and navigates, inline error banner on failure, and the
  "dirty editor does not double-prompt" case that caught the `reset()` bug

happy-dom doesn't ship `window.confirm`, so the delete block sets up
`window.confirm` in `beforeEach` via a plain `vi.fn()` rather than
`vi.spyOn`, and restores the original in `afterEach`.

All 124 tests pass; eslint clean; `npm run build` clean; coverage still
inside thresholds (96.9% statements, 91.4% branches).

## Playwright verification

Took a screenshot of the detail view to confirm the red Delete button lands
cleanly between the "Show diff" toggle and the Reset/Save pair, then
clicked it to verify the confirm dialog fires with "Delete the journal
entry for 22 March 2026? This cannot be undone." — dismissed without
actually deleting because the running local `python3 -m journal.mcp_server`
process on port 8400 was started before the DELETE route was added, so
it would have returned a 405. A server restart picks up the new route
automatically.
