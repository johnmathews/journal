import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import StravaConnectionCard from '../StravaConnectionCard.vue'
import { ApiRequestError } from '@/api/client'
import type { FitnessSourceStatus } from '@/types/fitness'

vi.mock('@/api/fitness', () => ({
  getStravaAuthorizeUrl: vi.fn(),
  disconnectStrava: vi.fn(),
  fetchSyncStatus: vi.fn().mockResolvedValue({ strava: null, garmin: null }),
  fetchActivities: vi.fn(),
  fetchDaily: vi.fn(),
  triggerSync: vi.fn(),
  triggerBackfill: vi.fn(),
}))

import {
  getStravaAuthorizeUrl,
  disconnectStrava,
  fetchSyncStatus,
} from '@/api/fitness'

const mockAuthorize = vi.mocked(getStravaAuthorizeUrl)
const mockDisconnect = vi.mocked(disconnectStrava)
const mockFetchStatus = vi.mocked(fetchSyncStatus)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/jobs', name: 'job-history', component: { template: '<div/>' } },
  ],
})

function mountCard(status: FitnessSourceStatus | null) {
  return mount(StravaConnectionCard, {
    props: { status },
    global: { plugins: [router] },
  })
}

const connectedStatus: FitnessSourceStatus = {
  auth_status: 'ok',
  auth_broken_since: null,
  last_success_at: '2026-05-09T18:42:11Z',
  last_runs: [],
}

const brokenStatus: FitnessSourceStatus = {
  auth_status: 'broken',
  auth_broken_since: '2026-05-08T18:42:11Z',
  last_success_at: '2026-05-07T18:42:11Z',
  last_runs: [],
}

// Capture and restore window.location.href across redirects.
let originalLocation: Location

describe('StravaConnectionCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockFetchStatus.mockResolvedValue({ strava: null, garmin: null })
    originalLocation = window.location
    // Stub the location so we can observe `href = …` without happy-dom
    // actually navigating.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' } as unknown as Location,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('shows "Not connected." and Connect Strava when status is null', () => {
    const wrapper = mountCard(null)
    expect(wrapper.get('[data-testid="strava-status-line"]').text()).toContain(
      'Not connected',
    )
    expect(wrapper.find('[data-testid="strava-connect-btn"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="backfill-form-strava"]').exists()).toBe(
      false,
    )
  })

  it('renders Disconnect and the backfill form when connected', () => {
    const wrapper = mountCard(connectedStatus)
    expect(wrapper.find('[data-testid="strava-disconnect-btn"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="strava-connect-btn"]').exists()).toBe(
      false,
    )
    expect(wrapper.find('[data-testid="backfill-form-strava"]').exists()).toBe(
      true,
    )
  })

  it('renders Reconnect and Disconnect (no backfill) when broken', () => {
    const wrapper = mountCard(brokenStatus)
    expect(wrapper.get('[data-testid="strava-status-line"]').text()).toContain(
      'broken since',
    )
    expect(wrapper.find('[data-testid="strava-reconnect-btn"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="strava-disconnect-btn"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="backfill-form-strava"]').exists()).toBe(
      false,
    )
  })

  it('redirects to authorize_url when Connect Strava is clicked', async () => {
    mockAuthorize.mockResolvedValue({
      authorize_url: 'https://www.strava.com/oauth/authorize?state=tok',
      state: 'tok',
      expires_at: '2026-05-10T12:34:56Z',
    })

    const wrapper = mountCard(null)
    await wrapper.get('[data-testid="strava-connect-btn"]').trigger('click')
    await flushPromises()

    expect(mockAuthorize).toHaveBeenCalledTimes(1)
    expect(window.location.href).toBe(
      'https://www.strava.com/oauth/authorize?state=tok',
    )
  })

  it('surfaces an error message and re-enables the button when authorize fails', async () => {
    mockAuthorize.mockRejectedValue(
      new ApiRequestError(500, 'config', 'STRAVA_CLIENT_ID is not configured'),
    )

    const wrapper = mountCard(null)
    await wrapper.get('[data-testid="strava-connect-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="strava-error"]').text()).toContain(
      'STRAVA_CLIENT_ID',
    )
    const btn = wrapper.get('[data-testid="strava-connect-btn"]')
    expect((btn.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('calls disconnectStrava and refreshes sync status on Disconnect', async () => {
    mockDisconnect.mockResolvedValue({ disconnected: true })

    const wrapper = mountCard(connectedStatus)
    await wrapper.get('[data-testid="strava-disconnect-btn"]').trigger('click')
    await flushPromises()

    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(mockFetchStatus).toHaveBeenCalledTimes(1)
  })

  it('falls back to a generic message when disconnect returns a non-Error', async () => {
    mockDisconnect.mockRejectedValue('boom')

    const wrapper = mountCard(connectedStatus)
    await wrapper.get('[data-testid="strava-disconnect-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="strava-error"]').text()).toContain(
      'Disconnect failed',
    )
  })
})
