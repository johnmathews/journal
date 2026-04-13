import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchSettings, fetchHealth } from '../settings'

vi.mock('../client', () => ({
  apiFetch: vi.fn(),
  ApiRequestError: class extends Error {
    constructor(
      public status: number,
      public errorCode: string,
      message: string,
    ) {
      super(message)
    }
  },
}))

import { apiFetch } from '../client'
const mockApiFetch = vi.mocked(apiFetch)

describe('settings API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchSettings calls /api/settings', async () => {
    const payload = { ocr: { provider: 'gemini', model: 'gemini-3-pro' } }
    mockApiFetch.mockResolvedValue(payload)

    const result = await fetchSettings()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/settings')
    expect(result).toEqual(payload)
  })

  it('fetchHealth calls /health', async () => {
    const payload = { status: 'ok', checks: [] }
    mockApiFetch.mockResolvedValue(payload)

    const result = await fetchHealth()

    expect(mockApiFetch).toHaveBeenCalledWith('/health')
    expect(result).toEqual(payload)
  })
})
