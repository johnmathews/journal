import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { triggerMoodBackfill, getJob } from '../jobs'
import { ApiRequestError } from '../client'

describe('jobs API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv('VITE_JOURNAL_API_TOKEN', 'test-token')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('triggerMoodBackfill POSTs to /api/mood/backfill with a JSON body', async () => {
    const payload = { job_id: 'job-mood-1', status: 'queued' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    } as Response)

    const resp = await triggerMoodBackfill({
      mode: 'stale-only',
      start_date: '2026-01-01',
      end_date: '2026-02-01',
    })

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/mood/backfill')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(
      JSON.stringify({
        mode: 'stale-only',
        start_date: '2026-01-01',
        end_date: '2026-02-01',
      }),
    )
    expect(resp).toEqual(payload)
  })

  it('triggerMoodBackfill supports the force mode', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ job_id: 'x', status: 'queued' }),
    } as Response)

    await triggerMoodBackfill({ mode: 'force' })

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.body).toBe(JSON.stringify({ mode: 'force' }))
  })

  it('getJob GETs /api/jobs/{id} and returns the parsed job', async () => {
    const job = {
      id: 'job-42',
      type: 'entity_extraction',
      status: 'running',
      params: { entry_id: 7 },
      progress_current: 2,
      progress_total: 5,
      result: null,
      error_message: null,
      created_at: '2026-04-11T10:00:00Z',
      started_at: '2026-04-11T10:00:01Z',
      finished_at: null,
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(job),
    } as Response)

    const resp = await getJob('job-42')

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/jobs/job-42')
    // GET is the default method for apiFetch — no body, no override.
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.method).toBeUndefined()
    expect(resp).toEqual(job)
  })

  it('getJob URL-encodes the job id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)

    await getJob('weird id/with slashes')

    expect(fetchSpy.mock.calls[0][0]).toBe(
      '/api/jobs/weird%20id%2Fwith%20slashes',
    )
  })

  it('getJob throws ApiRequestError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({ error: 'not_found', message: 'no such job' }),
    } as Response)

    await expect(getJob('missing')).rejects.toBeInstanceOf(ApiRequestError)
    // And surface the error code + status on the thrown instance.
    try {
      await getJob('missing')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiRequestError)
      const err = e as ApiRequestError
      expect(err.status).toBe(404)
      expect(err.errorCode).toBe('not_found')
      expect(err.message).toBe('no such job')
    }
  })
})
