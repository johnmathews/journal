# Entity highlighting fix, scroll-to-highlight, and reading mode

## Entity highlighting bug fix

When clicking an entity pill on `/entries/N`, the frontend searched the entry
text for the entity's `canonical_name` using a regex. This failed when the
canonical name didn't appear verbatim in the text — e.g., canonical "prayer"
when the text says "quiet reflection".

### Root cause
The API returned only the canonical name, not the verbatim `quote` that Claude
extracted during entity extraction. The quotes were stored in `entity_mentions`
but never sent to the frontend.

### Fix
- Backend now includes `quotes[]` in the entry-entities response.
- Frontend builds a single alternation regex from `canonical_name + aliases +
  quotes`, sorted longest-first so longer spans match before substrings.
- Tracks the selected entity by `id` instead of by name string.
- Filters out empty terms to prevent zero-length regex alternation.

## Scroll-to-highlight

Clicking an entity pill now auto-scrolls to the first highlighted match. A
watcher on `selectedEntityId` waits for two `nextTick()` cycles (so v-html
finishes rendering), then calls `scrollIntoView({ behavior: 'smooth', block:
'center' })` on the first `<mark>` element.

## Reading mode

Added a **Read / Edit** segmented toggle to the entry detail view:

- **Reading mode** — Single centered pane (`max-w-prose`) with comfortable
  serif typography (17px, 1.8 line-height). Shows the corrected text. Entity
  pills remain visible and functional.
- **Edit mode** — Existing two-pane OCR correction editor.

Default logic: if the entry has been edited before (`raw_text !== final_text`),
default to reading mode. Otherwise default to edit mode. The default is set via
a watcher on the entry ID with a `nextTick()` to ensure the entry's text fields
have settled before reading `isModified`.

## Other changes included in this commit

- `CreateEntryView.vue` — User manually changed the default tab to "upload
  images" (pre-existing change).
- `EntityListView.vue` — Formatting-only change from the linter (pre-existing).
- `docs/architecture.md` — Updated EntryDetailView description.
- Tests updated to account for default view mode logic.
