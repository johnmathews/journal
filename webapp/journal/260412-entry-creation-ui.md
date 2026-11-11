# Entry Creation UI

**Date:** 2026-04-12
**Scope:** journal-webapp

## What shipped

New `/entries/new` route with three creation modes:

1. **Write Entry** (default tab) — textarea with live word count, creates via
   `POST /api/entries/ingest/text`
2. **Import File** — drag-drop `.md`/`.txt` with content preview, creates via
   `POST /api/entries/ingest/file`
3. **Upload Images** — multi-image drag-drop with thumbnails, reorder, and
   async OCR processing via `POST /api/entries/ingest/images`

## Components added

- `CreateEntryView.vue` — shell with tab bar, shared date picker, error display
- `TextEntryPanel.vue` — textarea + word count + submit
- `FileImportPanel.vue` — file drop zone + content preview + import
- `ImageUploadPanel.vue` — image drop zone + thumbnails + reorder + progress

## Navigation changes

- Sidebar: "New Entry" link with + icon (between Entries and Search)
- EntryListView: "New Entry" button in header (top-right)
- Router: `/entries/new` route before `:id` pattern

## Infrastructure

- `src/types/ingest.ts` — request/response types
- `src/api/entries.ts` — three new API client functions with multipart support
- `src/stores/entries.ts` — `createTextEntry`, `importFile`, `uploadImages` actions
- `src/stores/jobs.ts` — `fetchJob` method for polling image ingestion progress
- `source_type` union extended: `'ocr' | 'voice' | 'manual' | 'import'`
- `JobType` extended: added `'ingest_images' | 'mood_score_entry'`

## Tests

47 new tests across 4 spec files. 413 total passing.

Sibling server commit covers the API endpoints and backend infrastructure.
