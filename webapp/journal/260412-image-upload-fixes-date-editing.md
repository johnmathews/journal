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

## Tests

- All 441 tests pass
- CI fix: extracted inline semicolon `@click` handler to named method
  (`switchTab`) to avoid Vue template parser failure after Prettier reformatting
