import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchEntities,
  fetchEntity,
  fetchEntityMentions,
  fetchEntityRelationships,
  fetchEntryEntities,
  triggerEntityExtraction,
} from '../entities'

describe('entities API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Stub the env token so the Authorization header is deterministic.
    vi.stubEnv('VITE_JOURNAL_API_TOKEN', 'test-token')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fetchEntities builds a query string from filter params', async () => {
    const payload = { items: [], total: 0, limit: 50, offset: 0 }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    } as Response)

    await fetchEntities({ type: 'person', search: 'ritsya', limit: 10 })

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('/api/entities?')
    expect(url).toContain('type=person')
    expect(url).toContain('search=ritsya')
    expect(url).toContain('limit=10')
  })

  it('fetchEntities omits undefined params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)

    await fetchEntities({})

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toBe('/api/entities')
  })

  it('fetchEntity hits /api/entities/{id}', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 42 }),
    } as Response)

    await fetchEntity(42)

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/entities/42')
  })

  it('fetchEntityMentions includes pagination query', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entity_id: 1, mentions: [], total: 0 }),
    } as Response)

    await fetchEntityMentions(1, { limit: 20, offset: 40 })

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('/api/entities/1/mentions?')
    expect(url).toContain('limit=20')
    expect(url).toContain('offset=40')
  })

  it('fetchEntityRelationships hits the relationships sub-path', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entity_id: 5, outgoing: [], incoming: [] }),
    } as Response)

    await fetchEntityRelationships(5)

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/entities/5/relationships')
  })

  it('fetchEntryEntities hits the entry-scoped path', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entry_id: 7, entities: [] }),
    } as Response)

    await fetchEntryEntities(7)

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/entries/7/entities')
  })

  it('triggerEntityExtraction POSTs with a JSON body and returns a job submission', async () => {
    const payload = { job_id: 'job-abc', status: 'queued' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    } as Response)

    const resp = await triggerEntityExtraction({ entry_id: 3 })

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/entities/extract')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(JSON.stringify({ entry_id: 3 }))
    expect(resp).toEqual(payload)
  })
})
