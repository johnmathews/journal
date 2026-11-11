import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FitnessSyncPanels from '../FitnessSyncPanels.vue'
import { useFitnessStore } from '@/stores/fitness'
import { useSettingsStore } from '@/stores/settings'
import { makeServerSettingsWithStrava } from '@/__tests__/fixtures/server-settings'
import type { FitnessSyncStatus } from '@/types/fitness'

vi.mock('@/api/fitness', () => ({
  fetchSyncStatus: vi.fn(),
  triggerSync: vi.fn(),
  fetchActivities: vi.fn(),
  fetchDaily: vi.fn(),
}))

// The panel calls settingsStore.ensureLoaded() (Strava feature flag).
// Keep the fetch pending; tests seed the store directly so the flag-
// unknown case proves the fail-closed default.
vi.mock('@/api/settings', () => ({
  fetchSettings: vi.fn(() => new Promise(() => {})),
  fetchHealth: vi.fn(() => new Promise(() => {})),
  updateRuntimeSettings: vi.fn(),
  updatePricing: vi.fn(),
}))

// startSync registers the queued job via jobsStore.trackJob, which
// would start a real polling loop with real fetches. Stub the store.
vi.mock('@/stores/jobs', () => ({
  useJobsStore: () => ({ trackJob: vi.fn() }),
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
          workouts_fetched: 12,
          wellness_fetched: 0,
          workouts_normalized: 12,
          wellness_normalized: 0,
          error_class: null,
          error_message: null,
        },
      ],
    },
    garmin: null,
  }
}

function mountPanels(
  status: FitnessSyncStatus,
  stravaEnabled: boolean | null = true,
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useFitnessStore()
  store.syncStatus = status
  // `null` leaves the settings store unhydrated (flag unknown → fail
  // closed); otherwise seed the Strava feature flag explicitly.
  if (stravaEnabled !== null) {
    useSettingsStore().settings = makeServerSettingsWithStrava(stravaEnabled)
  }
  return mount(FitnessSyncPanels, {
    global: { plugins: [pinia] },
  })
}

