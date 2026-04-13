import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { triggerEntityExtraction } from '@/api/entities'
import { triggerMoodBackfill, getJob } from '@/api/jobs'
import type { MoodBackfillParams } from '@/api/jobs'
import type { Job, JobType } from '@/types/job'
import { isTerminal } from '@/types/job'

// Poll cadence, in ms. Chosen to feel responsive on the modal without
// hammering the server; the typical job finishes in a few seconds.
const POLL_INTERVAL_MS = 1000

// How many consecutive `getJob` errors to tolerate before we give up
// and mark the local copy as failed. Transient network hiccups should
// not orphan a running job — but an unreachable server forever should
// not spin the loop forever either.
const MAX_CONSECUTIVE_POLL_ERRORS = 5

export interface EntityExtractionParams {
  entry_id?: number
  start_date?: string
  end_date?: string
  stale_only?: boolean
}

/**
 * Build a placeholder Job row for a freshly-submitted job, before the
 * first successful poll replaces it with the real server state. This
 * lets components start rendering progress UI the instant the
 * POST /api/entities/extract (or /api/mood/backfill) call returns 202.
 */
function makePlaceholder(
  jobId: string,
  type: JobType,
  params: Record<string, unknown>,
): Job {
  return {
    id: jobId,
    type,
    status: 'queued',
    params,
    progress_current: 0,
    progress_total: 0,
    result: null,
    error_message: null,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
  }
}

