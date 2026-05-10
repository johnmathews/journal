import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import FitnessConnectionsPanel from '../FitnessConnectionsPanel.vue'
import type { FitnessSyncStatus } from '@/types/fitness'

vi.mock('@/api/fitness', () => ({
  fetchSyncStatus: vi.fn(),
  fetchActivities: vi.fn(),
  fetchDaily: vi.fn(),
  triggerSync: vi.fn(),
  triggerBackfill: vi.fn(),
  connectGarmin: vi.fn(),
  submitGarminMfa: vi.fn(),
  disconnectGarmin: vi.fn(),
  getStravaAuthorizeUrl: vi.fn(),
  disconnectStrava: vi.fn(),
}))

import { fetchSyncStatus } from '@/api/fitness'
const mockFetchStatus = vi.mocked(fetchSyncStatus)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/jobs', name: 'job-history', component: { template: '<div/>' } },
  ],
})

function mountPanel() {
  return mount(FitnessConnectionsPanel, {
    global: { plugins: [router] },
  })
}

function freshStatus(): FitnessSyncStatus {
  return { strava: null, garmin: null }
}

describe('FitnessConnectionsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('hydrates sync status on mount', async () => {
    mockFetchStatus.mockResolvedValue(freshStatus())

    mountPanel()
    await flushPromises()

    expect(mockFetchStatus).toHaveBeenCalledTimes(1)
  })

  it('renders the fitness section anchor at #fitness for W10 to link back to', () => {
    mockFetchStatus.mockResolvedValue(freshStatus())
    const wrapper = mountPanel()
    const section = wrapper.get('[data-testid="fitness-section"]')
    expect(section.attributes('id')).toBe('fitness')
  })

  it('renders both connection cards', async () => {
    mockFetchStatus.mockResolvedValue(freshStatus())
    const wrapper = mountPanel()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="garmin-connection-card"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="strava-connection-card"]').exists(),
    ).toBe(true)
  })

  it('surfaces a status-error message when sync-status loading fails', async () => {
    mockFetchStatus.mockRejectedValue(new Error('network down'))
    const wrapper = mountPanel()
    await flushPromises()
    expect(
      wrapper.get('[data-testid="fitness-status-error"]').text(),
    ).toContain('network down')
  })

  it('passes the per-source status through to each card', async () => {
    mockFetchStatus.mockResolvedValue({
      strava: {
        auth_status: 'ok',
        auth_broken_since: null,
        last_success_at: '2026-05-09T18:42:11Z',
        last_runs: [],
      },
      garmin: {
        auth_status: 'broken',
        auth_broken_since: '2026-05-08T07:00:00Z',
        last_success_at: '2026-05-07T07:00:00Z',
        last_runs: [],
      },
    })
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.get('[data-testid="strava-status-line"]').text()).toContain(
      'Connected',
    )
    expect(wrapper.get('[data-testid="garmin-status-line"]').text()).toContain(
      'broken since',
    )
  })
})
