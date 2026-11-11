# Rename source_type values in frontend types and display

Updated the webapp to match the backend's new source_type taxonomy
(journal-server commit fb2ca46).

## Changes

- **TypeScript types** (`entry.ts`, `ingest.ts`): Updated union types from
  `'ocr' | 'voice' | 'manual' | 'import'` to
  `'photo' | 'voice' | 'text_entry' | 'imported_text_file' | 'imported_audio_file'`.
- **EntryDetailView**: Replaced raw `.toUpperCase()` display with a label map
  that shows human-friendly names (e.g. "Photo", "Text Entry", "Imported Text").
- **Tests**: Updated all 44 hardcoded source_type values across 8 test files.
  791 tests pass, coverage thresholds met.
