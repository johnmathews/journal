import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useJobsStore } from '../jobs'
import type { Job, JobStatus } from '@/types/job'

vi.mock('@/api/entities', () => ({
  triggerEntityExtraction: vi.fn(),
}))

vi.mock('@/api/jobs', () => ({
  triggerMoodBackfill: vi.fn(),
  getJob: vi.fn(),
  listJobs: vi
    .fn()
    .mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 }),
}))

/**
 * Build a fully-populated Job for test mocks. The store treats snake_case
 * fields as a direct mirror of the API contract, so we match that shape.
 */
function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    type: 'entity_extraction',
    status: 'running',
    params: {},
    progress_current: 0,
    progress_total: 0,
    result: null,
    error_message: null,
    status_detail: null,
    created_at: '2026-04-11T10:00:00Z',
    started_at: null,
    finished_at: null,
    ...overrides,
  }
}

/**
 * Advance past the scheduled poll interval AND flush all pending
 * microtasks so any await inside the recursive pollJob resolves
 * within the test. `runOnlyPendingTimers` fires the setTimeout
 * callback; `await Promise.resolve()` loops flush the promise
 * continuation chain that follows.
 */
async function flushPoll() {
  await vi.runOnlyPendingTimersAsync()
}

describe('jobs store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('startEntityExtraction creates a placeholder and begins polling', async () => {
    const { triggerEntityExtraction } = await import('@/api/entities')
    const { getJob } = await import('@/api/jobs')
    vi.mocked(triggerEntityExtraction).mockResolvedValue({
      job_id: 'job-1',
      status: 'queued' as JobStatus,
    })
    vi.mocked(getJob).mockResolvedValue(
      makeJob({ id: 'job-1', status: 'running' }),
    )

    const store = useJobsStore()
    const idPromise = store.startEntityExtraction({ entry_id: 3 })
    // Resolve the trigger promise so the placeholder is written.
    await idPromise

    expect(store.getJobById('job-1')).toBeDefined()
    expect(store.getJobById('job-1')?.type).toBe('entity_extraction')
    // The first pollJob runs synchronously after the trigger — flush it.
    await Promise.resolve()
    await Promise.resolve()
    expect(getJob).toHaveBeenCalledWith('job-1')
  })

  it('startMoodBackfill creates a mood_backfill placeholder', async () => {
    const { triggerMoodBackfill, getJob } = await import('@/api/jobs')
    vi.mocked(triggerMoodBackfill).mockResolvedValue({
      job_id: 'job-mood',
      status: 'queued',
    })
    // Make getJob hang so the placeholder is observable before a poll
    // overwrites it. This test is about the placeholder shape, not
    // the polling behaviour (covered elsewhere).
    vi.mocked(getJob).mockImplementation(() => new Promise<Job>(() => {}))

    const store = useJobsStore()
    await store.startMoodBackfill({ mode: 'stale-only' })

    expect(triggerMoodBackfill).toHaveBeenCalledWith({ mode: 'stale-only' })
    expect(store.getJobById('job-mood')?.type).toBe('mood_backfill')
    expect(store.getJobById('job-mood')?.status).toBe('queued')
    expect(store.getJobById('job-mood')?.params).toEqual({ mode: 'stale-only' })
  })

  it('pollJob schedules the next tick at 1000ms when status is non-terminal', async () => {
    const { getJob } = await import('@/api/jobs')
    vi.mocked(getJob)
      .mockResolvedValueOnce(makeJob({ id: 'j', status: 'running' }))
      .mockResolvedValueOnce(makeJob({ id: 'j', status: 'running' }))
      .mockResolvedValue(makeJob({ id: 'j', status: 'succeeded' }))

    const store = useJobsStore()
    // Seed a placeholder first so scheduleNext's post-fetch guard
    // doesn't short-circuit.
    store.jobs['j'] = makeJob({ id: 'j', status: 'queued' })

    await store.pollJob('j')
    expect(getJob).toHaveBeenCalledTimes(1)

    // Advance to fire the setTimeout tick.
    await vi.advanceTimersByTimeAsync(1000)
    expect(getJob).toHaveBeenCalledTimes(2)

    // One more — this one returns succeeded and should stop.
    await vi.advanceTimersByTimeAsync(1000)
    expect(getJob).toHaveBeenCalledTimes(3)

    // Further time advances should NOT cause more polls.
    await vi.advanceTimersByTimeAsync(5000)
    expect(getJob).toHaveBeenCalledTimes(3)
    expect(store.getJobById('j')?.status).toBe('succeeded')
  })

  it('pollJob stops scheduling when status becomes failed', async () => {
    const { getJob } = await import('@/api/jobs')
    vi.mocked(getJob).mockResolvedValue(
      makeJob({ id: 'j', status: 'failed', error_message: 'boom' }),
    )

    const store = useJobsStore()
    store.jobs['j'] = makeJob({ id: 'j', status: 'queued' })

    await store.pollJob('j')
    expect(getJob).toHaveBeenCalledTimes(1)
    expect(store.getJobById('j')?.status).toBe('failed')

    await vi.advanceTimersByTimeAsync(5000)
    // No further polls after the terminal status.
    expect(getJob).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent pollJob calls for the same id', async () => {
    const { getJob } = await import('@/api/jobs')
    // Return a never-settling promise on the first call so both
    // concurrent invocations see an in-flight fetch.
    let resolveFirst: (job: Job) => void = () => {}
    const firstPromise = new Promise<Job>((resolve) => {
      resolveFirst = resolve
    })
    vi.mocked(getJob)
      .mockImplementationOnce(() => firstPromise)
      .mockResolvedValue(makeJob({ id: 'j', status: 'succeeded' }))

    const store = useJobsStore()
    store.jobs['j'] = makeJob({ id: 'j', status: 'queued' })

    // Kick off two polls for the same id concurrently. The second one
    // should see inFlight and bail out.
    const p1 = store.pollJob('j')
    const p2 = store.pollJob('j')

    // Neither fetch has resolved yet — only one call should be in flight.
    expect(getJob).toHaveBeenCalledTimes(1)

    resolveFirst(makeJob({ id: 'j', status: 'running' }))
    await p1
    await p2
    // Still only one call — the second pollJob returned without fetching.
    expect(getJob).toHaveBeenCalledTimes(1)
  })

  it('stopPolling cancels the pending setTimeout', async () => {
    const { getJob } = await import('@/api/jobs')
    vi.mocked(getJob).mockResolvedValue(makeJob({ id: 'j', status: 'running' }))

    const store = useJobsStore()
    store.jobs['j'] = makeJob({ id: 'j', status: 'queued' })

    await store.pollJob('j')
    expect(getJob).toHaveBeenCalledTimes(1)

    store.stopPolling('j')

    // Now advance time: the pending tick should have been cleared.
    await vi.advanceTimersByTimeAsync(5000)
    expect(getJob).toHaveBeenCalledTimes(1)
  })

  it('transient getJob failures keep polling on the next tick', async () => {
    const { getJob } = await import('@/api/jobs')
    vi.mocked(getJob)
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce(makeJob({ id: 'j', status: 'running' }))
      .mockResolvedValue(makeJob({ id: 'j', status: 'succeeded' }))
    // Silence the warn log for this test.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const store = useJobsStore()
    store.jobs['j'] = makeJob({ id: 'j', status: 'queued' })

    await store.pollJob('j')
    expect(getJob).toHaveBeenCalledTimes(1)
    // First call errored — job is still queued locally, not failed.
    expect(store.getJobById('j')?.status).toBe('queued')

    // Next tick: successful poll arrives.
    await vi.advanceTimersByTimeAsync(1000)
    expect(getJob).toHaveBeenCalledTimes(2)
    expect(store.getJobById('j')?.status).toBe('running')

    warnSpy.mockRestore()
  })

  it('marks the job as failed after 5 consecutive poll errors', async () => {
    const { getJob } = await import('@/api/jobs')
    vi.mocked(getJob).mockRejectedValue(new Error('server down'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const store = useJobsStore()
    store.jobs['j'] = makeJob({ id: 'j', status: 'running' })

    // Call #1.
    await store.pollJob('j')
    expect(store.getJobById('j')?.status).toBe('running')

    // Calls #2-#5 via the scheduled ticks.
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(1000)
    }

    expect(getJob).toHaveBeenCalledTimes(5)
    expect(store.getJobById('j')?.status).toBe('failed')
    expect(store.getJobById('j')?.error_message).toBe(
      'lost connection to server',
    )

    // After the giveup, no further polls should happen.
    await vi.advanceTimersByTimeAsync(5000)
    expect(getJob).toHaveBeenCalledTimes(5)

    warnSpy.mockRestore()
  })

  it('activeJobs returns only non-terminal jobs', async () => {
    const store = useJobsStore()
    store.jobs['a'] = makeJob({ id: 'a', status: 'queued' })
    store.jobs['b'] = makeJob({ id: 'b', status: 'running' })
    store.jobs['c'] = makeJob({ id: 'c', status: 'succeeded' })
    store.jobs['d'] = makeJob({ id: 'd', status: 'failed' })

    const ids = store.activeJobs.map((j) => j.id).sort()
    expect(ids).toEqual(['a', 'b'])
  })

  it('clearJob removes a job and cancels its poll', async () => {
    const { getJob } = await import('@/api/jobs')
    vi.mocked(getJob).mockResolvedValue(makeJob({ id: 'j', status: 'running' }))

    const store = useJobsStore()
    store.jobs['j'] = makeJob({ id: 'j', status: 'queued' })

    await store.pollJob('j')
    expect(getJob).toHaveBeenCalledTimes(1)

    store.clearJob('j')
    expect(store.getJobById('j')).toBeUndefined()

    // The scheduled next tick should have been cancelled.
    await vi.advanceTimersByTimeAsync(5000)
    expect(getJob).toHaveBeenCalledTimes(1)
  })

  it('trackJob registers an externally-created job and starts polling', async () => {
    const store = useJobsStore()
    const { getJob } = await import('@/api/jobs')
    vi.mocked(getJob).mockResolvedValue(
      makeJob({ id: 'ext-1', status: 'running' }),
    )

    store.trackJob('ext-1', 'entity_extraction', { entry_id: 42 })

    // Placeholder is created immediately
    expect(store.getJobById('ext-1')).toBeDefined()
    expect(store.getJobById('ext-1')?.status).toBe('queued')
    expect(store.getJobById('ext-1')?.params).toEqual({ entry_id: 42 })

    // First poll fires (async — flush microtasks)
    await flushPoll()
    expect(getJob).toHaveBeenCalledWith('ext-1')
    expect(store.getJobById('ext-1')?.status).toBe('running')
  })

  it('hydrateActiveJobs fetches queued and running jobs from the API', async () => {
    const { listJobs, getJob } = await import('@/api/jobs')
    const runningJob = makeJob({
      id: 'srv-1',
      status: 'running',
      type: 'ingest_images',
    })
    const queuedJob = makeJob({
      id: 'srv-2',
      status: 'queued',
      type: 'mood_backfill',
    })

    vi.mocked(listJobs)
      .mockResolvedValueOnce({
        items: [queuedJob],
        total: 1,
        limit: 50,
        offset: 0,
      })
      .mockResolvedValueOnce({
        items: [runningJob],
        total: 1,
        limit: 50,
        offset: 0,
      })
    vi.mocked(getJob).mockImplementation(() => new Promise<Job>(() => {}))

    const store = useJobsStore()
    await store.hydrateActiveJobs()

    expect(listJobs).toHaveBeenCalledWith({ status: 'queued', limit: 50 })
    expect(listJobs).toHaveBeenCalledWith({ status: 'running', limit: 50 })
    expect(store.getJobById('srv-1')).toBeDefined()
    expect(store.getJobById('srv-1')?.status).toBe('running')
    expect(store.getJobById('srv-2')).toBeDefined()
    expect(store.getJobById('srv-2')?.status).toBe('queued')
  })

  it('hydrateActiveJobs does not overwrite locally-tracked jobs', async () => {
    const { listJobs, getJob } = await import('@/api/jobs')
    const serverJob = makeJob({
      id: 'dup-1',
      status: 'running',
      progress_current: 5,
    })

    vi.mocked(listJobs).mockResolvedValue({
      items: [serverJob],
      total: 1,
      limit: 50,
      offset: 0,
    })
    vi.mocked(getJob).mockImplementation(() => new Promise<Job>(() => {}))

    const store = useJobsStore()
    // Simulate a job already tracked in this session
    store.trackJob('dup-1', 'ingest_images', {})

    await store.hydrateActiveJobs()

    // Should keep the local placeholder (status queued), not overwrite with server state
    expect(store.getJobById('dup-1')?.status).toBe('queued')
  })

  it('hydrateActiveJobs only runs once under normal conditions', async () => {
    const { listJobs } = await import('@/api/jobs')
    vi.mocked(listJobs).mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    })

    const store = useJobsStore()
    await store.hydrateActiveJobs()
    await store.hydrateActiveJobs()

    // Two calls: one for queued, one for running — only from the first invocation
    expect(listJobs).toHaveBeenCalledTimes(2)
  })

  it('re-hydrates to discover follow-up jobs when a tracked job reaches terminal state', async () => {
    const { listJobs, getJob } = await import('@/api/jobs')

    // First hydration: no active jobs
    vi.mocked(listJobs).mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    })

    const store = useJobsStore()
    await store.hydrateActiveJobs()
    expect(listJobs).toHaveBeenCalledTimes(2) // queued + running

    // A follow-up job the server created after the ingestion completed
    const followUpJob = makeJob({
      id: 'entity-1',
      status: 'running',
      type: 'entity_extraction',
    })

    // When the ingestion job finishes, re-hydration should find the follow-up
    vi.mocked(listJobs)
      .mockResolvedValueOnce({ items: [], total: 0, limit: 50, offset: 0 })
      .mockResolvedValueOnce({
        items: [followUpJob],
        total: 1,
        limit: 50,
        offset: 0,
      })
    // getJob: first call returns succeeded (terminal), then hangs for follow-up polling
    vi.mocked(getJob)
      .mockResolvedValueOnce(makeJob({ id: 'ingest-1', status: 'succeeded' }))
      .mockImplementation(() => new Promise<Job>(() => {}))

    // Seed the ingestion job and poll it
    store.jobs['ingest-1'] = makeJob({ id: 'ingest-1', status: 'running' })
    await store.pollJob('ingest-1')

    // Wait for the re-hydration promise to settle
    await vi.runAllTimersAsync()

    // Re-hydration should have called listJobs again (2 more calls)
    expect(listJobs).toHaveBeenCalledTimes(4)
    // The follow-up job should now be in the store
    expect(store.getJobById('entity-1')).toBeDefined()
    expect(store.getJobById('entity-1')?.status).toBe('running')
  })

  // --- Job grouping ---

  it('createGroup + trackJob with groupId registers the job in the group', () => {
    const store = useJobsStore()
    store.createGroup('g1', 'Entry created — all processing complete')

    store.trackJob('j1', 'ingest_audio', {}, 'g1')
    store.trackJob('j2', 'mood_score_entry', {}, 'g1')

    expect(store.getGroupId('j1')).toBe('g1')
    expect(store.getGroupId('j2')).toBe('g1')
    const group = store.getGroup('g1')
    expect(group?.label).toBe('Entry created — all processing complete')
    expect(group?.jobIds.has('j1')).toBe(true)
    expect(group?.jobIds.has('j2')).toBe(true)
  })

  it('trackJob without groupId does not register in any group', () => {
    const store = useJobsStore()
    store.trackJob('j1', 'entity_extraction', {})
    expect(store.getGroupId('j1')).toBeUndefined()
  })

  it('isGroupComplete returns false until all group jobs are terminal', async () => {
    const { getJob } = await import('@/api/jobs')
    vi.mocked(getJob).mockImplementation(() => new Promise<Job>(() => {}))

    const store = useJobsStore()
    store.createGroup('g1', 'test')
    store.trackJob('j1', 'ingest_audio', {}, 'g1')
    store.trackJob('j2', 'mood_score_entry', {}, 'g1')

    expect(store.isGroupComplete('g1')).toBe(false)

    // Manually set j1 to succeeded
    store.jobs['j1'] = makeJob({ id: 'j1', status: 'succeeded' })
    expect(store.isGroupComplete('g1')).toBe(false)

    // Now set j2 to succeeded
    store.jobs['j2'] = makeJob({ id: 'j2', status: 'succeeded' })
    expect(store.isGroupComplete('g1')).toBe(true)
  })

  it('isGroupAllSucceeded returns false when any job failed', async () => {
    const { getJob } = await import('@/api/jobs')
    vi.mocked(getJob).mockImplementation(() => new Promise<Job>(() => {}))

    const store = useJobsStore()
    store.createGroup('g1', 'test')
    store.trackJob('j1', 'entity_extraction', {}, 'g1')
    store.trackJob('j2', 'mood_score_entry', {}, 'g1')

    store.jobs['j1'] = makeJob({ id: 'j1', status: 'succeeded' })
    store.jobs['j2'] = makeJob({
      id: 'j2',
      status: 'failed',
      error_message: 'boom',
    })

    expect(store.isGroupComplete('g1')).toBe(true)
    expect(store.isGroupAllSucceeded('g1')).toBe(false)
  })

  it('clearJob removes the job from its group and cleans up empty groups', async () => {
    const { getJob } = await import('@/api/jobs')
    vi.mocked(getJob).mockImplementation(() => new Promise<Job>(() => {}))

    const store = useJobsStore()
    store.createGroup('g1', 'test')
    store.trackJob('j1', 'entity_extraction', {}, 'g1')

    expect(store.getGroup('g1')?.jobIds.has('j1')).toBe(true)

    store.clearJob('j1')

    expect(store.getGroupId('j1')).toBeUndefined()
    // Group is empty and should be cleaned up
    expect(store.getGroup('g1')).toBeUndefined()
  })

  it('pollJob assigns follow-up jobs to the parent group when result contains follow_up_jobs', async () => {
    const { getJob, listJobs } = await import('@/api/jobs')

    // All getJob calls return never-resolving promises initially.
    // We'll override for the explicit pollJob call below.
    vi.mocked(getJob).mockImplementation(() => new Promise<Job>(() => {}))
    vi.mocked(listJobs).mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    })

    const store = useJobsStore()
    store.createGroup('g1', 'Entry created — all processing complete')

    // Register parent in the group via trackJob. The fire-and-forget
    // poll inside trackJob will hang on getJob (never resolves) — that's
    // fine, we just need the group membership set up.
    store.trackJob('parent', 'ingest_audio', {}, 'g1')

    // Override parent to running so it looks like a live job.
    store.jobs['parent'] = makeJob({
      id: 'parent',
      status: 'running',
      type: 'ingest_audio',
    })

    // Stop the trackJob-initiated poll and clear inFlight so our
    // explicit pollJob below can proceed.
    store.stopPolling('parent')

    // Now set up getJob to return terminal state with follow-up IDs
    // for the next call, then hang for follow-up polls.
    vi.mocked(getJob)
      .mockResolvedValueOnce(
        makeJob({
          id: 'parent',
          status: 'succeeded',
          type: 'ingest_audio',
          result: {
            follow_up_jobs: {
              mood_scoring: 'mood-1',
              entity_extraction: 'entity-1',
            },
          },
        }),
      )
      .mockImplementation(() => new Promise<Job>(() => {}))

    await store.pollJob('parent')

    // Follow-up jobs should be tracked in the same group
    expect(store.getJobById('mood-1')).toBeDefined()
    expect(store.getJobById('mood-1')?.type).toBe('mood_score_entry')
    expect(store.getGroupId('mood-1')).toBe('g1')

    expect(store.getJobById('entity-1')).toBeDefined()
    expect(store.getJobById('entity-1')?.type).toBe('entity_extraction')
    expect(store.getGroupId('entity-1')).toBe('g1')
  })
})
