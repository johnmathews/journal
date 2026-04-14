# Pipeline-Aligned Settings View with Cost Badges

**Date:** 2026-04-14

## What Changed

Rewrote the Configuration section of the Settings & Health page to align with the journal
processing pipeline stages documented in `external-services.md`.

### Before
Three generic sections: "OCR & Ingestion", "Chunking", "Features". No cost information.
Entity extraction config was not displayed.

### After
Four numbered pipeline sections, each with a cost badge:
1. **Ingestion** (~$0.014/page) — OCR provider/model, transcription model + cost/min
2. **Chunking & Embedding** (<$0.001/entry) — strategy, embedding model/dims, token params
3. **Mood Scoring** (~$0.008/entry) — model, enabled/disabled badge
4. **Entity Extraction** (~$0.020/entry) — model, dedup threshold, embedding model, author name

### New files
- `src/utils/cost-estimates.ts` — Model pricing lookup table and per-stage cost computation
  functions. Pricing data sourced from `docs/external-services.md`. Token assumptions documented
  inline.
- `src/utils/__tests__/cost-estimates.test.ts` — 13 tests covering all cost functions + formatting.

### Type changes
- Added `entity_extraction` block to `ServerSettings` interface (matches new backend API field).

## Design Decisions
- Cost computation lives in the frontend as a simple lookup table rather than being served by
  the backend. This keeps the API lean and makes pricing updates a single-file change.
- Costs are derived from model name → pricing lookup + standardized token assumptions. If a model
  isn't in the lookup table, the badge shows "—" instead of a wrong number.
