import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import GarminConnectionCard from '../GarminConnectionCard.vue'
import { ApiRequestError } from '@/api/client'
import type { FitnessSourceStatus } from '@/types/fitness'

vi.mock('@/api/fitness', () => ({
  connectGarmin: vi.fn(),
  submitGarminMfa: vi.fn(),
  disconnectGarmin: vi.fn(),
  // Used by the fitness store hydrating during loadSyncStatus and by the
  // backfill form rendered after a successful connect.
  fetchSyncStatus: vi.fn().mockResolvedValue({ strava: null, garmin: null }),
  fetchActivities: vi.fn(),
  fetchDaily: vi.fn(),
  triggerSync: vi.fn(),
  triggerBackfill: vi.fn(),
}))

import {
  connectGarmin,
  submitGarminMfa,
  disconnectGarmin,
  fetchSyncStatus,
} from '@/api/fitness'

const mockConnect = vi.mocked(connectGarmin)
const mockMfa = vi.mocked(submitGarminMfa)
const mockDisconnect = vi.mocked(disconnectGarmin)
const mockFetchStatus = vi.mocked(fetchSyncStatus)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/jobs', name: 'job-history', component: { template: '<div/>' } },
  ],
})

function mountCard(status: FitnessSourceStatus | null) {
  return mount(GarminConnectionCard, {
    props: { status },
    global: { plugins: [router] },
  })
}

const connectedStatus: FitnessSourceStatus = {
  auth_status: 'ok',
  auth_broken_since: null,
  last_success_at: '2026-05-09T07:00:00Z',
  last_runs: [],
}

const brokenStatus: FitnessSourceStatus = {
  auth_status: 'broken',
  auth_broken_since: '2026-05-08T07:00:00Z',
  last_success_at: '2026-05-07T07:00:00Z',
  last_runs: [],
}

