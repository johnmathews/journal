# Individual toasts per pipeline stage

## Problem

The webapp compressed all pipeline job toasts into a single summary: when all
jobs in a group succeeded, one toast fired with the group label ("Entry created
— all processing complete"). But on partial failure (e.g. entity extraction
fails, mood scoring succeeds), no success toast fired at all — the user only
saw the error toast and never learned that the entry was created or which
enrichments worked.

This was asymmetric with the server-side Pushover notification compression,
which correctly handled partial failures by sending a combined notification
with results from whichever follow-ups succeeded.

## Solution

Removed the grouped toast logic from `AppNotifications.vue`. Every job now
fires its own individual toast immediately on completion — success or error.
The reasoning: toasts are transient (5s auto-dismiss) and non-blocking, so
three toasts stacking briefly is fine UX. Pushover notifications continue
to be compressed server-side (one push per pipeline).

This gives the user clear per-stage feedback in every scenario:
- Happy path: 3 success toasts (ingestion, mood, entities)
- Partial failure: success toasts for what worked + error toast for what failed
- Total failure: error toast for the parent, no follow-ups

Group-based dismiss timers are preserved — related jobs still disappear from
the notification bell dropdown together.

## Files changed

- `components/layout/AppNotifications.vue` — Removed `firedGroups` set and
  all grouped/ungrouped branching in `onJobComplete`; unified to always fire
  per-job toasts
- `components/layout/__tests__/AppNotifications.test.ts` — Updated 2 grouped
  toast tests to expect individual toasts; added mixed-outcome test verifying
  both error and success toasts fire for partial failures
- `docs/architecture.md` — Updated jobs store description to reflect new
  toast behavior
