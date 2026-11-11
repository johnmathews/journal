import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { triggerEntityExtraction } from '@/api/entities'
import { triggerMoodBackfill, getJob, listJobs } from '@/api/jobs'
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
    status_detail: null,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
  }
}

/** Maps server-side follow-up key names to frontend JobType values. */
const FOLLOW_UP_TYPE_MAP: Record<string, JobType> = {
  mood_scoring: 'mood_score_entry',
  entity_extraction: 'entity_extraction',
}

export interface JobGroupInfo {
  label: string
  jobIds: Set<string>
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

  // --- Job grouping ---
  // Groups batch related jobs (e.g. ingestion + mood scoring + entity
  // extraction) so the notification UI can show one summary toast
  // instead of one per job.
  const jobToGroup = new Map<string, string>()
  const groupInfo = new Map<string, JobGroupInfo>()

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
   * it. Also cleans up group membership.
   */
  function clearJob(jobId: string) {
    stopPolling(jobId)
    const gId = jobToGroup.get(jobId)
    if (gId) {
      jobToGroup.delete(jobId)
      const group = groupInfo.get(gId)
      if (group) {
        group.jobIds.delete(jobId)
        if (group.jobIds.size === 0) {
          groupInfo.delete(gId)
        }
      }
    }
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

        // If this job is in a group and the server returned follow-up
        // job IDs in its result, track them in the same group so the
        // notification UI batches everything into one toast.
        const parentGroupId = jobToGroup.get(jobId)
        const followUps = fresh.result?.follow_up_jobs as
          | Record<string, string>
          | undefined
        if (parentGroupId && followUps) {
          for (const [key, followUpId] of Object.entries(followUps)) {
            const followUpType = FOLLOW_UP_TYPE_MAP[key]
            if (followUpType && followUpId && !jobs.value[followUpId]) {
              trackJob(followUpId, followUpType, {}, parentGroupId)
            }
          }
        }

        // A completed job may have triggered follow-up jobs server-side
        // (e.g., entity extraction after image ingestion). Re-hydrate so
        // the notification bell discovers them.
        hydrated = false
        void hydrateActiveJobs()
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
   *
   * If `groupId` is provided the job is added to that group so the
   * notification UI can batch all related jobs into a single toast.
   */
  function trackJob(
    jobId: string,
    type: JobType,
    params: Record<string, unknown> = {},
    groupId?: string,
  ): void {
    upsertJob(makePlaceholder(jobId, type, params))
    if (groupId) {
      jobToGroup.set(jobId, groupId)
      const group = groupInfo.get(groupId)
      if (group) {
        group.jobIds.add(jobId)
      }
    }
    void pollJob(jobId)
  }

  /**
   * Create a named group. Call this before `trackJob(..., groupId)` so
   * the group label is available when the notification fires.
   */
  function createGroup(id: string, label: string): void {
    groupInfo.set(id, { label, jobIds: new Set() })
  }

  /** Return the group ID a job belongs to, if any. */
  function getGroupId(jobId: string): string | undefined {
    return jobToGroup.get(jobId)
  }

  /** Return the group metadata for a given group ID. */
  function getGroup(groupId: string): JobGroupInfo | undefined {
    return groupInfo.get(groupId)
  }

  /** True when every job in the group has reached a terminal status. */
  function isGroupComplete(groupId: string): boolean {
    const group = groupInfo.get(groupId)
    if (!group || group.jobIds.size === 0) return false
    for (const id of group.jobIds) {
      const job = jobs.value[id]
      if (!job || !isTerminal(job.status)) return false
    }
    return true
  }

  /** True when every job in the group succeeded. */
  function isGroupAllSucceeded(groupId: string): boolean {
    const group = groupInfo.get(groupId)
    if (!group || group.jobIds.size === 0) return false
    for (const id of group.jobIds) {
      const job = jobs.value[id]
      if (!job || job.status !== 'succeeded') return false
    }
    return true
  }

  /**
   * Fetch all queued/running jobs from the server and start polling them.
   * Called once on app startup so the notification bell reflects jobs
   * started in previous sessions, via CLI, or by other clients.
   */
  let hydrated = false
  async function hydrateActiveJobs(): Promise<void> {
    if (hydrated) return
    hydrated = true
    try {
      const [queued, running] = await Promise.all([
        listJobs({ status: 'queued', limit: 50 }),
        listJobs({ status: 'running', limit: 50 }),
      ])
      for (const job of [...queued.items, ...running.items]) {
        if (!jobs.value[job.id]) {
          upsertJob(job)
          void pollJob(job.id)
        }
      }
    } catch {
      // Non-critical: the bell just won't show pre-existing jobs.
      // Reset so a retry is possible (e.g. after network recovery).
      hydrated = false
    }
  }

  return {
    jobs,
    getJobById,
    activeJobs,
    startEntityExtraction,
    startMoodBackfill,
    trackJob,
    createGroup,
    getGroupId,
    getGroup,
    isGroupComplete,
    isGroupAllSucceeded,
    fetchJob,
    pollJob,
    stopPolling,
    clearJob,
    hydrateActiveJobs,
  }
})
