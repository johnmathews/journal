# Entity Name Display Normalisation

Added display-only normalisation for entity names across all views so
entity names render consistently regardless of how they were stored
during extraction.

## Problem

Entity names extracted by Claude were stored with inconsistent
capitalisation — e.g. "after school club" (all lowercase),
"Data modelling" (only first word capitalised), while "SQL" correctly
stayed uppercase. This looked messy in the entity list, detail view,
and entry chips.

## Approach

Display-side normalisation in the webapp — a pure utility function
applied in Vue templates. No changes to stored data, API responses, or
matching logic. This was the safest approach because:

- Entity matching (`_normalise()` on the server) uses lowercase and is
  unaffected.
- Edit forms still show and submit the raw `canonical_name`.
- Highlight text-matching uses raw names/aliases/quotes and is unaffected.
- Merge, delete, and relationship features all operate on entity IDs.

## New files

- `src/utils/entityName.ts` — `displayName()` and `displayAliases()`
  - Title-cases each word
  - Preserves ~50 known acronyms (SQL, API, HTML, etc.)
  - Handles special brand spellings (iPhone, GitHub, macOS, McDonald's, etc.)
  - Preserves unknown all-caps words (treats them as acronyms)
  - Replaces hyphens/underscores with spaces, collapses whitespace
- `src/utils/__tests__/entityName.test.ts` — 32 tests covering all rules

## Views updated

- `EntityListView.vue` — table rows, aliases, merge candidates, merge modal
- `EntityDetailView.vue` — heading, aliases, relationship names, delete dialog
- `EntryDetailView.vue` — entity chips and tooltips

## What was intentionally left unchanged

- Edit form pre-population (raw value for editing)
- `?highlight=` query param (raw value for text matching)
- `highlightTerms` computed (raw canonical_name + aliases for regex matching)
- Sort/filter logic (operates on raw data)