describe('FitnessSyncPanels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders both source cards with auth status labels when strava_enabled is true', async () => {
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
    // Strava listed before Garmin — the pre-mothball order is preserved.
    const cards = wrapper.findAll('[data-testid^="fitness-source-card-"]')
    expect(cards.map((c) => c.attributes('data-testid'))).toEqual([
      'fitness-source-card-strava',
      'fitness-source-card-garmin',
    ])
  })

  it('renders only the Garmin card when strava_enabled is false', async () => {
    const wrapper = mountPanels(statusOk(), false)
    await flushPromises()

    expect(
      wrapper.find('[data-testid="fitness-source-card-garmin"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="fitness-source-card-strava"]').exists(),
    ).toBe(false)
  })

  it('renders only the Garmin card while the flag is unknown (fail-closed)', async () => {
    const wrapper = mountPanels(statusOk(), null)
    await flushPromises()

    expect(
      wrapper.find('[data-testid="fitness-source-card-garmin"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="fitness-source-card-strava"]').exists(),
    ).toBe(false)
  })

  it('explains the F/N abbreviation under the Recent runs table', async () => {
    const wrapper = mountPanels(statusOk())
    await flushPromises()

    // Strava card has at least one run, so the details/table render.
    const legend = wrapper.find('[data-testid="fitness-fn-legend"]')
    expect(legend.exists()).toBe(true)
    expect(legend.text()).toBe('F/N = Fetched / Normalized')

    // The column header also carries a hover tooltip.
    const stravaCard = wrapper.find(
      '[data-testid="fitness-source-card-strava"]',
    )
    const workoutsHeader = stravaCard
      .findAll('th')
      .find((th) => th.text().includes('Workouts F/N'))
    expect(workoutsHeader?.attributes('title')).toBe(
      'F/N = Fetched / Normalized',
    )
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

  it('shows "Not connected" and "—" for last success when sync_status is null', async () => {
    const wrapper = mountPanels({ strava: null, garmin: null })
    await flushPromises()
    expect(
      wrapper.find('[data-testid="fitness-strava-auth-status"]').text(),
    ).toBe('Not connected')
    expect(
      wrapper.find('[data-testid="fitness-garmin-auth-status"]').text(),
    ).toBe('Not connected')
    // Last-success row should show the dash placeholder.
    expect(wrapper.text()).toContain('—')
  })

  it('falls back to "Unknown" auth status for an unexpected enum value', async () => {
    const wrapper = mountPanels({
      strava: {
        // Force an out-of-domain value to exercise the fallback branch.
        // (Server enums today are ok / broken — this is defence-in-depth.)
        auth_status: 'mystery' as 'ok',
        auth_broken_since: null,
        last_success_at: null,
        last_runs: [],
      },
      garmin: null,
    })
    await flushPromises()
    expect(
      wrapper.find('[data-testid="fitness-strava-auth-status"]').text(),
    ).toBe('Unknown')
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
            workouts_fetched: 0,
            wellness_fetched: 0,
            workouts_normalized: 0,
            wellness_normalized: 0,
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
            workouts_fetched: 0,
            wellness_fetched: 0,
            workouts_normalized: 0,
            wellness_normalized: 0,
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

  // --- T7: per-bucket Workouts / Wellness columns ---

  it('renders only the Workouts column for Strava (no Wellness)', async () => {
    const wrapper = mountPanels(statusOk())
    await flushPromises()

    const stravaCard = wrapper.find(
      '[data-testid="fitness-source-card-strava"]',
    )
    const headers = stravaCard.findAll('th').map((h) => h.text())
    expect(headers).toContain('Workouts F/N')
    expect(headers).not.toContain('Wellness F/N')
  })

  it('renders both Workouts and Wellness columns for Garmin', async () => {
    const wrapper = mountPanels({
      strava: null,
      garmin: {
        auth_status: 'ok',
        auth_broken_since: null,
        last_success_at: '2026-05-11T22:20:00Z',
        last_runs: [
          {
            id: 7,
            started_at: '2026-05-11T22:20:00Z',
            finished_at: '2026-05-11T22:20:03Z',
            status: 'success',
            rows_fetched: 8,
            rows_normalized: 3,
            workouts_fetched: 2,
            wellness_fetched: 6,
            workouts_normalized: 2,
            wellness_normalized: 1,
            error_class: null,
            error_message: null,
          },
        ],
      },
    })
    await flushPromises()

    const garminCard = wrapper.find(
      '[data-testid="fitness-source-card-garmin"]',
    )
    const headers = garminCard.findAll('th').map((h) => h.text())
    expect(headers).toContain('Workouts F/N')
    expect(headers).toContain('Wellness F/N')

    // The first data row should render the per-bucket fetched/normalized.
    const rowCells = garminCard
      .findAll('tbody tr')[0]!
      .findAll('td')
      .map((c) => c.text())
    expect(rowCells).toContain('2 / 2')
    expect(rowCells).toContain('6 / 1')
  })

  it('falls back to the legacy rows_fetched total for pre-T7 rows', async () => {
    // A Garmin row from before the T7 migration: new bucket fields are 0
    // but rows_fetched is non-zero. The UI should fold the legacy total
    // into the most-likely bucket (Wellness for Garmin) rather than
    // showing a misleading "0 / 0".
    const wrapper = mountPanels({
      strava: null,
      garmin: {
        auth_status: 'ok',
        auth_broken_since: null,
        last_success_at: '2026-05-10T00:22:00Z',
        last_runs: [
          {
            id: 50,
            started_at: '2026-05-10T00:22:00Z',
            finished_at: '2026-05-10T00:22:03Z',
            status: 'success',
            rows_fetched: 204,
            rows_normalized: 0,
            workouts_fetched: 0,
            wellness_fetched: 0,
            workouts_normalized: 0,
            wellness_normalized: 0,
            error_class: null,
            error_message: null,
          },
        ],
      },
    })
    await flushPromises()

    const garminCard = wrapper.find(
      '[data-testid="fitness-source-card-garmin"]',
    )
    const rowCells = garminCard
      .findAll('tbody tr')[0]!
      .findAll('td')
      .map((c) => c.text())
    expect(rowCells).toContain('—')
    expect(rowCells).toContain('204 / 0')
  })
})
