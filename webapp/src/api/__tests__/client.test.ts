import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiFetch, ApiRequestError } from '../client'

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('makes a GET request and returns JSON', async () => {
    const mockData = { items: [], total: 0 }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    } as Response)

    const result = await apiFetch('/api/entries')
    expect(result).toEqual(mockData)
    expect(fetch).toHaveBeenCalledWith(
      '/api/entries',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('throws ApiRequestError on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({ error: 'not_found', message: 'Entry not found' }),
    } as Response)

    await expect(apiFetch('/api/entries/999')).rejects.toThrow(ApiRequestError)
    try {
      await apiFetch('/api/entries/999')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiRequestError)
      expect((e as ApiRequestError).status).toBe(404)
      expect((e as ApiRequestError).errorCode).toBe('not_found')
    }
  })

  it('handles non-JSON error responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    } as Response)

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiRequestError)
  })

  it('uses HTTP status code as message when body lacks error/message fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({}),
    } as Response)

    try {
      await apiFetch('/api/health')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiRequestError)
      const err = e as ApiRequestError
      expect(err.status).toBe(502)
      expect(err.errorCode).toBe('unknown')
      expect(err.message).toBe('HTTP 502')
    }
  })

  it('forwards extra request options (method, body) while preserving JSON headers', async () => {
    const mockResponse = { id: 1 }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response)

    await apiFetch('/api/entries/1', {
      method: 'PATCH',
      body: JSON.stringify({ final_text: 'updated' }),
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/entries/1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ final_text: 'updated' }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )
  })
})
