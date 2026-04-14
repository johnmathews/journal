# Add decisive_percentile to settings and remove stale model pricing

## What changed

1. **Settings view** — added `decisive_percentile` to the Chunking & Embedding card.
   This field was already returned by the server API and defined in the TypeScript types
   but was the only chunking parameter not rendered in the UI.

2. **Cost estimates** — removed stale `gemini-3-pro` and `gemini-3.1-pro` entries from
   `MODEL_PRICING`. These models are deprecated/shutdown. The server default changed to
   `gemini-2.5-pro` (which was already in the pricing table).

3. **Cost estimate test** — updated OCR cost test from `gemini-3-pro` to `gemini-2.5-pro`
   with correct expected values ($1.25/$10 pricing).

## Files changed

- `src/views/SettingsView.vue` — new decisive_percentile field
- `src/utils/cost-estimates.ts` — removed 2 stale model entries
- `src/utils/__tests__/cost-estimates.test.ts` — updated test model + expected cost
