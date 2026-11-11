# Column Reorder and New Columns

## What changed

Added user-configurable column reordering and three new columns to the
entries table, with preferences persisted per-user on the server.

### New columns (hidden by default)

- **Language** — entry language in uppercase (e.g., "EN", "NL")
- **Modified** — `updated_at` timestamp, formatted like the Ingested column
- **Entities** — count of entity mentions extracted from the entry

### Column reordering

The Columns dropdown menu now includes drag handles (grip dots) next to
each column name. Dragging items reorders the columns in the table.
Both visibility and order are persisted.

### Server-persisted preferences

Column preferences (visibility map + order array) are saved via the
existing `PATCH /api/users/me/preferences` endpoint under the key
`entry_list_columns`. This follows the same debounced-save pattern
used by the dashboard layout. Settings follow the user across clients.

Earlier iterations used localStorage and a separate Edit mode toggle
button. The Edit button was removed because it was not discoverable —
users had to click Edit, then open the Columns menu to see drag handles.
Making drag handles always visible in the Columns menu is simpler and
more intuitive.

### Server-side changes

The `GET /api/entries` summary response now includes three new fields:
`language`, `updated_at`, and `entity_mention_count`. The entity mention
count uses a new `get_entity_mention_count` repository method that queries
`COUNT(*) FROM entity_mentions WHERE entry_id = ?`.

### Template refactor

The table template was refactored from per-column `v-if` blocks to a
dynamic `v-for` over an ordered `ColumnDef` array. This enables column
reordering and makes adding new columns simpler — just add to the
`COLUMNS` array with alignment and label metadata. Cell rendering is
handled by `cellValue()` and `cellClasses()` helper functions.

## Decisions

- Drag handles always visible (no edit mode) — simpler, more discoverable
- Server persistence over localStorage — consistent across clients
- New columns hidden by default — keeps the table clean for existing users
- 500ms debounce on preference saves — avoids hammering the API during
  rapid drag reordering
