# Compress happy-flow notifications into a single toast

When adding a journal entry via audio ingestion, three separate success toasts
fired sequentially: "Audio ingestion completed successfully", "Mood scoring
completed successfully", "Entity extraction completed successfully". The same
pattern occurred for image ingestion and entry saves (re-embedding + entity
extraction + mood scoring). This was noisy for a business-as-usual happy flow.

## Solution: job grouping

Added a group concept to the jobs store. Call sites create a named group
(`createGroup(id, label)`) and pass the `groupId` to `trackJob()`. When all
jobs in a group reach terminal state and all succeeded, one summary toast fires
with the group label (e.g. "Entry created — all processing complete"). Failures
surface immediately regardless of group membership.

For ingestion flows (audio/image), the parent job completes first and the server
returns follow-up job IDs in `result.follow_up_jobs`. The store's `pollJob()`
detects these and automatically calls `trackJob()` for each follow-up with the
parent's `groupId`, so the follow-up jobs join the same group without the call
site needing to know about them.

## Files changed (18)

- `stores/jobs.ts` — Group tracking maps (`jobToGroup`, `groupInfo`), modified
  `trackJob` with optional `groupId`, `createGroup`, group query methods
  (`isGroupComplete`, `isGroupAllSucceeded`), follow-up assignment in `pollJob`
- `components/layout/AppNotifications.vue` — Group-aware `onJobComplete`:
  batches grouped successes, fires grouped failures immediately. Added missing
  `ingest_audio` label to `jobLabel` switch.
- `views/EntryDetailView.vue` — Groups reprocess + extraction + mood jobs on save
- `components/VoiceRecordPanel.vue` — Groups audio ingestion job
- `components/ImageUploadPanel.vue` — Groups image ingestion job
- `components/FileUploadPanel.vue` — Groups image + text ingestion jobs
- `components/TextEntryPanel.vue` — Now tracks mood + entity extraction jobs
- `types/ingest.ts` — Added `entity_extraction_job_id` to `IngestTextResponse`
- `api/entries.ts` — Added `mood_job_id` to `UpdateEntryTextResponse`
- `stores/entries.ts` — `saveEntryText` now returns `moodJobId`

## Tests

14 new tests covering group creation, membership, completion checks, follow-up
group assignment, grouped/ungrouped toast behavior, and mixed success/failure
scenarios. Total: 1160 tests, all passing. Coverage: 90.89% statements, 85%
branches, 87.46% functions, 92.57% lines.
