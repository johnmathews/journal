# 2026-04-27 — Edit-pipeline notification consolidation (webapp)

## Why

PATCH `/api/entries/{id}` previously fired three Pushover notifications per edit (one per background job).
journal-server now consolidates those into one push (success summary or per-stage failure breakdown) via a
synthetic `save_entry_pipeline` parent job. See the matching journal entry in `journal-server` for the full design.

## What changed in the webapp

Almost nothing structural — the per-stage toast UX in `AppNotifications.vue` already emits one toast per terminal
job, which is the desired behavior. The save-flow plumbing in `EntryDetailView.vue` already creates a `groupId`
and tracks the three child job IDs returned from the PATCH response.

The single change here is a cosmetic rename of the dropdown-bell group label in `EntryDetailView.vue` from
`'Entry updated — all processing complete'` to `'Entry update'`. The old label would lie on a partial failure now
that the backend collapses error pushovers into the pipeline summary — the user could see a "all processing
complete" group title in the bell while the consolidated Pushover says "partial failure".

## API response shape

The PATCH response now includes a new optional `pipeline_job_id` field (the synthetic parent's job id). The
existing `entity_extraction_job_id`, `reprocess_job_id`, and `mood_job_id` fields are preserved unchanged, so the
existing `EntryDetailView.vue` save handler keeps working without modifications.

## Tests

All 1160 existing tests still pass. No new webapp tests added — the change is a one-line label rename.