export const useJobsStore = defineStore('jobs', () => {
  // Reactive map of job id -> Job. A plain object keyed by id keeps the
  // reactivity simple: Vue/Pinia track property adds and deletes on a
  // ref'd object wrapped in a `Record`.
  const jobs = ref<Record<string, Job>>({})

  // Tracking for in-flight polls. pollTimers holds the setTimeout
  // handle for the NEXT scheduled tick (so stopPolling can cancel it);
  // inFlight tracks jobs whose getJob fetch is currently running
  // (so a second pollJob caller during that await gap no-ops rather
  // than starting a parallel loop); errorCounts tracks consecutive
  // getJob failures per job so we can give up after a threshold.
  //
  // These are plain (non-reactive) maps on purpose: components never
  // read them, they're purely internal bookkeeping.
  const pollTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const inFlight = new Set<string>()
  const errorCounts = new Map<string, number>()

  // --- Getters ---

  const getJobById = computed(
    () =>
      (jobId: string): Job | undefined =>
        jobs.value[jobId],
  )

  const activeJobs = computed<Job[]>(() =>
    Object.values(jobs.value).filter((j) => !isTerminal(j.status)),
  )

  // --- Internal helpers ---

  function upsertJob(job: Job) {
    jobs.value[job.id] = job
  }

  /**
   * Cancel the pending setTimeout for a job, if any, and forget the
   * error counter. Safe to call for an id that was never polled.
   */
  function stopPolling(jobId: string) {
    const timer = pollTimers.get(jobId)
    if (timer !== undefined) {
      clearTimeout(timer)
      pollTimers.delete(jobId)
    }
    inFlight.delete(jobId)
    errorCounts.delete(jobId)
  }

  /**
   * Remove a job from the store entirely. Cancels any in-flight poll
   * so we don't keep touching state after the component has discarded
   * it.
   */
  function clearJob(jobId: string) {
    stopPolling(jobId)
    delete jobs.value[jobId]
  }

  /**
   * Schedule the next poll tick for `jobId` via setTimeout. Records the
   * handle in pollTimers so stopPolling can cancel it. We deliberately
   * use setTimeout (one-shot) rather than setInterval so each tick is
   * independently cancellable and there is no possibility of
   * overlapping polls if a fetch runs long.
   */
  function scheduleNext(jobId: string) {
    const handle = setTimeout(() => {
      // Remove the handle before running so pollJob's dedup check sees
      // an empty slot and is allowed to execute.
      pollTimers.delete(jobId)
      void pollJob(jobId)
    }, POLL_INTERVAL_MS)
    pollTimers.set(jobId, handle)
  }

  /**
   * Poll once and, if the job isn't terminal, schedule the next tick.
   *
   * Dedup: if a poll is already scheduled for this id (a pending
   * setTimeout), this call no-ops. That guarantees at most one poll
   * loop per job, no matter how many callers kick it off.
   *
   * Errors from getJob don't orphan the job — we log, bump the
   * per-job error counter, and try again on the next tick. After
   * MAX_CONSECUTIVE_POLL_ERRORS in a row we give up: the local Job
   * is flipped to `failed` with an explanatory error_message and the
   * loop stops. Components watching the job will see the failure and
   * react normally.
   */
  async function pollJob(jobId: string) {
    // Dedup: another tick is already queued OR a fetch is in flight
    // for this id — either way, bail out so we don't start a parallel
    // poll loop.
    if (pollTimers.has(jobId) || inFlight.has(jobId)) {
      return
    }

    inFlight.add(jobId)
    let shouldScheduleNext = false
    try {
      const fresh = await getJob(jobId)
      errorCounts.delete(jobId)
      upsertJob(fresh)

      if (isTerminal(fresh.status)) {
        // Natural termination: no further scheduling, clean up bookkeeping.
        inFlight.delete(jobId)
        stopPolling(jobId)
        return
      }
      shouldScheduleNext = true
    } catch (err) {
      // Transient error: keep the existing local copy, bump the counter,
      // and decide whether to retry or give up.
      const nextCount = (errorCounts.get(jobId) ?? 0) + 1
      errorCounts.set(jobId, nextCount)

      console.warn(
        `[jobs] poll failed for ${jobId} (attempt ${nextCount}/${MAX_CONSECUTIVE_POLL_ERRORS})`,
        err,
      )

      if (nextCount >= MAX_CONSECUTIVE_POLL_ERRORS) {
        const existing = jobs.value[jobId]
        if (existing) {
          upsertJob({
            ...existing,
            status: 'failed',
            error_message: 'lost connection to server',
            finished_at: new Date().toISOString(),
          })
        }
        inFlight.delete(jobId)
        stopPolling(jobId)
        return
      }
      shouldScheduleNext = true
    } finally {
      inFlight.delete(jobId)
    }

    // Non-terminal (or transient error we've decided to retry): schedule
    // the next tick. Check the store in case the job was clearJob'd
    // while the await above was in flight.
    if (shouldScheduleNext && jobs.value[jobId]) {
      scheduleNext(jobId)
    }
  }

  // --- Public actions ---

  async function startEntityExtraction(
    params: EntityExtractionParams = {},
  ): Promise<string> {
    const { job_id } = await triggerEntityExtraction(params)
    upsertJob(makePlaceholder(job_id, 'entity_extraction', { ...params }))
    void pollJob(job_id)
    return job_id
  }

  async function startMoodBackfill(
    params: MoodBackfillParams,
  ): Promise<string> {
    const { job_id } = await triggerMoodBackfill(params)
    upsertJob(makePlaceholder(job_id, 'mood_backfill', { ...params }))
    void pollJob(job_id)
    return job_id
  }

  /**
   * Fetch the current state of a job from the server, update the local
   * store, and return the job. Unlike pollJob this is a one-shot fetch
   * that does not start a polling loop — callers who need continuous
   * updates should call pollJob separately.
   */
  async function fetchJob(jobId: string): Promise<Job> {
    const fresh = await getJob(jobId)
    upsertJob(fresh)
    return fresh
  }

  /**
   * Register an externally-created job (e.g. one the server kicked off
   * as a side-effect of a PATCH) and start polling it. The store
   * creates a placeholder row so the notification UI can render
   * immediately, then replaces it with real data on the first poll.
   */
  function trackJob(
    jobId: string,
    type: JobType,
    params: Record<string, unknown> = {},
  ): void {
    upsertJob(makePlaceholder(jobId, type, params))
    void pollJob(jobId)
  }

  return {
    jobs,
    getJobById,
    activeJobs,
    startEntityExtraction,
    startMoodBackfill,
    trackJob,
    fetchJob,
    pollJob,
    stopPolling,
    clearJob,
  }
})
