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
  reconnectGarmin: vi.fn(),
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
  reconnectGarmin,
  disconnectGarmin,
  fetchSyncStatus,
} from '@/api/fitness'

const mockConnect = vi.mocked(connectGarmin)
const mockMfa = vi.mocked(submitGarminMfa)
const mockReconnect = vi.mocked(reconnectGarmin)
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

const connectedSavedStatus: FitnessSourceStatus = {
  ...connectedStatus,
  credentials_saved: true,
}

const brokenSavedStatus: FitnessSourceStatus = {
  ...brokenStatus,
  credentials_saved: true,
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

  // ── W7: saved-credentials UX ─────────────────────────────────────────

  it('shows the saved-credentials line when credentials_saved is true', () => {
    const wrapper = mountCard(connectedSavedStatus)
    const line = wrapper.get('[data-testid="garmin-creds-saved-line"]')
    expect(line.text()).toContain(
      'Credentials saved — re-authentication is usually automatic.',
    )
  })

  it('hides the saved-credentials line when credentials_saved is absent or false', () => {
    expect(
      mountCard(connectedStatus)
        .find('[data-testid="garmin-creds-saved-line"]')
        .exists(),
    ).toBe(false)
    expect(
      mountCard({ ...connectedStatus, credentials_saved: false })
        .find('[data-testid="garmin-creds-saved-line"]')
        .exists(),
    ).toBe(false)
    expect(
      mountCard(null).find('[data-testid="garmin-creds-saved-line"]').exists(),
    ).toBe(false)
  })

  it('offers one-click reconnect (not the credentials form) when auth is broken and credentials are saved', () => {
    const wrapper = mountCard(brokenSavedStatus)
    expect(
      wrapper.find('[data-testid="garmin-reconnect-saved-btn"]').exists(),
    ).toBe(true)
    // The plain Reconnect (credentials-form) button is replaced…
    expect(wrapper.find('[data-testid="garmin-reconnect-btn"]').exists()).toBe(
      false,
    )
    // …and no credentials form is shown by default.
    expect(
      wrapper.find('[data-testid="garmin-credentials-form"]').exists(),
    ).toBe(false)
    // A secondary path to fresh credentials stays available.
    expect(
      wrapper.find('[data-testid="garmin-use-different-creds"]').exists(),
    ).toBe(true)
  })

  it('keeps the credentials-form Reconnect path when auth is broken without saved credentials', async () => {
    const wrapper = mountCard(brokenStatus)
    expect(
      wrapper.find('[data-testid="garmin-reconnect-saved-btn"]').exists(),
    ).toBe(false)
    await wrapper.get('[data-testid="garmin-reconnect-btn"]').trigger('click')
    expect(
      wrapper.find('[data-testid="garmin-credentials-form"]').exists(),
    ).toBe(true)
    expect(mockReconnect).not.toHaveBeenCalled()
  })

  it('reconnect-with-saved success refreshes status and returns to idle', async () => {
    mockReconnect.mockResolvedValue({
      connected: true,
      upstream_user_id: 'alice.garmin',
    })

    const wrapper = mountCard(brokenSavedStatus)
    await wrapper
      .get('[data-testid="garmin-reconnect-saved-btn"]')
      .trigger('click')
    await flushPromises()

    expect(mockReconnect).toHaveBeenCalledTimes(1)
    expect(mockFetchStatus).toHaveBeenCalledTimes(1)
    expect(
      wrapper.find('[data-testid="garmin-credentials-form"]').exists(),
    ).toBe(false)
    expect(wrapper.find('[data-testid="garmin-mfa-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="garmin-error"]').exists()).toBe(false)
  })

  it('reconnect-with-saved lands in the MFA form on mfa_required and completes via the pending session', async () => {
    mockReconnect.mockResolvedValue({
      mfa_required: true,
      pending_session: 'tok-reconnect',
      expires_at: '2026-07-14T12:34:56Z',
    })
    mockMfa.mockResolvedValue({
      connected: true,
      upstream_user_id: 'alice.garmin',
    })

    const wrapper = mountCard(brokenSavedStatus)
    await wrapper
      .get('[data-testid="garmin-reconnect-saved-btn"]')
      .trigger('click')
    await flushPromises()

    // Straight into the MFA form — no password entry.
    expect(wrapper.find('[data-testid="garmin-mfa-form"]').exists()).toBe(true)
    expect(
      wrapper.find('[data-testid="garmin-credentials-form"]').exists(),
    ).toBe(false)

    await wrapper.get('[data-testid="garmin-mfa-input"]').setValue('123456')
    await wrapper.get('[data-testid="garmin-mfa-submit"]').trigger('click')
    await flushPromises()

    expect(mockMfa).toHaveBeenCalledWith({
      pending_session: 'tok-reconnect',
      code: '123456',
    })
    expect(wrapper.find('[data-testid="garmin-mfa-form"]').exists()).toBe(false)
  })

  it('falls back to the credentials form with an explanation on 409 credentials_unavailable', async () => {
    mockReconnect.mockRejectedValue(
      new ApiRequestError(409, 'credentials_unavailable', 'unavailable', {
        error: '...',
        reason: 'credentials_unavailable',
      }),
    )

    const wrapper = mountCard(brokenSavedStatus)
    await wrapper
      .get('[data-testid="garmin-reconnect-saved-btn"]')
      .trigger('click')
    await flushPromises()

    expect(
      wrapper.find('[data-testid="garmin-credentials-form"]').exists(),
    ).toBe(true)
    expect(wrapper.get('[data-testid="garmin-error"]').text()).toContain(
      'can no longer be decrypted',
    )
  })

  it('falls back to the credentials form with an explanation on 404 no_saved_credentials', async () => {
    mockReconnect.mockRejectedValue(
      new ApiRequestError(404, 'no_saved_credentials', 'none saved', {
        error: '...',
        reason: 'no_saved_credentials',
      }),
    )

    const wrapper = mountCard(brokenSavedStatus)
    await wrapper
      .get('[data-testid="garmin-reconnect-saved-btn"]')
      .trigger('click')
    await flushPromises()

    expect(
      wrapper.find('[data-testid="garmin-credentials-form"]').exists(),
    ).toBe(true)
    expect(wrapper.get('[data-testid="garmin-error"]').text()).toContain(
      'No saved Garmin credentials',
    )
  })

  it('stays on the resting card with a rate-limit message when reconnect is rate-limited', async () => {
    mockReconnect.mockRejectedValue(
      new ApiRequestError(429, 'rate_limited', 'rate limited', {
        error: '...',
        reason: 'rate_limited',
        retry_after_seconds: 300,
      }),
    )

    const wrapper = mountCard(brokenSavedStatus)
    await wrapper
      .get('[data-testid="garmin-reconnect-saved-btn"]')
      .trigger('click')
    await flushPromises()

    const text = wrapper.get('[data-testid="garmin-error"]').text()
    expect(text).toContain('Stop retrying and wait about 5 minutes')
    // No form fallback — the one-click path stays available for a retry.
    expect(
      wrapper.find('[data-testid="garmin-credentials-form"]').exists(),
    ).toBe(false)
    expect(
      wrapper.find('[data-testid="garmin-reconnect-saved-btn"]').exists(),
    ).toBe(true)
  })

  it('maps local_cooldown on reconnect to the per-account wait message', async () => {
    mockReconnect.mockRejectedValue(
      new ApiRequestError(429, 'local_cooldown', 'too many', {
        error: '...',
        reason: 'local_cooldown',
        retry_after_seconds: 90,
      }),
    )

    const wrapper = mountCard(brokenSavedStatus)
    await wrapper
      .get('[data-testid="garmin-reconnect-saved-btn"]')
      .trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="garmin-error"]').text()).toContain(
      'Too many recent Garmin login attempts for that account. Wait about 2 minutes',
    )
  })

  it('the "use different credentials" link opens the credentials form', async () => {
    const wrapper = mountCard(brokenSavedStatus)
    await wrapper
      .get('[data-testid="garmin-use-different-creds"]')
      .trigger('click')
    expect(
      wrapper.find('[data-testid="garmin-credentials-form"]').exists(),
    ).toBe(true)
    expect(mockReconnect).not.toHaveBeenCalled()
  })

  it('credentials-form copy is accurate about encrypted storage and no longer claims "never stored"', async () => {
    const wrapper = mountCard(null)
    await wrapper.get('[data-testid="garmin-connect-btn"]').trigger('click')

    const note = wrapper.get('[data-testid="garmin-password-storage-note"]')
    expect(note.text()).not.toContain('never')
    expect(note.text()).not.toContain('never stored')
    expect(note.text()).toContain('saved encrypted')
    expect(note.text()).toContain('re-authentication can happen automatically')
  })
})
