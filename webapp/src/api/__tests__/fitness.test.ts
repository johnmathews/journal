import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchActivities,
  fetchDaily,
  fetchSyncStatus,
  triggerSync,
  fetchIntegrity,
} from '../fitness'

describe('fitness API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetchActivities GETs /api/fitness/activities with start+end query params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    } as Response)

    await fetchActivities({ start: '2026-05-01', end: '2026-05-09' })

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('/api/fitness/activities?')
    expect(url).toContain('start=2026-05-01')
    expect(url).toContain('end=2026-05-09')
    expect(url).not.toContain('type=')
  })

  it('fetchActivities passes the activity-type filter when supplied', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    } as Response)

    await fetchActivities({
      start: '2026-05-01',
      end: '2026-05-09',
      type: 'run',
    })

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('type=run')
  })

  it('fetchDaily GETs /api/fitness/daily with start+end', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    } as Response)

    await fetchDaily({ start: '2026-04-01', end: '2026-05-01' })

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toBe('/api/fitness/daily?start=2026-04-01&end=2026-05-01')
  })

  it('fetchSyncStatus GETs /api/fitness/sync/status with no query', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ strava: null, garmin: null }),
    } as Response)

    const resp = await fetchSyncStatus()

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/fitness/sync/status')
    expect(resp).toEqual({ strava: null, garmin: null })
  })

  it('triggerSync POSTs to /api/fitness/sync/{source} and returns the job stub', async () => {
    const payload = { job_id: 'job-1', status: 'queued' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    } as Response)

    const resp = await triggerSync('strava')

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/fitness/sync/strava')
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(resp).toEqual(payload)
  })

  it('triggerSync returns already_running when the server dedups against an in-flight job', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          job_id: 'job-running',
          status: 'running',
          already_running: true,
        }),
    } as Response)

    const resp = await triggerSync('garmin')

    expect(resp.already_running).toBe(true)
    expect(resp.status).toBe('running')
  })

  it('fetchIntegrity GETs /api/fitness/integrity', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ activities: [], daily: [] }),
    } as Response)

    const resp = await fetchIntegrity()

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/fitness/integrity')
    expect(resp).toEqual({ activities: [], daily: [] })
  })
})