describe('GarminConnectionCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockFetchStatus.mockResolvedValue({ strava: null, garmin: null })
  })

  it('shows "Not connected." and the Connect button when status is null', () => {
    const wrapper = mountCard(null)
    expect(wrapper.get('[data-testid="garmin-status-line"]').text()).toContain(
      'Not connected',
    )
    expect(wrapper.find('[data-testid="garmin-connect-btn"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="garmin-disconnect-btn"]').exists()).toBe(
      false,
    )
    expect(wrapper.find('[data-testid="backfill-form-garmin"]').exists()).toBe(
      false,
    )
  })

  it('shows the connected status line, Disconnect button, and backfill form when status is ok', () => {
    const wrapper = mountCard(connectedStatus)
    const line = wrapper.get('[data-testid="garmin-status-line"]')
    expect(line.text()).toContain('Connected')
    expect(line.text()).toContain('Last sync')
    expect(wrapper.find('[data-testid="garmin-disconnect-btn"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="garmin-connect-btn"]').exists()).toBe(
      false,
    )
    expect(wrapper.find('[data-testid="backfill-form-garmin"]').exists()).toBe(
      true,
    )
  })

  it('shows broken-since and Reconnect when status.auth_status is broken', () => {
    const wrapper = mountCard(brokenStatus)
    expect(wrapper.get('[data-testid="garmin-status-line"]').text()).toContain(
      'broken since',
    )
    expect(wrapper.find('[data-testid="garmin-reconnect-btn"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="garmin-disconnect-btn"]').exists()).toBe(
      true,
    )
  })

  it('opens the credentials form when Connect is clicked', async () => {
    const wrapper = mountCard(null)
    await wrapper.get('[data-testid="garmin-connect-btn"]').trigger('click')
    expect(
      wrapper.find('[data-testid="garmin-credentials-form"]').exists(),
    ).toBe(true)
  })

  it('refuses to submit credentials without username + password', async () => {
    const wrapper = mountCard(null)
    await wrapper.get('[data-testid="garmin-connect-btn"]').trigger('click')
    await wrapper
      .get('[data-testid="garmin-credentials-submit"]')
      .trigger('click')
    expect(mockConnect).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="garmin-error"]').text()).toContain(
      'required',
    )
  })

  it('reloads sync status and returns to idle on a no-MFA success', async () => {
    mockConnect.mockResolvedValue({
      connected: true,
      upstream_user_id: 'alice.garmin',
    })

    const wrapper = mountCard(null)
    await wrapper.get('[data-testid="garmin-connect-btn"]').trigger('click')
    await wrapper
      .get('[data-testid="garmin-username-input"]')
      .setValue('alice@example.com')
    await wrapper
      .get('[data-testid="garmin-password-input"]')
      .setValue('hunter2')
    await wrapper
      .get('[data-testid="garmin-credentials-submit"]')
      .trigger('click')
    await flushPromises()

    expect(mockConnect).toHaveBeenCalledWith({
      username: 'alice@example.com',
      password: 'hunter2',
    })
    expect(mockFetchStatus).toHaveBeenCalledTimes(1)
    expect(
      wrapper.find('[data-testid="garmin-credentials-form"]').exists(),
    ).toBe(false)
  })

  it('transitions to the MFA prompt when the server returns mfa_required', async () => {
    mockConnect.mockResolvedValue({
      mfa_required: true,
      pending_session: 'tok-abc',
      expires_at: '2026-05-10T12:34:56Z',
    })

    const wrapper = mountCard(null)
    await wrapper.get('[data-testid="garmin-connect-btn"]').trigger('click')
    await wrapper
      .get('[data-testid="garmin-username-input"]')
      .setValue('alice@example.com')
    await wrapper
      .get('[data-testid="garmin-password-input"]')
      .setValue('hunter2')
    await wrapper
      .get('[data-testid="garmin-credentials-submit"]')
      .trigger('click')
    await flushPromises()

    expect(
      wrapper.find('[data-testid="garmin-credentials-form"]').exists(),
    ).toBe(false)
    expect(wrapper.find('[data-testid="garmin-mfa-form"]').exists()).toBe(true)
  })

  it('submits the MFA code with the pending_session token from connectGarmin', async () => {
    mockConnect.mockResolvedValue({
      mfa_required: true,
      pending_session: 'tok-abc',
      expires_at: '2026-05-10T12:34:56Z',
    })
    mockMfa.mockResolvedValue({
      connected: true,
      upstream_user_id: 'alice.garmin',
    })

    const wrapper = mountCard(null)
    await wrapper.get('[data-testid="garmin-connect-btn"]').trigger('click')
    await wrapper
      .get('[data-testid="garmin-username-input"]')
      .setValue('alice@example.com')
    await wrapper
      .get('[data-testid="garmin-password-input"]')
      .setValue('hunter2')
    await wrapper
      .get('[data-testid="garmin-credentials-submit"]')
      .trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="garmin-mfa-input"]').setValue('123456')
    await wrapper.get('[data-testid="garmin-mfa-submit"]').trigger('click')
    await flushPromises()

    expect(mockMfa).toHaveBeenCalledWith({
      pending_session: 'tok-abc',
      code: '123456',
    })
    expect(mockFetchStatus).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="garmin-mfa-form"]').exists()).toBe(false)
  })

  it('translates the invalid_credentials reason into a friendly message', async () => {
    mockConnect.mockRejectedValue(
      new ApiRequestError(
        401,
        'invalid_credentials',
        'Garmin rejected those credentials.',
        { error: '...', reason: 'invalid_credentials' },
      ),
    )

    const wrapper = mountCard(null)
    await wrapper.get('[data-testid="garmin-connect-btn"]').trigger('click')
    await wrapper
      .get('[data-testid="garmin-username-input"]')
      .setValue('a@example.com')
    await wrapper.get('[data-testid="garmin-password-input"]').setValue('x')
    await wrapper
      .get('[data-testid="garmin-credentials-submit"]')
      .trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="garmin-error"]').text()).toContain(
      'Garmin rejected those credentials',
    )
    // Form is restored so the user can retry.
    expect(
      wrapper.find('[data-testid="garmin-credentials-form"]').exists(),
    ).toBe(true)
  })

  it('renders upstream_rate_limited with stop-retrying guidance and a wait hint', async () => {
    mockConnect.mockRejectedValue(
      new ApiRequestError(429, 'upstream_rate_limited', 'rate limited', {
        error: '...',
        reason: 'upstream_rate_limited',
        retry_after_seconds: 300,
      }),
    )

    const wrapper = mountCard(null)
    await wrapper.get('[data-testid="garmin-connect-btn"]').trigger('click')
    await wrapper
      .get('[data-testid="garmin-username-input"]')
      .setValue('a@example.com')
    await wrapper.get('[data-testid="garmin-password-input"]').setValue('x')
    await wrapper
      .get('[data-testid="garmin-credentials-submit"]')
      .trigger('click')
    await flushPromises()

    const text = wrapper.get('[data-testid="garmin-error"]').text()
    expect(text).toContain('Stop retrying and wait about 5 minutes')
    expect(text).toContain('re-arms the block')
    // Form stays open so the user can retry once the wait is over.
    expect(
      wrapper.find('[data-testid="garmin-credentials-form"]').exists(),
    ).toBe(true)
  })

  it('renders local_cooldown with a per-account wait message', async () => {
    mockConnect.mockRejectedValue(
      new ApiRequestError(429, 'local_cooldown', 'too many', {
        error: '...',
        reason: 'local_cooldown',
        retry_after_seconds: 90,
      }),
    )

    const wrapper = mountCard(null)
    await wrapper.get('[data-testid="garmin-connect-btn"]').trigger('click')
    await wrapper
      .get('[data-testid="garmin-username-input"]')
      .setValue('a@example.com')
    await wrapper.get('[data-testid="garmin-password-input"]').setValue('x')
    await wrapper
      .get('[data-testid="garmin-credentials-submit"]')
      .trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="garmin-error"]').text()).toContain(
      'Too many recent Garmin login attempts for that account. Wait about 2 minutes',
    )
  })

  it('omits the wait hint when the server gives no retry_after_seconds', async () => {
    mockConnect.mockRejectedValue(
      new ApiRequestError(429, 'upstream_rate_limited', 'rate limited', {
        error: '...',
        reason: 'upstream_rate_limited',
      }),
    )

    const wrapper = mountCard(null)
    await wrapper.get('[data-testid="garmin-connect-btn"]').trigger('click')
    await wrapper
      .get('[data-testid="garmin-username-input"]')
      .setValue('a@example.com')
    await wrapper.get('[data-testid="garmin-password-input"]').setValue('x')
    await wrapper
      .get('[data-testid="garmin-credentials-submit"]')
      .trigger('click')
    await flushPromises()

    const text = wrapper.get('[data-testid="garmin-error"]').text()
    expect(text).toContain('Stop retrying and wait — each attempt re-arms')
  })

  it('translates expired_pending_session on MFA into a recovery hint', async () => {
    mockConnect.mockResolvedValue({
      mfa_required: true,
      pending_session: 'tok-abc',
      expires_at: '2026-05-10T12:34:56Z',
    })
    mockMfa.mockRejectedValue(
      new ApiRequestError(410, 'expired_pending_session', 'expired', {
        error: '...',
        reason: 'expired_pending_session',
      }),
    )

    const wrapper = mountCard(null)
    await wrapper.get('[data-testid="garmin-connect-btn"]').trigger('click')
    await wrapper
      .get('[data-testid="garmin-username-input"]')
      .setValue('a@e.com')
    await wrapper.get('[data-testid="garmin-password-input"]').setValue('x')
    await wrapper
      .get('[data-testid="garmin-credentials-submit"]')
      .trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="garmin-mfa-input"]').setValue('111111')
    await wrapper.get('[data-testid="garmin-mfa-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="garmin-error"]').text()).toContain(
      'pending session expired',
    )
  })

  it('calls disconnectGarmin and refreshes status on Disconnect', async () => {
    mockDisconnect.mockResolvedValue({ disconnected: true })

    const wrapper = mountCard(connectedStatus)
    await wrapper.get('[data-testid="garmin-disconnect-btn"]').trigger('click')
    await flushPromises()

    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(mockFetchStatus).toHaveBeenCalledTimes(1)
  })
})
