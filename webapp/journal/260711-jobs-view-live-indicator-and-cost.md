# 1. Job History view — live running indicator + token/cost columns

**Date:** 2026-07-11 · **Branch:** `worktree-eng-jobs-throughput-and-observability`

Webapp side (W4) of a cross-cutting change. The server side (journal-server, same branch name) added parallel job execution and per-job token/cost capture; this makes the `/jobs` view the place to see what's running, whether it's stuck, and what it cost.

## 1.1 What shipped

`src/views/JobHistoryView.vue`:

1. **Live running indicator.** The job with `status === 'running'` shows an `animate-spin` spinner (SVG copied verbatim from `FitnessView.vue`) plus a duration that counts up each second. A reactive `now = ref(Date.now())` ticked by a 1s `setInterval` drives `liveDuration(job)` and `isStuck(job)`. The existing Duration column showed `-` for running jobs; this fills that gap. Past 120s the counter turns amber as a "stuck" signal; the failed badge gained a red ring for prominence (the natural hook for a future out-of-credits state).
2. **Auto-poll.** A 3s `setInterval` calls the existing `load()` only while `hasRunningJob` (any running/queued) and not already loading, so status/duration/new jobs update without clicking Refresh. Both intervals are cleared in `onUnmounted` (a leak here would also cause "update unmounted component" warnings — covered by a test).
3. **Cost/token columns.** In / Out / Cost columns appended after Duration (appended, not inserted, so existing index-based cell tests stay valid), rendering the server's new nullable `input_tokens` / `output_tokens` / `cost_usd` fields. Running-total tiles above the table sum them over the loaded page, labelled "(this page)" since the list paginates 25.
4. **Formatters.** New `src/utils/format-metrics.ts`: `formatDurationSeconds`, `formatTokens`, `formatUsd`. `formatUsd` deliberately omits the `~` prefix that `cost-estimates.ts::formatCost` uses — these are measured job costs, not estimates.

`src/types/job.ts` gained the three optional nullable fields; `src/api/jobs.ts` needed no change (it passes the JSON through).

## 1.2 Notes

1. **Per-page totals, not grand total.** The tiles sum the currently-loaded 25-job page. A true all-time total would need a server aggregate endpoint — deferred.
2. **Graceful degradation.** The three fields are optional; if the deployed server predates the contract they render `—`, so merge/deploy order between the repos doesn't matter.

## 1.3 Testing

Strict TDD. 11 formatter tests (100% coverage on `format-metrics.ts`) + 9 view tests under `vi.useFakeTimers()`: spinner renders for running only, live counter advances on tick, stuck→amber vs violet, token/cost cells (values and `—`), running totals reduce, auto-poll starts only when a job runs and stops otherwise, both intervals cleared on unmount. `npm run test:unit`: 1934 passed. Coverage stays above the 85% gate on all metrics (branches 85.67%). Lint + build clean.

## 1.4 Docs

`docs/architecture.md` — expanded the JobHistoryView description with the live indicator, auto-poll, and cost/token columns; added `format-metrics.ts` to the Utilities list.
