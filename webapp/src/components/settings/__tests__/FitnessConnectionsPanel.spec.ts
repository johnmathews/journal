import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import FitnessConnectionsPanel from '../FitnessConnectionsPanel.vue'
import { useSettingsStore } from '@/stores/settings'
import { makeServerSettingsWithStrava } from '@/__tests__/fixtures/server-settings'
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

// The panel calls settingsStore.ensureLoaded() on mount (Strava feature
// flag). Keep the fetch pending by default so tests control the flag by
// seeding the store directly; the "flag unknown" test relies on the
// pending state to prove the fail-closed default.
vi.mock('@/api/settings', () => ({
  fetchSettings: vi.fn(() => new Promise(() => {})),
  fetchHealth: vi.fn(() => new Promise(() => {})),
  updateRuntimeSettings: vi.fn(),
  updatePricing: vi.fn(),
}))

import { fetchSyncStatus } from '@/api/fitness'
const mockFetchStatus = vi.mocked(fetchSyncStatus)

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/settings', component: { template: '<div/>' } },
      { path: '/jobs', name: 'job-history', component: { template: '<div/>' } },
    ],
  })
}

/**
 * Seed the settings store with the Strava flag. `null` leaves the store
 * unhydrated to exercise the fail-closed (flag unknown) default.
 */
function seedStravaFlag(enabled: boolean | null) {
  if (enabled === null) return
  useSettingsStore().settings = makeServerSettingsWithStrava(enabled)
}

function mountPanel(stravaEnabled: boolean | null = true) {
  seedStravaFlag(stravaEnabled)
  return mount(FitnessConnectionsPanel, {
    global: { plugins: [makeRouter()] },
  })
}

async function mountPanelAt(
  fullPath: string,
  stravaEnabled: boolean | null = true,
) {
  seedStravaFlag(stravaEnabled)
  const router = makeRouter()
  await router.push(fullPath)
  await router.isReady()
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

  it('renders both connection cards when strava_enabled is true', async () => {
    mockFetchStatus.mockResolvedValue(freshStatus())
    const wrapper = mountPanel(true)
    await flushPromises()
    expect(
      wrapper.find('[data-testid="garmin-connection-card"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="strava-connection-card"]').exists(),
    ).toBe(true)
  })

  it('hides the Strava card when strava_enabled is false (Garmin still renders)', async () => {
    mockFetchStatus.mockResolvedValue(freshStatus())
    const wrapper = mountPanel(false)
    await flushPromises()
    expect(
      wrapper.find('[data-testid="garmin-connection-card"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="strava-connection-card"]').exists(),
    ).toBe(false)
  })

  it('hides the Strava card while the flag is unknown (fail-closed before settings load)', async () => {
    mockFetchStatus.mockResolvedValue(freshStatus())
    const wrapper = mountPanel(null)
    await flushPromises()
    expect(
      wrapper.find('[data-testid="garmin-connection-card"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="strava-connection-card"]').exists(),
    ).toBe(false)
  })

  it('ignores the ?strava_error query param when strava_enabled is false', async () => {
    mockFetchStatus.mockResolvedValue(freshStatus())
    const wrapper = await mountPanelAt(
      '/settings?strava_error=access_denied#fitness',
      false,
    )
    await flushPromises()
    expect(
      wrapper.find('[data-testid="fitness-strava-callback-error"]').exists(),
    ).toBe(false)
  })

  it('surfaces a status-error message when sync-status loading fails', async () => {
    mockFetchStatus.mockRejectedValue(new Error('network down'))
    const wrapper = mountPanel()
    await flushPromises()
    expect(
      wrapper.get('[data-testid="fitness-status-error"]').text(),
    ).toContain('network down')
  })

  it('surfaces the strava_error query param the W10 callback redirects with', async () => {
    mockFetchStatus.mockResolvedValue(freshStatus())
    const wrapper = await mountPanelAt(
      '/settings?strava_error=access_denied#fitness',
    )
    await flushPromises()
    const banner = wrapper.get('[data-testid="fitness-strava-callback-error"]')
    expect(banner.text()).toContain('denied authorization')
  })

  it('translates expired_pending_state into a recovery-hint message', async () => {
    mockFetchStatus.mockResolvedValue(freshStatus())
    const wrapper = await mountPanelAt(
      '/settings?strava_error=expired_pending_state#fitness',
    )
    await flushPromises()
    expect(
      wrapper.get('[data-testid="fitness-strava-callback-error"]').text(),
    ).toContain('expired')
  })

  it('falls back to a generic message for an unknown strava_error reason', async () => {
    mockFetchStatus.mockResolvedValue(freshStatus())
    const wrapper = await mountPanelAt(
      '/settings?strava_error=server_on_fire#fitness',
    )
    await flushPromises()
    expect(
      wrapper.get('[data-testid="fitness-strava-callback-error"]').text(),
    ).toContain('server_on_fire')
  })

  it('does not render the strava-callback-error banner when no query param is set', async () => {
    mockFetchStatus.mockResolvedValue(freshStatus())
    const wrapper = mountPanel()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="fitness-strava-callback-error"]').exists(),
    ).toBe(false)
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
