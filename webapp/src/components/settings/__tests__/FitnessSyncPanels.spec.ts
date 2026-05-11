import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FitnessSyncPanels from '../FitnessSyncPanels.vue'
import { useFitnessStore } from '@/stores/fitness'
import type { FitnessSyncStatus } from '@/types/fitness'

vi.mock('@/api/fitness', () => ({
  fetchSyncStatus: vi.fn(),
  triggerSync: vi.fn(),
  fetchActivities: vi.fn(),
  fetchDaily: vi.fn(),
}))

import { triggerSync } from '@/api/fitness'
const mockTriggerSync = vi.mocked(triggerSync)

function statusOk(): FitnessSyncStatus {
  return {
    strava: {
      auth_status: 'ok',
      auth_broken_since: null,
      last_success_at: '2026-05-09T18:42:11Z',
      last_runs: [
        {
          id: 1,
          started_at: '2026-05-09T18:42:08Z',
          finished_at: '2026-05-09T18:42:11Z',
          status: 'success',
          rows_fetched: 12,
          rows_normalized: 12,
          error_class: null,
          error_message: null,
        },
      ],
    },
    garmin: null,
  }
}

function mountPanels(status: FitnessSyncStatus) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useFitnessStore()
  store.syncStatus = status
  return mount(FitnessSyncPanels, {
    global: { plugins: [pinia] },
  })
}

describe('FitnessSyncPanels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders both source cards with auth status labels', async () => {
    const wrapper = mountPanels(statusOk())
    await flushPromises()

    expect(
      wrapper.find('[data-testid="fitness-source-card-strava"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="fitness-source-card-garmin"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="fitness-strava-auth-status"]').text(),
    ).toBe('OK')
    expect(
      wrapper.find('[data-testid="fitness-garmin-auth-status"]').text(),
    ).toBe('Not connected')
  })

  it('queues a sync job when the Strava button is clicked', async () => {
    mockTriggerSync.mockResolvedValue({ job_id: 'job-1', status: 'queued' })
    const wrapper = mountPanels(statusOk())
    await flushPromises()

    await wrapper
      .find('[data-testid="fitness-strava-sync-btn"]')
      .trigger('click')
    await flushPromises()

    expect(mockTriggerSync).toHaveBeenCalledWith('strava')
  })

  it('surfaces a sync-trigger error inline below the button', async () => {
    mockTriggerSync.mockRejectedValue(new Error('503 not configured'))
    const wrapper = mountPanels(statusOk())
    await flushPromises()

    await wrapper
      .find('[data-testid="fitness-garmin-sync-btn"]')
      .trigger('click')
    await flushPromises()

    const err = wrapper.find('[data-testid="fitness-garmin-sync-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('503 not configured')
  })

  it('renders broken-source state with broken_since timestamp and recent runs', async () => {
    const wrapper = mountPanels({
      strava: {
        auth_status: 'broken',
        auth_broken_since: '2026-05-09T00:00:00Z',
        last_success_at: '2026-05-08T07:00:00Z',
        last_runs: [
          {
            id: 99,
            started_at: '2026-05-09T08:00:00Z',
            finished_at: '2026-05-09T08:00:01Z',
            status: 'auth_broken',
            rows_fetched: 0,
            rows_normalized: 0,
            error_class: 'AuthBroken',
            error_message: 'expired',
          },
          {
            id: 100,
            started_at: '2026-05-09T07:00:00Z',
            finished_at: null,
            status: 'transient_failure',
            rows_fetched: 0,
            rows_normalized: 0,
            error_class: 'Transient',
            error_message: 'rate-limited',
          },
        ],
      },
      garmin: null,
    })
    await flushPromises()

    expect(
      wrapper.find('[data-testid="fitness-strava-auth-status"]').text(),
    ).toBe('Broken')
    // Exercises auth_broken and transient_failure status colours in
    // lastRunStatusClass.
    expect(wrapper.text()).toContain('auth_broken')
    expect(wrapper.text()).toContain('transient_failure')
  })
})
