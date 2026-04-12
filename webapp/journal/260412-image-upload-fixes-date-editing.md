# Image Upload Fixes and Date Editing

**Date:** 2026-04-12

## Context

First real-world test of image upload from a phone. Several issues surfaced
across the nginx proxy, API client, error display, and mobile layout.

## Issues Found and Fixed

### 1. Nginx 413 — body too large

Added `client_max_body_size 20m` to the `/api/` location block in nginx.conf.

### 2. Multipart Content-Type bug

`apiFetch` always set `Content-Type: application/json`, breaking `FormData`
uploads. Fixed by detecting `FormData` and omitting the header so the browser
sets the correct `multipart/form-data; boundary=...`.

### 3. Error message extraction

The server returns `{"error": "description"}` but the client only checked
`body.message` (which doesn't exist), falling back to "HTTP 400". Now falls
through to `body.error` for the actual error description.

### 4. Duplicate error display

`CreateEntryView` and `ImageUploadPanel` both displayed
`entriesStore.createError`. Removed the duplicate from `ImageUploadPanel`.

### 5. Error UX improvements

Added dismiss button to error banner, clear error on tab switch.

### 6. Mobile corrected text panel invisible

On mobile (flex-col), the corrected text panel collapsed to near-zero height
because its children use absolute positioning (mirror-div technique). Added
`min-h-[300px] lg:min-h-0` to both editor sections.

### 7. Date editing

Added clickable date heading in EntryDetailView that reveals an inline date
picker. Wired to new `updateEntryDate` API function hitting the server's
extended PATCH endpoint.

### 8. Review toggle UX

Review checkbox was greyed out when no uncertain spans existed, which was
unintuitive. Now always clickable — shows a blue info banner when no
uncertain words were detected.

### 9. Duplicate upload error messages

Changed cryptic hash-based messages ("Image already ingested (hash:
a8c785720939...)") to user-friendly text explaining the issue and how
to fix it.

### 10. "Add more images" → "Add image"

Simpler label since the mobile file picker typically only allows selecting
one image at a time.

### 11. Entity detail — grouped by entry

EntityDetailView mentions now grouped by journal entry instead of a flat
list. Each entry shows date, mention count, and quotes. Click-through
passes `?highlight=entityName` to highlight the entity in entry text.

### 12. Entity highlighting in entry detail

EntryDetailView reads `?highlight=` query param and wraps matching text
in violet highlights in both Original OCR and Corrected Text panels.
Entity chips on the entry detail header now toggle in-page highlighting
instead of navigating to entity detail.

### 13. Sortable tables

Both `/entries` and `/entities` tables have sortable columns with click
toggle and direction indicators. Entries default to date descending,
entities default to name ascending.

### 14. Entity last_seen column

Server API extended: entity summary now includes `last_seen` (MAX
entry_date from mentions, computed via LEFT JOIN). New column in the
entity list table.

## Tests

- Server: 682 passed
- Webapp: 447 passed (coverage: functions 90.74%, above 90% threshold)
- CI fixes: missing `last_seen` in EntitySummary mock data, inline
  `@click` handler extracted to method
