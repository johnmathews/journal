# 2026-05-07 — Entry edit: Corrected Text on the left

Tiny UI tweak in `src/views/EntryDetailView.vue` (commit `f99cc12`):
swap the two side-by-side `<section>` blocks inside edit mode so the
user's primary editing surface (Corrected Text + textarea + diff
overlay) is on the left, and the read-only Original OCR /
Transcription panel is on the right. Pure markup reorder — refs,
testids, classes, templates, and event handlers are all unchanged.

## Why

Editing is the dominant action on `/entries/N`. Putting the textarea
on the left puts the primary action in the position eyes default to
on a left-to-right layout; the OCR / transcription "source of truth"
becomes a reference panel on the right.

## Verification

1. `npm run lint` — clean.
2. `npm run test:unit` — 1354 tests pass.
3. `npm run build` — type-check + bundle clean.
4. Visual verification with Playwright was deferred — it would have
   required standing up the full local stack (ChromaDB + backend +
   verified-user setup) for a flex-row child reorder. The change is
   pure markup; if anything went wrong it would have been a build or
   lint error, not a runtime issue.

CI on `main` passed on the first push.

## Context

Landed alongside two unrelated server-side changes in the same
working session:

1. `journal-server` — heading_detector keeps the date phrase in the
   body (revert of an earlier strip).
2. `journal-server` — `mcp_server.py` (1513 lines) split into a
   package: `bootstrap.py` / `app.py` / `runserver.py` /
   `tools/{_ctx,queries,ingestion,entities,jobs}.py`. See
   `journal-server/journal/260507-round-3-mcp-server-split-and-date-fix.md`
   for the full picture.
