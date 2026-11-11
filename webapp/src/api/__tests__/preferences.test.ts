import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchPreferences, updatePreferences } from '../preferences'

vi.mock('../client', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '../client'
const mockApiFetch = vi.mocked(apiFetch)

describe('preferences API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchPreferences calls GET /api/users/me/preferences', async () => {
    const payload = { preferences: { dashboard_layout: { tileOrder: [] } } }
    mockApiFetch.mockResolvedValue(payload)

    const result = await fetchPreferences()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/users/me/preferences')
    expect(result).toEqual(payload)
  })

  it('updatePreferences calls PATCH /api/users/me/preferences', async () => {
    const changes = {
      dashboard_layout: { tileOrder: ['word-count'], hiddenTiles: [] },
    }
    const payload = { preferences: changes }
    mockApiFetch.mockResolvedValue(payload)

    const result = await updatePreferences(changes)

    expect(mockApiFetch).toHaveBeenCalledWith('/api/users/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify(changes),
    })
    expect(result).toEqual(payload)
  })
})
