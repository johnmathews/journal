import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
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

    const wrapper = mount(FitnessAuthBanner)
    await flushPromises()

    expect(wrapper.find('[data-testid="fitness-auth-banner"]').exists()).toBe(
      false,
    )
  })

  it('renders nothing when both sources are null (fresh setup, never connected)', async () => {
    mockFetchSyncStatus.mockResolvedValue({ strava: null, garmin: null })

    const wrapper = mount(FitnessAuthBanner)
    await flushPromises()

    expect(wrapper.find('[data-testid="fitness-auth-banner"]').exists()).toBe(
      false,
    )
  })

  it('renders for a broken Strava source with the CLI command', async () => {
    mockFetchSyncStatus.mockResolvedValue(statusBroken('strava'))

    const wrapper = mount(FitnessAuthBanner)
    await flushPromises()

    expect(wrapper.find('[data-testid="fitness-auth-banner"]').exists()).toBe(
      true,
    )
    const stravaLine = wrapper.find('[data-testid="fitness-banner-strava"]')
    expect(stravaLine.exists()).toBe(true)
    expect(stravaLine.text()).toContain('journal fitness-reauth-strava')
    expect(wrapper.find('[data-testid="fitness-banner-garmin"]').exists()).toBe(
      false,
    )
  })

  it('renders for a broken Garmin source with the CLI command', async () => {
    mockFetchSyncStatus.mockResolvedValue(statusBroken('garmin'))

    const wrapper = mount(FitnessAuthBanner)
    await flushPromises()

    const garminLine = wrapper.find('[data-testid="fitness-banner-garmin"]')
    expect(garminLine.exists()).toBe(true)
    expect(garminLine.text()).toContain('journal fitness-reauth-garmin')
  })

  it('hydrates the store on mount via fetchSyncStatus', async () => {
    mockFetchSyncStatus.mockResolvedValue(statusOk())

    mount(FitnessAuthBanner)
    await flushPromises()

    expect(mockFetchSyncStatus).toHaveBeenCalledTimes(1)
  })

  it('points to docs/fitness-operations.md §2 in the banner copy', async () => {
    mockFetchSyncStatus.mockResolvedValue(statusBroken('strava'))

    const wrapper = mount(FitnessAuthBanner)
    await flushPromises()

    expect(wrapper.text()).toContain('docs/fitness-operations.md')
    expect(wrapper.text()).toContain('§2')
  })
})
