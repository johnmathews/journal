import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import FitnessAuthBanner from '../FitnessAuthBanner.vue'
import type { FitnessSyncStatus } from '@/types/fitness'

vi.mock('@/api/fitness', () => ({
  fetchSyncStatus: vi.fn(),
  fetchActivities: vi.fn(),
  fetchDaily: vi.fn(),
  triggerSync: vi.fn(),
}))

import { fetchSyncStatus } from '@/api/fitness'
const mockFetchSyncStatus = vi.mocked(fetchSyncStatus)

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      {
        path: '/settings',
        name: 'settings',
        component: { template: '<div/>' },
      },
    ],
  })
}

function mountBanner() {
  return mount(FitnessAuthBanner, {
    global: { plugins: [makeRouter()] },
  })
}

function statusOk(): FitnessSyncStatus {
  return {
    strava: {
      auth_status: 'ok',
      auth_broken_since: null,
      last_success_at: '2026-05-09T18:42:11Z',
      last_runs: [],
    },
    garmin: {
      auth_status: 'ok',
      auth_broken_since: null,
      last_success_at: '2026-05-09T07:00:00Z',
      last_runs: [],
    },
  }
}

function statusBroken(source: 'strava' | 'garmin'): FitnessSyncStatus {
  return {
    strava: {
      auth_status: source === 'strava' ? 'broken' : 'ok',
      auth_broken_since: source === 'strava' ? '2026-05-09T00:00:00Z' : null,
      last_success_at: '2026-05-08T07:00:00Z',
      last_runs: [],
    },
    garmin: {
      auth_status: source === 'garmin' ? 'broken' : 'ok',
      auth_broken_since: source === 'garmin' ? '2026-05-09T00:00:00Z' : null,
      last_success_at: '2026-05-08T07:00:00Z',
      last_runs: [],
    },
  }
}

describe('FitnessAuthBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders nothing when both sources are OK', async () => {
    mockFetchSyncStatus.mockResolvedValue(statusOk())

    const wrapper = mountBanner()
    await flushPromises()

    expect(wrapper.find('[data-testid="fitness-auth-banner"]').exists()).toBe(
      false,
    )
  })

  it('renders nothing when both sources are null (fresh setup, never connected)', async () => {
    mockFetchSyncStatus.mockResolvedValue({ strava: null, garmin: null })

    const wrapper = mountBanner()
    await flushPromises()

    expect(wrapper.find('[data-testid="fitness-auth-banner"]').exists()).toBe(
      false,
    )
  })

  it('renders a per-source explanation line when Strava is broken', async () => {
    mockFetchSyncStatus.mockResolvedValue(statusBroken('strava'))

    const wrapper = mountBanner()
    await flushPromises()

    expect(wrapper.find('[data-testid="fitness-auth-banner"]').exists()).toBe(
      true,
    )
    const stravaLine = wrapper.find('[data-testid="fitness-banner-strava"]')
    expect(stravaLine.exists()).toBe(true)
    expect(stravaLine.text()).toContain('Strava')
    expect(stravaLine.text()).toContain('Reconnect')
    expect(wrapper.find('[data-testid="fitness-banner-garmin"]').exists()).toBe(
      false,
    )
  })

  it('renders a per-source explanation line when Garmin is broken', async () => {
    mockFetchSyncStatus.mockResolvedValue(statusBroken('garmin'))

    const wrapper = mountBanner()
    await flushPromises()

    const garminLine = wrapper.find('[data-testid="fitness-banner-garmin"]')
    expect(garminLine.exists()).toBe(true)
    expect(garminLine.text()).toContain('Garmin')
  })

  it('renders a single Reconnect button that links to /settings#fitness', async () => {
    mockFetchSyncStatus.mockResolvedValue(statusBroken('strava'))

    const wrapper = mountBanner()
    await flushPromises()

    const reconnect = wrapper.get('[data-testid="fitness-banner-reconnect"]')
    expect(reconnect.text()).toBe('Reconnect')
    // RouterLink renders as <a href="/settings#fitness">.
    expect(reconnect.attributes('href')).toBe('/settings#fitness')
  })

  it('hydrates the store on mount via fetchSyncStatus', async () => {
    mockFetchSyncStatus.mockResolvedValue(statusOk())

    mountBanner()
    await flushPromises()

    expect(mockFetchSyncStatus).toHaveBeenCalledTimes(1)
  })

  it('no longer references the old CLI commands or operations doc', async () => {
    mockFetchSyncStatus.mockResolvedValue(statusBroken('strava'))

    const wrapper = mountBanner()
    await flushPromises()

    // The old copy mentioned `journal fitness-reauth-strava` /
    // `journal fitness-reauth-garmin` and `docs/fitness-operations.md`.
    // Reconnect is now in-app — these strings should be gone so a
    // future reader doesn't think the CLI is the recommended path.
    expect(wrapper.text()).not.toContain('journal fitness-reauth')
    expect(wrapper.text()).not.toContain('fitness-operations.md')
  })
})
