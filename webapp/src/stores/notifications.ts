import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { ApiRequestError } from '@/api/client'
import {
  fetchNotificationTopics,
  fetchNotificationStatus,
  validatePushoverCredentials,
  sendPushoverTest,
} from '@/api/notifications'
import { updatePreferences } from '@/api/preferences'
import type {
  NotificationTopic,
  PushoverValidationStatus,
  NotificationTestResponse,
} from '@/types/notifications'

export const useNotificationsStore = defineStore('notifications', () => {
  // Credential form state (local only — secrets not persisted in the store)
  const apiToken = ref('')
  const userKey = ref('')

  // Validation state machine
  const validationStatus = ref<PushoverValidationStatus>('unchecked')
  const validationMessage = ref<string | null>(null)
  const credentialsSaved = ref(false)

  // Topics
  const topics = ref<NotificationTopic[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Action states
  const validating = ref(false)
  const sendingTest = ref(false)
  const testResult = ref<NotificationTestResponse | null>(null)

  // Derived
  const isConfigured = computed(
    () => credentialsSaved.value && validationStatus.value === 'valid',
  )
  const topicsEnabled = computed(() => credentialsSaved.value)

  // Debounce timer for auto-saving topic prefs
  let _saveTimer: ReturnType<typeof setTimeout> | null = null

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    const [statusRes, topicsRes] = await Promise.all([
      fetchNotificationStatus().catch(() => ({ configured: false })),
      fetchNotificationTopics().catch(() => ({
        topics: [] as NotificationTopic[],
      })),
    ])
    credentialsSaved.value = statusRes.configured
    topics.value = topicsRes.topics
    if (statusRes.configured) {
      validationStatus.value = 'valid'
    }
    loading.value = false
  }

  function _persistTopics(): void {
    if (_saveTimer !== null) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => {
      const prefs: Record<string, boolean> = {}
      for (const t of topics.value) {
        prefs[t.key] = t.enabled
      }
      updatePreferences(prefs).catch(() => {
        error.value = 'Failed to save notification preferences'
      })
    }, 500)
  }

  function setTopic(key: string, value: boolean): void {
    const topic = topics.value.find((t) => t.key === key)
    if (topic) {
      topic.enabled = value
      _persistTopics()
    }
  }

  async function validate(): Promise<void> {
    validating.value = true
    validationStatus.value = 'validating'
    validationMessage.value = null
    testResult.value = null
    try {
      const result = await validatePushoverCredentials(
        userKey.value,
        apiToken.value,
      )
      if (result.valid) {
        validationStatus.value = 'valid'
        credentialsSaved.value = true
        // Reload topics now that credentials are saved
        const topicsRes = await fetchNotificationTopics().catch(() => ({
          topics: [],
        }))
        topics.value = topicsRes.topics
      } else {
        validationStatus.value = 'invalid'
        validationMessage.value = result.error
      }
    } catch (e) {
      validationStatus.value = 'invalid'
      if (e instanceof ApiRequestError) {
        validationMessage.value = e.message
      } else if (e instanceof Error) {
        validationMessage.value = e.message
      } else {
        validationMessage.value = 'Validation failed'
      }
    } finally {
      validating.value = false
    }
  }

  async function sendTest(): Promise<void> {
    sendingTest.value = true
    testResult.value = null
    try {
      testResult.value = await sendPushoverTest()
    } catch (e) {
      if (e instanceof ApiRequestError) {
        testResult.value = { sent: false, error: e.message }
      } else if (e instanceof Error) {
        testResult.value = { sent: false, error: e.message }
      } else {
        testResult.value = {
          sent: false,
          error: 'Failed to send test notification',
        }
      }
    } finally {
      sendingTest.value = false
    }
  }

  function clearTestResult(): void {
    testResult.value = null
  }

  return {
    apiToken,
    userKey,
    validationStatus,
    validationMessage,
    credentialsSaved,
    topics,
    loading,
    error,
    validating,
    sendingTest,
    testResult,
    isConfigured,
    topicsEnabled,
    load,
    setTopic,
    validate,
    sendTest,
    clearTestResult,
  }
})
