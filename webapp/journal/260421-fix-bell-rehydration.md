# Fix notification bell not discovering follow-up jobs

**Date:** 2026-04-21

## Problem

The notification bell showed "No recent jobs" even when entity extraction was actively running.
The bell only discovered active jobs via `hydrateActiveJobs()`, which ran once on component mount
and never re-fetched. Server-spawned follow-up jobs (like entity extraction queued after image
ingestion) were invisible because they were created after the initial hydration.

## Fix

When `pollJob` detects a tracked job has reached terminal state (succeeded/failed), it resets the
`hydrated` flag and calls `hydrateActiveJobs()` again. This discovers any follow-up jobs the
server queued as a side-effect of the completed job.

## Files changed

- `src/stores/jobs.ts` — re-hydrate on terminal state in `pollJob`
- `src/stores/__tests__/jobs.spec.ts` — test for follow-up job discovery after terminal state
