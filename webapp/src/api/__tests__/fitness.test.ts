import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchActivities,
  fetchDaily,
  fetchSyncStatus,
  triggerSync,
  fetchIntegrity,
  connectGarmin,
  submitGarminMfa,
  disconnectGarmin,
  getStravaAuthorizeUrl,
  exchangeStravaCode,
  disconnectStrava,
  triggerBackfill,
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

  it('connectGarmin POSTs credentials and returns the connected-account shape when no MFA is needed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ connected: true, upstream_user_id: 'alice.garmin' }),
    } as Response)

    const resp = await connectGarmin({
      username: 'alice@example.com',
      password: 'hunter2',
    })

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/fitness/garmin/connect')
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      username: 'alice@example.com',
      password: 'hunter2',
    })
    // Discriminated union: the no-MFA branch lacks `mfa_required`.
    expect('mfa_required' in resp).toBe(false)
    if (!('mfa_required' in resp)) {
      expect(resp.connected).toBe(true)
      expect(resp.upstream_user_id).toBe('alice.garmin')
    }
  })

  it('connectGarmin returns the MFA-required branch with pending_session', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          mfa_required: true,
          pending_session: 'tok-123',
          expires_at: '2026-05-10T12:34:56Z',
        }),
    } as Response)

    const resp = await connectGarmin({
      username: 'alice@example.com',
      password: 'hunter2',
    })

    expect('mfa_required' in resp).toBe(true)
    if ('mfa_required' in resp) {
      expect(resp.mfa_required).toBe(true)
      expect(resp.pending_session).toBe('tok-123')
      expect(resp.expires_at).toBe('2026-05-10T12:34:56Z')
    }
  })

  it('submitGarminMfa POSTs pending_session+code and returns the connected-account shape', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ connected: true, upstream_user_id: 'alice.garmin' }),
    } as Response)

    const resp = await submitGarminMfa({
      pending_session: 'tok-123',
      code: '654321',
    })

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/fitness/garmin/connect/mfa')
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      pending_session: 'tok-123',
      code: '654321',
    })
    expect(resp).toEqual({ connected: true, upstream_user_id: 'alice.garmin' })
  })

  it('disconnectGarmin POSTs to /api/fitness/garmin/disconnect (idempotent)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ disconnected: false }),
    } as Response)

    const resp = await disconnectGarmin()

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/fitness/garmin/disconnect')
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(resp).toEqual({ disconnected: false })
  })

  it('getStravaAuthorizeUrl GETs /api/fitness/strava/authorize_url and returns the authorize URL + state', async () => {
    const payload = {
      authorize_url: 'https://www.strava.com/oauth/authorize?state=tok-strv',
      state: 'tok-strv',
      expires_at: '2026-05-10T12:34:56Z',
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    } as Response)

    const resp = await getStravaAuthorizeUrl()

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/fitness/strava/authorize_url')
    // GET — no explicit method on init, or method === 'GET'.
    const init = fetchSpy.mock.calls[0][1] as RequestInit | undefined
    if (init && init.method) {
      expect(init.method).toBe('GET')
    }
    expect(resp).toEqual(payload)
  })

  it('exchangeStravaCode POSTs code+state and returns the connected-account shape', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ connected: true, upstream_user_id: '12345678' }),
    } as Response)

    const resp = await exchangeStravaCode({
      code: 'strv-code',
      state: 'tok-strv',
    })

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/fitness/strava/exchange')
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      code: 'strv-code',
      state: 'tok-strv',
    })
    expect(resp).toEqual({ connected: true, upstream_user_id: '12345678' })
  })

  it('disconnectStrava POSTs to /api/fitness/strava/disconnect (idempotent)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ disconnected: true }),
    } as Response)

    const resp = await disconnectStrava()

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/fitness/strava/disconnect')
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(resp).toEqual({ disconnected: true })
  })

  it('triggerBackfill POSTs to /api/fitness/backfill/{source} with the start/end JSON body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ job_id: 'job-bf', status: 'queued' }),
    } as Response)

    const resp = await triggerBackfill('strava', {
      start: '2026-01-01',
      end: '2026-03-01',
    })

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/fitness/backfill/strava')
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      start: '2026-01-01',
      end: '2026-03-01',
    })
    expect(resp).toEqual({ job_id: 'job-bf', status: 'queued' })
  })

  it('triggerBackfill omits the end field from the body when not supplied', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ job_id: 'job-bf', status: 'queued' }),
    } as Response)

    await triggerBackfill('garmin', { start: '2026-01-01' })

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({ start: '2026-01-01' })
    expect('end' in body).toBe(false)
  })

  it('triggerBackfill surfaces already_running when the server dedups against an in-flight fetch job', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          job_id: 'job-running',
          status: 'running',
          already_running: true,
        }),
    } as Response)

    const resp = await triggerBackfill('strava', { start: '2026-01-01' })

    expect(resp.already_running).toBe(true)
    expect(resp.status).toBe('running')
    expect(resp.job_id).toBe('job-running')
  })
})
