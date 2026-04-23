# Cost Estimates & Editable API Pricing

## What changed

### Dockerfile fix (journal-server)
The Docker CMD used `uv run python -m journal.mcp_server`, which triggered a dependency
sync on every container start — downloading ruff and other dev dependencies each boot.
Changed to `/app/.venv/bin/python -m journal.mcp_server` to skip the sync entirely since
the venv is built during the Docker image build.

### Consistent per-1k-words cost units (journal-webapp)
Pipeline cost badges previously mixed "/1k words" (OCR, audio) and "/entry" (chunking,
mood, entities). All badges now use "/1k words" consistently. The per-entry estimates
assumed ~500 words, so per-1k-words is a 2x scale factor.

### Total cost summary section (journal-webapp)
Added a new card at the bottom of the Processing Pipeline showing:
- Image ingestion subtotal (OCR + enrichment)
- Audio ingestion subtotal (transcription + enrichment)
- First edit subtotal (re-chunking + re-scoring)
- Grand totals for image+edit and audio+edit

### Dual-pass OCR cost accuracy (journal-webapp)
When dual-pass OCR is enabled, the cost now sums both models (claude-opus-4-6 +
gemini-2.5-pro) instead of showing only the primary provider's cost. The OCR badge
shows "(dual-pass)" label when active.

### Server-stored API pricing (both repos)
New `pricing` table (migration 0017) stores per-model costs:
- LLMs: $/MTok input and output
- Embeddings: $/MTok input (output always 0)
- Transcription: $/minute

API endpoints:
- `GET /api/settings/pricing` — returns all pricing entries
- `PATCH /api/settings/pricing` — admin-only bulk update
- Pricing also included in `GET /api/settings` response

Frontend `cost-estimates.ts` refactored to accept a `PricingConfig` parameter
(with hardcoded defaults as fallback). The settings store builds a reactive
`PricingConfig` from server data, so cost panels update instantly when pricing changes.

### API Pricing UI section (journal-webapp)
New section in Settings showing all models grouped by category with inline editing.
Hover a model to reveal Edit button, update the $/MTok values, Save. The
`last_verified` date auto-updates on save. All cost estimates in the page recalculate
immediately.

## Decisions
- Pricing stored server-side (not localStorage) so it persists across devices and is
  available to other clients (MCP, CLI).
- Hardcoded defaults remain in the frontend as fallback for when server pricing is
  unavailable (offline dev, tests).
- Dual-pass OCR models are hardcoded in the frontend constant `DUAL_PASS_MODELS` to
  match the server's `_DEFAULT_MODELS`. If these ever change server-side, the frontend
  constant needs updating too.
