import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNotificationsStore } from '../notifications'
import { ApiRequestError } from '@/api/client'

vi.mock('@/api/notifications', () => ({
  fetchNotificationTopics: vi.fn(),
  fetchNotificationStatus: vi.fn(),
  validatePushoverCredentials: vi.fn(),
  sendPushoverTest: vi.fn(),
}))

vi.mock('@/api/preferences', () => ({
  updatePreferences: vi.fn(),
}))

import {
  fetchNotificationTopics,
  fetchNotificationStatus,
  validatePushoverCredentials,
  sendPushoverTest,
} from '@/api/notifications'
import { updatePreferences } from '@/api/preferences'

const mockFetchTopics = vi.mocked(fetchNotificationTopics)
const mockFetchStatus = vi.mocked(fetchNotificationStatus)
const mockValidate = vi.mocked(validatePushoverCredentials)
const mockSendTest = vi.mocked(sendPushoverTest)
const mockUpdatePrefs = vi.mocked(updatePreferences)

const sampleTopics = [
  {
    key: 'notif_job_success_ingest_images',
    label: 'Image ingestion succeeded',
    group: 'success',
    admin_only: false,
    default: true,
    enabled: true,
  },
  {
    key: 'notif_job_failed',
    label: 'Job failed permanently',
    group: 'failure',
    admin_only: false,
    default: true,
    enabled: true,
  },
]

