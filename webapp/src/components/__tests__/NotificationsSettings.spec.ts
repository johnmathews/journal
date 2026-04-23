import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import NotificationsSettings from '../NotificationsSettings.vue'

vi.mock('@/api/notifications', () => ({
  fetchNotificationTopics: vi.fn(),
  fetchNotificationStatus: vi.fn(),
  validatePushoverCredentials: vi.fn(),
  sendPushoverTest: vi.fn(),
}))

vi.mock('@/api/preferences', () => ({
  updatePreferences: vi.fn(),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    toasts: { value: [] },
  }),
}))

import {
  fetchNotificationTopics,
  fetchNotificationStatus,
  validatePushoverCredentials,
} from '@/api/notifications'
import { useAuthStore } from '@/stores/auth'
import type { AuthUser } from '@/stores/auth'

const mockFetchTopics = vi.mocked(fetchNotificationTopics)
const mockFetchStatus = vi.mocked(fetchNotificationStatus)
const mockValidate = vi.mocked(validatePushoverCredentials)
// sendPushoverTest is mocked at module level; no explicit mock reference needed here

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
  {
    key: 'notif_admin_job_failed',
    label: "Any user's job failed (admin)",
    group: 'admin',
    admin_only: true,
    default: true,
    enabled: true,
  },
]

function mountComponent() {
  return mount(NotificationsSettings, {
    global: {
      plugins: [],
    },
  })
}

describe('NotificationsSettings', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockFetchStatus.mockResolvedValue({ configured: false })
    mockFetchTopics.mockResolvedValue({ topics: [...sampleTopics] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the notifications section', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="notifications-section"]').exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain('Notifications')
  })

  it('shows "Not configured" badge when not configured', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(
      wrapper.find('[data-testid="notif-status-not-configured"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="notif-status-configured"]').exists(),
    ).toBe(false)
  })

  it('shows "Configured" badge when configured', async () => {
    mockFetchStatus.mockResolvedValue({ configured: true })
    const wrapper = mountComponent()
    await flushPromises()

    expect(
      wrapper.find('[data-testid="notif-status-configured"]').exists(),
    ).toBe(true)
  })

  it('renders credential inputs as password type by default', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const tokenInput = wrapper.find('[data-testid="pushover-token-input"]')
    const keyInput = wrapper.find('[data-testid="pushover-key-input"]')
    expect(tokenInput.attributes('type')).toBe('password')
    expect(keyInput.attributes('type')).toBe('password')
  })

  it('toggles token visibility on eye icon click', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const toggle = wrapper.find('[data-testid="toggle-show-token"]')
    await toggle.trigger('click')

    const tokenInput = wrapper.find('[data-testid="pushover-token-input"]')
    expect(tokenInput.attributes('type')).toBe('text')
  })

  it('disables validate button when inputs are empty', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const btn = wrapper.find('[data-testid="validate-button"]')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables send test button when not configured', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const btn = wrapper.find('[data-testid="send-test-button"]')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('topics section is disabled when credentials not saved', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const topicsSection = wrapper.find('[data-testid="topics-section"]')
    expect(topicsSection.classes()).toContain('opacity-50')
  })

  it('topics section is enabled when credentials saved', async () => {
    mockFetchStatus.mockResolvedValue({ configured: true })
    const wrapper = mountComponent()
    await flushPromises()

    const topicsSection = wrapper.find('[data-testid="topics-section"]')
    expect(topicsSection.classes()).not.toContain('opacity-50')
  })

  it('hides admin topics for non-admin users', async () => {
    mockFetchStatus.mockResolvedValue({ configured: true })
    const wrapper = mountComponent()
    await flushPromises()

    // Auth store defaults to non-admin
    expect(
      wrapper.find('[data-testid="topic-notif_admin_job_failed"]').exists(),
    ).toBe(false)
  })

  it('shows admin topics for admin users', async () => {
    mockFetchStatus.mockResolvedValue({ configured: true })
    // Set up admin user
    const authStore = useAuthStore()
    authStore.user = {
      id: 1,
      email: 'admin@test.com',
      display_name: 'Admin',
      is_admin: true,
      is_active: true,
      email_verified: true,
      created_at: '',
      updated_at: '',
    } as AuthUser

    const wrapper = mountComponent()
    await flushPromises()

    expect(
      wrapper.find('[data-testid="topic-notif_admin_job_failed"]').exists(),
    ).toBe(true)
  })

  it('renders topic toggle switches', async () => {
    mockFetchStatus.mockResolvedValue({ configured: true })
    const wrapper = mountComponent()
    await flushPromises()

    const toggles = wrapper.findAll('[role="switch"]')
    // Should have at least 2 toggles (success + failure topics, no admin)
    expect(toggles.length).toBeGreaterThanOrEqual(2)
  })

  it('calls validate on button click', async () => {
    mockValidate.mockResolvedValue({ valid: true, error: null })
    mockFetchTopics.mockResolvedValue({ topics: sampleTopics })

    const wrapper = mountComponent()
    await flushPromises()

    // Fill in credentials
    const tokenInput = wrapper.find('[data-testid="pushover-token-input"]')
    const keyInput = wrapper.find('[data-testid="pushover-key-input"]')
    await tokenInput.setValue('test-token')
    await keyInput.setValue('test-key')

    const btn = wrapper.find('[data-testid="validate-button"]')
    await btn.trigger('click')
    await flushPromises()

    expect(mockValidate).toHaveBeenCalledWith('test-key', 'test-token')
  })

  it('shows validation error status', async () => {
    mockValidate.mockResolvedValue({ valid: false, error: 'key is invalid' })

    const wrapper = mountComponent()
    await flushPromises()

    const tokenInput = wrapper.find('[data-testid="pushover-token-input"]')
    const keyInput = wrapper.find('[data-testid="pushover-key-input"]')
    await tokenInput.setValue('bad-token')
    await keyInput.setValue('bad-key')

    await wrapper.find('[data-testid="validate-button"]').trigger('click')
    await flushPromises()

    const status = wrapper.find('[data-testid="validation-status"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain('key is invalid')
  })

  it('toggles user key visibility', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const toggle = wrapper.find('[data-testid="toggle-show-key"]')
    await toggle.trigger('click')

    const keyInput = wrapper.find('[data-testid="pushover-key-input"]')
    expect(keyInput.attributes('type')).toBe('text')
  })

  it('shows validation success status', async () => {
    mockValidate.mockResolvedValue({ valid: true, error: null })
    mockFetchTopics.mockResolvedValue({ topics: sampleTopics })

    const wrapper = mountComponent()
    await flushPromises()

    const tokenInput = wrapper.find('[data-testid="pushover-token-input"]')
    const keyInput = wrapper.find('[data-testid="pushover-key-input"]')
    await tokenInput.setValue('test-token')
    await keyInput.setValue('test-key')

    await wrapper.find('[data-testid="validate-button"]').trigger('click')
    await flushPromises()

    const status = wrapper.find('[data-testid="validation-status"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain('Credentials are valid')
  })
})
