import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchNotificationTopics,
  fetchNotificationStatus,
  validatePushoverCredentials,
  sendPushoverTest,
} from '../notifications'

vi.mock('../client', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '../client'
const mockApiFetch = vi.mocked(apiFetch)

describe('notifications API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchNotificationTopics calls GET /api/notifications/topics', async () => {
    const payload = {
      topics: [{ key: 'notif_job_failed', label: 'Job failed' }],
    }
    mockApiFetch.mockResolvedValue(payload)

    const result = await fetchNotificationTopics()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/notifications/topics')
    expect(result).toEqual(payload)
  })

  it('fetchNotificationStatus calls GET /api/notifications/status', async () => {
    const payload = { configured: true }
    mockApiFetch.mockResolvedValue(payload)

    const result = await fetchNotificationStatus()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/notifications/status')
    expect(result).toEqual(payload)
  })

  it('validatePushoverCredentials calls POST with credentials', async () => {
    const payload = { valid: true, error: null }
    mockApiFetch.mockResolvedValue(payload)

    const result = await validatePushoverCredentials('my-key', 'my-token')

    expect(mockApiFetch).toHaveBeenCalledWith('/api/notifications/validate', {
      method: 'POST',
      body: JSON.stringify({ user_key: 'my-key', app_token: 'my-token' }),
    })
    expect(result).toEqual(payload)
  })

  it('sendPushoverTest calls POST /api/notifications/test', async () => {
    const payload = { sent: true, error: null }
    mockApiFetch.mockResolvedValue(payload)

    const result = await sendPushoverTest()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/notifications/test', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(result).toEqual(payload)
  })
})