describe('notifications store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('load', () => {
    it('hydrates from status + topics endpoints', async () => {
      mockFetchStatus.mockResolvedValue({ configured: true })
      mockFetchTopics.mockResolvedValue({ topics: sampleTopics })

      const store = useNotificationsStore()
      await store.load()

      expect(store.credentialsSaved).toBe(true)
      expect(store.validationStatus).toBe('valid')
      expect(store.topics).toHaveLength(2)
      expect(store.loading).toBe(false)
    })

    it('defaults to not configured on fetch failure', async () => {
      mockFetchStatus.mockRejectedValue(new Error('network'))
      mockFetchTopics.mockRejectedValue(new Error('network'))

      const store = useNotificationsStore()
      await store.load()

      expect(store.credentialsSaved).toBe(false)
      expect(store.topics).toHaveLength(0)
    })

    it('silently defaults when individual fetches fail', async () => {
      mockFetchStatus.mockRejectedValue(new Error('network'))
      mockFetchTopics.mockRejectedValue(new Error('network'))

      const store = useNotificationsStore()
      await store.load()

      // Individual promise .catch() handlers provide defaults
      expect(store.credentialsSaved).toBe(false)
      expect(store.topics).toHaveLength(0)
      expect(store.loading).toBe(false)
    })
  })

  describe('validate', () => {
    it('sets valid status on success', async () => {
      mockFetchStatus.mockResolvedValue({ configured: false })
      mockFetchTopics.mockResolvedValue({ topics: [] })
      mockValidate.mockResolvedValue({ valid: true, error: null })

      const store = useNotificationsStore()
      await store.load()

      store.apiToken = 'my-token'
      store.userKey = 'my-key'
      await store.validate()

      expect(store.validationStatus).toBe('valid')
      expect(store.credentialsSaved).toBe(true)
      expect(store.validating).toBe(false)
    })

    it('sets invalid status on failure', async () => {
      mockFetchStatus.mockResolvedValue({ configured: false })
      mockFetchTopics.mockResolvedValue({ topics: [] })
      mockValidate.mockResolvedValue({ valid: false, error: 'bad key' })

      const store = useNotificationsStore()
      await store.load()

      store.apiToken = 'bad'
      store.userKey = 'bad'
      await store.validate()

      expect(store.validationStatus).toBe('invalid')
      expect(store.validationMessage).toBe('bad key')
      expect(store.credentialsSaved).toBe(false)
    })

    it('handles thrown Error', async () => {
      mockFetchStatus.mockResolvedValue({ configured: false })
      mockFetchTopics.mockResolvedValue({ topics: [] })
      mockValidate.mockRejectedValue(new Error('network'))

      const store = useNotificationsStore()
      await store.load()

      store.apiToken = 'tok'
      store.userKey = 'key'
      await store.validate()

      expect(store.validationStatus).toBe('invalid')
      expect(store.validationMessage).toBe('network')
    })

    it('handles thrown ApiRequestError', async () => {
      mockFetchStatus.mockResolvedValue({ configured: false })
      mockFetchTopics.mockResolvedValue({ topics: [] })
      mockValidate.mockRejectedValue(
        new ApiRequestError(400, 'bad_request', 'Bad request'),
      )

      const store = useNotificationsStore()
      await store.load()

      store.apiToken = 'tok'
      store.userKey = 'key'
      await store.validate()

      expect(store.validationStatus).toBe('invalid')
      expect(store.validationMessage).toBe('Bad request')
    })

    it('handles thrown non-Error value', async () => {
      mockFetchStatus.mockResolvedValue({ configured: false })
      mockFetchTopics.mockResolvedValue({ topics: [] })
      mockValidate.mockRejectedValue('string-error')

      const store = useNotificationsStore()
      await store.load()

      store.apiToken = 'tok'
      store.userKey = 'key'
      await store.validate()

      expect(store.validationStatus).toBe('invalid')
      expect(store.validationMessage).toBe('Validation failed')
    })

    it('reloads topics after successful validation', async () => {
      mockFetchStatus.mockResolvedValue({ configured: false })
      mockFetchTopics.mockResolvedValue({ topics: [] })
      mockValidate.mockResolvedValue({ valid: true, error: null })

      const store = useNotificationsStore()
      await store.load()
      expect(store.topics).toHaveLength(0)

      // After validate, topics are reloaded
      mockFetchTopics.mockResolvedValue({ topics: sampleTopics })
      store.apiToken = 'tok'
      store.userKey = 'key'
      await store.validate()

      expect(store.topics).toHaveLength(2)
    })
  })

  describe('setTopic', () => {
    it('toggles topic and debounces persist', async () => {
      mockFetchStatus.mockResolvedValue({ configured: true })
      mockFetchTopics.mockResolvedValue({ topics: [...sampleTopics] })
      mockUpdatePrefs.mockResolvedValue({ preferences: {} })

      const store = useNotificationsStore()
      await store.load()

      store.setTopic('notif_job_failed', false)
      expect(
        store.topics.find((t) => t.key === 'notif_job_failed')?.enabled,
      ).toBe(false)

      // Not yet persisted (debounced)
      expect(mockUpdatePrefs).not.toHaveBeenCalled()

      // Advance past debounce
      vi.advanceTimersByTime(600)
      expect(mockUpdatePrefs).toHaveBeenCalledOnce()
    })

    it('does nothing for unknown key', async () => {
      mockFetchStatus.mockResolvedValue({ configured: true })
      mockFetchTopics.mockResolvedValue({ topics: [...sampleTopics] })

      const store = useNotificationsStore()
      await store.load()

      store.setTopic('nonexistent', true)
      vi.advanceTimersByTime(600)
      expect(mockUpdatePrefs).not.toHaveBeenCalled()
    })
  })

  describe('sendTest', () => {
    it('stores successful result', async () => {
      mockFetchStatus.mockResolvedValue({ configured: true })
      mockFetchTopics.mockResolvedValue({ topics: [] })
      mockSendTest.mockResolvedValue({ sent: true, error: null })

      const store = useNotificationsStore()
      await store.load()
      await store.sendTest()

      expect(store.testResult).toEqual({ sent: true, error: null })
      expect(store.sendingTest).toBe(false)
    })

    it('stores error result on Error', async () => {
      mockFetchStatus.mockResolvedValue({ configured: true })
      mockFetchTopics.mockResolvedValue({ topics: [] })
      mockSendTest.mockRejectedValue(new Error('timeout'))

      const store = useNotificationsStore()
      await store.load()
      await store.sendTest()

      expect(store.testResult?.sent).toBe(false)
      expect(store.testResult?.error).toBe('timeout')
    })

    it('stores error result on ApiRequestError', async () => {
      mockFetchStatus.mockResolvedValue({ configured: true })
      mockFetchTopics.mockResolvedValue({ topics: [] })
      mockSendTest.mockRejectedValue(
        new ApiRequestError(500, 'internal', 'Internal error'),
      )

      const store = useNotificationsStore()
      await store.load()
      await store.sendTest()

      expect(store.testResult?.sent).toBe(false)
      expect(store.testResult?.error).toBe('Internal error')
    })

    it('stores fallback error on non-Error', async () => {
      mockFetchStatus.mockResolvedValue({ configured: true })
      mockFetchTopics.mockResolvedValue({ topics: [] })
      mockSendTest.mockRejectedValue(42)

      const store = useNotificationsStore()
      await store.load()
      await store.sendTest()

      expect(store.testResult?.sent).toBe(false)
      expect(store.testResult?.error).toBe('Failed to send test notification')
    })
  })

  describe('computed', () => {
    it('isConfigured is true when saved and valid', async () => {
      mockFetchStatus.mockResolvedValue({ configured: true })
      mockFetchTopics.mockResolvedValue({ topics: [] })

      const store = useNotificationsStore()
      await store.load()

      expect(store.isConfigured).toBe(true)
    })

    it('topicsEnabled follows credentialsSaved', async () => {
      mockFetchStatus.mockResolvedValue({ configured: false })
      mockFetchTopics.mockResolvedValue({ topics: [] })

      const store = useNotificationsStore()
      await store.load()

      expect(store.topicsEnabled).toBe(false)
    })
  })

  describe('clearTestResult', () => {
    it('clears the test result', async () => {
      mockFetchStatus.mockResolvedValue({ configured: true })
      mockFetchTopics.mockResolvedValue({ topics: [] })
      mockSendTest.mockResolvedValue({ sent: true, error: null })

      const store = useNotificationsStore()
      await store.load()
      await store.sendTest()
      expect(store.testResult).not.toBeNull()

      store.clearTestResult()
      expect(store.testResult).toBeNull()
    })
  })
})
