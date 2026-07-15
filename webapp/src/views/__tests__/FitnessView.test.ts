import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import FitnessView from '../FitnessView.vue'
import { useSettingsStore } from '@/stores/settings'
import { makeServerSettingsWithStrava } from '@/__tests__/fixtures/server-settings'
import type {
  FitnessActivity,
  FitnessDaily,
  FitnessSyncStatus,
} from '@/types/fitness'

vi.mock('@/api/fitness', () => ({
  fetchActivities: vi.fn(),
  fetchDaily: vi.fn(),
  fetchSyncStatus: vi.fn(),
  triggerSync: vi.fn(),
  fetchIntegrity: vi.fn(),
  fetchMoodRecovery: vi.fn(),
  fetchDivergence: vi.fn(),
}))

// The fitness store's loadLayout()/persistLayout() hit the preferences
// endpoint with real fetches. Mock the api layer; tests that care about
// the persisted layout override fetchPreferences per-test.
vi.mock('@/api/preferences', () => ({
  fetchPreferences: vi.fn().mockResolvedValue({ preferences: {} }),
  updatePreferences: vi.fn().mockResolvedValue({ preferences: {} }),
}))

// The view calls settingsStore.ensureLoaded() on mount (Strava feature
// flag). Keep the fetch pending — mountView seeds the store directly, and
// the flag-unknown test relies on the pending state to prove the
// fail-closed default.
vi.mock('@/api/settings', () => ({
  fetchSettings: vi.fn(() => new Promise(() => {})),
  fetchHealth: vi.fn(() => new Promise(() => {})),
  updateRuntimeSettings: vi.fn(),
  updatePricing: vi.fn(),
}))

// Item 3 watches a tracked sync job via the jobs store. Stub it so the
// view's job-watching wiring is driven by a controllable fake rather
// than the real polling machinery. The job is held in a reactive ref so
// the view's `watch(() => getJobById(id))` re-fires when a test mutates
// it (running → terminal), mirroring the real store's reactivity.
import { ref } from 'vue'
import type { Job } from '@/types/job'
const jobRef = ref<Job | undefined>(undefined)
const trackJobSpy = vi.fn()
vi.mock('@/stores/jobs', () => ({
  useJobsStore: () => ({
    trackJob: trackJobSpy,
    getJobById: () => jobRef.value,
  }),
}))

function makeJob(over: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    type: 'fitness_sync_garmin',
    status: 'running',
    params: {},
    progress_current: 0,
    progress_total: 0,
    result: null,
    error_message: null,
    status_detail: null,
    created_at: '2026-05-09T00:00:00Z',
    started_at: null,
    finished_at: null,
    ...over,
  }
}

// Same chartjs-config stub the dashboard test uses — happy-dom can't
// resolve the real CSS variables, and we don't need real rendering for
// this test (we're checking the view's data/template behaviour, not
// canvas pixel output).
vi.mock('@/utils/chartjs-config', () => ({
  getChartColors: () => ({
    textColor: { light: '#94a3b8', dark: '#64748b' },
    gridColor: { light: '#e2e8f0', dark: '#334155' },
    backdropColor: { light: '#fff', dark: '#1e293b' },
    tooltipTitleColor: { light: '#334155', dark: '#f1f5f9' },
    tooltipBodyColor: { light: '#64748b', dark: '#94a3b8' },
    tooltipBgColor: { light: '#fff', dark: '#334155' },
    tooltipBorderColor: { light: '#e2e8f0', dark: '#475569' },
  }),
  getThemedGridColor: () => '#e2e8f0',
  chartAreaGradient: () => 'transparent',
  TOOLTIP_HOVER_DELAY_MS: 1000,
  tooltipHoverDelayPlugin: { id: 'tooltipHoverDelay' },
  buildLineChartOptions: () => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: {} },
    scales: { x: {}, y: {} },
  }),
}))

const { destroySpy, chartConstructorSpy, ChartStub } = vi.hoisted(() => {
  const destroy = vi.fn()
  const ctor = vi.fn().mockImplementation(() => ({ destroy }))
  function ChartStub(
    this: unknown,
    ...args: unknown[]
  ): { destroy: () => void } {
    return ctor(...args)
  }
  return {
    destroySpy: destroy,
    chartConstructorSpy: ctor,
    ChartStub: ChartStub as unknown as new (...args: unknown[]) => {
      destroy: () => void
    },
  }
})

vi.mock('chart.js', () => {
  const ChartWithStatics = Object.assign(ChartStub, {
    register: vi.fn(),
    defaults: {
      font: { family: '', weight: 500 },
      plugins: {
        tooltip: {
          borderWidth: 1,
          displayColors: false,
          mode: 'nearest',
          intersect: false,
          position: 'nearest',
          caretSize: 0,
          caretPadding: 20,
          cornerRadius: 8,
          padding: 8,
        },
      },
    },
  })
  return {
    Chart: ChartWithStatics,
    BarController: class {},
    BarElement: class {},
    CategoryScale: class {},
    DoughnutController: class {},
    ArcElement: class {},
    Filler: class {},
    Legend: class {},
    LinearScale: class {},
    LineController: class {},
    LineElement: class {},
    PointElement: class {},
    Tooltip: class {},
  }
})

import {
  fetchActivities,
  fetchDaily,
  fetchSyncStatus,
  triggerSync,
  fetchMoodRecovery,
  fetchDivergence,
} from '@/api/fitness'
const mockFetchActivities = vi.mocked(fetchActivities)
const mockFetchDaily = vi.mocked(fetchDaily)
const mockFetchSyncStatus = vi.mocked(fetchSyncStatus)
const mockTriggerSync = vi.mocked(triggerSync)
const mockFetchMoodRecovery = vi.mocked(fetchMoodRecovery)
const mockFetchDivergence = vi.mocked(fetchDivergence)

function makeActivity(over: Partial<FitnessActivity> = {}): FitnessActivity {
  return {
    id: 1,
    user_id: 1,
    source: 'strava',
    source_id: 's1',
    activity_type: 'run',
    source_subtype: 'Run',
    start_time: '2026-05-09T07:00:00Z',
    local_date: '2026-05-09',
    duration_s: 1800,
    moving_time_s: 1800,
    distance_m: 5210,
    elevation_gain_m: 31,
    avg_hr_bpm: 154,
    max_hr_bpm: 178,
    avg_pace_s_per_km: 351,
    calories_kcal: 412,
    perceived_exertion: null,
    extras: {},
    raw_ref_id: 1,
    normalized_at: '2026-05-09T07:25:00Z',
    ...over,
  }
}

function makeDaily(over: Partial<FitnessDaily> = {}): FitnessDaily {
  return {
    id: 1,
    user_id: 1,
    source: 'garmin',
    local_date: '2026-05-09',
    sleep_score: 78,
    sleep_duration_s: 25200,
    sleep_efficiency_pct: 91,
    hrv_overnight_ms: 78,
    resting_hr_bpm: 41,
    body_battery_high: 72,
    body_battery_low: 18,
    stress_avg: 24,
    training_load_acute: 412,
    training_load_chronic: 388,
    training_readiness: 73,
    extras: {},
    raw_ref_ids: [1, 2, 3, 4, 5, 6],
    normalized_at: '2026-05-09T08:00:00Z',
    ...over,
  }
}

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

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: { template: '<div />' } },
    // F4 added a "Manage sync → /settings#fitness" link on /fitness.
    // Stub the settings route so vue-router's resolution doesn't warn.
    { path: '/settings', name: 'settings', component: { template: '<div />' } },
  ],
})

/**
 * Mount the view with the Strava feature flag seeded in the settings
 * store. Defaults to `true` so the pre-mothball assertions (Sync Strava
 * button, etc.) keep exercising the full UI; `null` leaves the store
 * unhydrated to exercise the fail-closed (flag unknown) default.
 */
function mountView(stravaEnabled: boolean | null = true) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (stravaEnabled !== null) {
    useSettingsStore().settings = makeServerSettingsWithStrava(stravaEnabled)
  }
  return mount(FitnessView, {
    global: { plugins: [router, pinia] },
  })
}

describe('FitnessView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()

    mockFetchActivities.mockResolvedValue({ items: [] })
    mockFetchDaily.mockResolvedValue({ items: [] })
    mockFetchSyncStatus.mockResolvedValue(statusOk())
    mockFetchMoodRecovery.mockResolvedValue({ rows: [] })
    mockFetchDivergence.mockResolvedValue({
      rows: [],
      summary: {
        likely_mental_fatigue: 0,
        hidden_physical_under_recovery: 0,
        congruent_fatigue: 0,
        congruent_ok: 0,
      },
    })
    trackJobSpy.mockClear()
    jobRef.value = undefined
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates the three data slices on mount', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mockFetchSyncStatus).toHaveBeenCalled()
    expect(mockFetchActivities).toHaveBeenCalled()
    expect(mockFetchDaily).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('links to Settings · Fitness for sync management', async () => {
    // F4 moved the sync panels into Settings#fitness; the /fitness page
    // now only links to them.
    const wrapper = mountView()
    await flushPromises()

    const link = wrapper.find('[data-testid="fitness-manage-sync-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toContain('/settings#fitness')
    expect(
      wrapper.find('[data-testid="fitness-source-card-strava"]').exists(),
    ).toBe(false)
    expect(
      wrapper.find('[data-testid="fitness-source-card-garmin"]').exists(),
    ).toBe(false)
    wrapper.unmount()
  })

  it('renders a fresh-setup hint pointing at the Garmin connect flow in Settings', async () => {
    mockFetchSyncStatus.mockResolvedValue({ strava: null, garmin: null })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="fitness-fresh-setup"]').exists()).toBe(
      true,
    )
    // The hint must direct users to the web connect flow, not the
    // (wrong even pre-mothball) `journal fitness-reauth-strava` CLI.
    expect(wrapper.text()).not.toContain('journal fitness-reauth-strava')
    const connectLink = wrapper.find(
      '[data-testid="fitness-fresh-setup-connect-link"]',
    )
    expect(connectLink.exists()).toBe(true)
    expect(connectLink.attributes('href')).toContain('/settings#fitness')
    expect(wrapper.text()).toContain('journal fitness-backfill')
    wrapper.unmount()
  })

  it('renders the empty-state row when no activities loaded', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="fitness-no-activities"]').exists()).toBe(
      true,
    )
    wrapper.unmount()
  })

  it('renders deduped activities, marking mirrored rows', async () => {
    mockFetchActivities.mockResolvedValue({
      items: [
        makeActivity({
          id: 1,
          source: 'strava',
          source_id: 's1',
          start_time: '2026-05-09T07:00:00Z',
          duration_s: 1800,
        }),
        makeActivity({
          id: 2,
          source: 'garmin',
          source_id: 'g1',
          start_time: '2026-05-09T07:00:30Z',
          duration_s: 1800,
        }),
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    const table = wrapper.find('[data-testid="fitness-recent-activities"]')
    // One representative row, body row count = 1.
    const rows = table.findAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('Strava')
    expect(rows[0].text()).toContain('+ 1 mirror')
    wrapper.unmount()
  })

  it('renders the activities-per-week chart canvas and the three daily-wellness canvases', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="fitness-weekly-chart"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="fitness-sleep-chart"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="fitness-hrv-chart"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="fitness-rhr-chart"]').exists()).toBe(
      true,
    )
    // Four chart instances created.
    expect(chartConstructorSpy).toHaveBeenCalledTimes(4)
    wrapper.unmount()
  })

  it('reload button re-triggers all three fetches', async () => {
    const wrapper = mountView()
    await flushPromises()

    mockFetchActivities.mockClear()
    mockFetchDaily.mockClear()
    mockFetchSyncStatus.mockClear()

    await wrapper.find('[data-testid="fitness-reload"]').trigger('click')
    await flushPromises()

    expect(mockFetchSyncStatus).toHaveBeenCalled()
    expect(mockFetchActivities).toHaveBeenCalled()
    expect(mockFetchDaily).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('destroys all chart instances on unmount', async () => {
    const wrapper = mountView()
    await flushPromises()
    wrapper.unmount()
    // 4 charts created → 4 destroys.
    expect(destroySpy).toHaveBeenCalledTimes(4)
  })

  it('formats activity duration over an hour as "Xh Ym"', async () => {
    mockFetchActivities.mockResolvedValue({
      items: [
        makeActivity({
          id: 1,
          source: 'strava',
          source_id: 's-long',
          duration_s: 5400, // 1h 30m
          distance_m: null,
        }),
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    const tableText = wrapper
      .find('[data-testid="fitness-recent-activities"]')
      .text()
    expect(tableText).toContain('1h 30m')
    // null distance renders as the dash character.
    expect(tableText).toContain('—')
    wrapper.unmount()
  })

  it('surfaces a status-load error inline', async () => {
    mockFetchSyncStatus.mockRejectedValue(new Error('status fail'))

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="fitness-status-error"]').text()).toBe(
      'status fail',
    )
    wrapper.unmount()
  })

  it('formats daily values into the sleep series with 3-day MA overlay', async () => {
    mockFetchDaily.mockResolvedValue({
      items: [
        makeDaily({ id: 1, local_date: '2026-05-08', sleep_score: 80 }),
        makeDaily({ id: 2, local_date: '2026-05-09', sleep_score: 78 }),
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    // F7: each daily-wellness chart has two datasets — index 0 is the
    // bold centred 3-day moving average, index 1 is the faded daily
    // series. Labels are deliberately short ("3-day avg" / "Daily")
    // because the panel header already states the metric (e.g.
    // "Sleep score"), so the tooltip only needs to disambiguate
    // within the chart. Find the sleep chart by its violet color
    // (#6366f1) — the labels are no longer unique across panels.
    const sleepCall = chartConstructorSpy.mock.calls.find((c) => {
      const datasets = (
        c[1] as {
          data: {
            datasets: Array<{ borderColor: string }>
          }
        }
      )?.data?.datasets
      return datasets?.[0]?.borderColor === '#6366f1'
    })
    expect(sleepCall).toBeDefined()
    const cfg = sleepCall![1] as {
      data: {
        labels: string[]
        datasets: Array<{ label: string; data: Array<number | null> }>
      }
    }
    expect(cfg.data.labels).toHaveLength(2)
    expect(cfg.data.datasets).toHaveLength(2)
    expect(cfg.data.datasets[0].label).toBe('3-day avg')
    expect(cfg.data.datasets[1].label).toBe('Daily')
    // Daily values land on dataset[1] verbatim.
    expect(cfg.data.datasets[1].data).toEqual([80, 78])
    // MA at the edges truncates to mean of available neighbours:
    // [80, 78] → MA at index 0 = mean(80, 78) = 79; index 1 = mean(80, 78) = 79.
    expect(cfg.data.datasets[0].data).toEqual([79, 79])
    wrapper.unmount()
  })

  // ── Item 1: Workouts-per-week Count ↔ Duration toggle ──────────────

  function weeklyChartConfig() {
    // The weekly chart is the only `type: 'bar'` chart constructed.
    const call = chartConstructorSpy.mock.calls.find(
      (c) => (c[1] as { type?: string })?.type === 'bar',
    )
    return call?.[1] as
      | {
          data: {
            datasets: Array<{ label: string; data: number[] }>
          }
          options: {
            scales: { y: { title?: { text?: string } } }
          }
        }
      | undefined
  }

  it('renames the weekly tile heading to "Workouts per week"', async () => {
    const wrapper = mountView()
    await flushPromises()
    const heading = wrapper.find('[data-testid="fitness-tile-weekly-distinct"]')
    expect(heading.text()).toContain('Workouts per week')
    expect(heading.text()).not.toContain('Distinct workouts per week')
    wrapper.unmount()
  })

  it('weekly chart shows counts in count mode and hours in duration mode', async () => {
    // Two runs in the same ISO week: 1800s + 3600s = 5400s = 1.5h total.
    mockFetchActivities.mockResolvedValue({
      items: [
        makeActivity({
          id: 1,
          source: 'strava',
          source_id: 's1',
          activity_type: 'run',
          start_time: '2026-05-04T07:00:00Z', // Monday
          duration_s: 1800,
        }),
        makeActivity({
          id: 2,
          source: 'strava',
          source_id: 's2',
          activity_type: 'run',
          start_time: '2026-05-06T07:00:00Z', // Wednesday, same week
          duration_s: 3600,
        }),
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    // Default = count: the run series should contain a bucket with 2.
    const countCfg = weeklyChartConfig()
    const runCount = countCfg!.data.datasets.find((d) => d.label === 'Run')!
    expect(Math.max(...runCount.data)).toBe(2)
    expect(countCfg!.options.scales.y.title).toBeUndefined()

    // Flip to duration: same series now sums to 1.5 hours in one bucket.
    chartConstructorSpy.mockClear()
    await wrapper
      .find('[data-testid="fitness-weekly-metric-duration"]')
      .trigger('click')
    await flushPromises()

    const durCfg = weeklyChartConfig()
    const runDur = durCfg!.data.datasets.find((d) => d.label === 'Run')!
    expect(Math.max(...runDur.data)).toBeCloseTo(1.5, 5)
    // Duration mode labels the y-axis in hours.
    expect(durCfg!.options.scales.y.title?.text).toBe('Hours')
    wrapper.unmount()
  })

  // ── Item 2: selectable moving-average window ───────────────────────

  function sleepChartConfig() {
    const call = chartConstructorSpy.mock.calls.find((c) => {
      const datasets = (
        c[1] as { data?: { datasets?: Array<{ borderColor?: string }> } }
      )?.data?.datasets
      return datasets?.[0]?.borderColor === '#6366f1'
    })
    return call?.[1] as
      | {
          data: {
            datasets: Array<{ label: string; data: Array<number | null> }>
          }
        }
      | undefined
  }

  it('re-renders the wellness charts with the chosen MA window label', async () => {
    mockFetchDaily.mockResolvedValue({
      items: [
        makeDaily({ id: 1, local_date: '2026-05-07', sleep_score: 70 }),
        makeDaily({ id: 2, local_date: '2026-05-08', sleep_score: 80 }),
        makeDaily({ id: 3, local_date: '2026-05-09', sleep_score: 90 }),
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    // Default window = 3.
    expect(sleepChartConfig()!.data.datasets[0].label).toBe('3-day avg')

    chartConstructorSpy.mockClear()
    await wrapper.find('[data-testid="fitness-ma-window-5"]').trigger('click')
    await flushPromises()

    const cfg = sleepChartConfig()!
    expect(cfg.data.datasets[0].label).toBe('5-day avg')
    // Window 5 over [70,80,90] at index 1 = mean(70,80,90) = 80.
    expect(cfg.data.datasets[0].data[1]).toBe(80)
    wrapper.unmount()
  })

  it('reads the persisted MA window from storage on mount', async () => {
    localStorage.setItem('fitness:maWindow', '7')
    mockFetchDaily.mockResolvedValue({
      items: [makeDaily({ id: 1, local_date: '2026-05-09', sleep_score: 70 })],
    })

    const wrapper = mountView()
    await flushPromises()

    expect(sleepChartConfig()!.data.datasets[0].label).toBe('7-day avg')
    expect(
      wrapper
        .find('[data-testid="fitness-ma-window-7"]')
        .attributes('aria-pressed'),
    ).toBe('true')
    wrapper.unmount()
  })

  // ── Item 3: on-page Garmin/Strava sync buttons ─────────────────────

  it('clicking Sync Garmin calls startSync and spins the button', async () => {
    mockTriggerSync.mockResolvedValue({ job_id: 'job-1', status: 'queued' })
    // Job stays running so the spinner persists after submit.
    jobRef.value = makeJob({ status: 'running' })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-testid="fitness-sync-garmin"]').trigger('click')
    await flushPromises()

    expect(mockTriggerSync).toHaveBeenCalledWith('garmin')
    expect(
      wrapper.find('[data-testid="fitness-sync-garmin-spinner"]').exists(),
    ).toBe(true)
    expect(
      wrapper
        .find('[data-testid="fitness-sync-garmin"]')
        .attributes('disabled'),
    ).toBeDefined()
    wrapper.unmount()
  })

  it('reloads all data when the sync job succeeds', async () => {
    mockTriggerSync.mockResolvedValue({ job_id: 'job-1', status: 'queued' })
    jobRef.value = makeJob({ status: 'running' })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-testid="fitness-sync-strava"]').trigger('click')
    await flushPromises()

    mockFetchActivities.mockClear()
    mockFetchDaily.mockClear()

    // Job transitions to succeeded — the watcher should fire reloadAll.
    jobRef.value = makeJob({ status: 'succeeded' })
    await flushPromises()

    expect(mockFetchActivities).toHaveBeenCalled()
    expect(mockFetchDaily).toHaveBeenCalled()
    // Spinner cleared after terminal.
    expect(
      wrapper.find('[data-testid="fitness-sync-strava-spinner"]').exists(),
    ).toBe(false)
    wrapper.unmount()
  })

  it('shows an inline error with a settings link when the sync job fails', async () => {
    mockTriggerSync.mockResolvedValue({ job_id: 'job-1', status: 'queued' })
    jobRef.value = makeJob({ status: 'running' })

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-testid="fitness-sync-garmin"]').trigger('click')
    await flushPromises()

    jobRef.value = makeJob({ status: 'failed', error_message: 'token expired' })
    await flushPromises()

    const err = wrapper.find('[data-testid="fitness-sync-garmin-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('token expired')
    const link = wrapper.find('[data-testid="fitness-sync-garmin-error-link"]')
    expect(link.attributes('href')).toContain('/settings#fitness')
    wrapper.unmount()
  })

  it('shows an inline error when sync submission fails', async () => {
    mockTriggerSync.mockRejectedValue(new Error('network down'))

    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-testid="fitness-sync-strava"]').trigger('click')
    await flushPromises()

    const err = wrapper.find('[data-testid="fitness-sync-strava-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('network down')
    // No spinner once submission resolved as a failure.
    expect(
      wrapper.find('[data-testid="fitness-sync-strava-spinner"]').exists(),
    ).toBe(false)
    wrapper.unmount()
  })

  // ── W2 (Strava mothball): flag-driven Strava UI ────────────────────

  it('shows both sync buttons and Strava-inclusive copy when strava_enabled is true', async () => {
    const wrapper = mountView(true)
    await flushPromises()

    expect(wrapper.find('[data-testid="fitness-sync-garmin"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="fitness-sync-strava"]').exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain(
      'Strava and Garmin sync status, weekly training, and Garmin daily recovery.',
    )
    expect(wrapper.text()).toContain('rows from both Strava and Garmin')
    wrapper.unmount()
  })

  it('hides the Sync Strava button and neutralises copy when strava_enabled is false', async () => {
    const wrapper = mountView(false)
    await flushPromises()

    expect(wrapper.find('[data-testid="fitness-sync-garmin"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="fitness-sync-strava"]').exists()).toBe(
      false,
    )
    expect(wrapper.text()).toContain(
      'Garmin sync status, weekly training, and daily recovery.',
    )
    expect(wrapper.text()).not.toContain('rows from both Strava and Garmin')
    expect(wrapper.text()).toContain('rows from multiple sources')
    wrapper.unmount()
  })

  it('still renders historical Strava rows with their source badge when the flag is off', async () => {
    mockFetchActivities.mockResolvedValue({
      items: [
        makeActivity({ id: 1, source: 'strava', source_id: 's1' }),
        makeActivity({
          id: 2,
          source: 'garmin',
          source_id: 'g1',
          start_time: '2026-05-09T07:00:30Z',
        }),
      ],
    })

    const wrapper = mountView(false)
    await flushPromises()

    // Dedup untouched: the Strava row wins the tie-break and renders
    // with its badge plus the Garmin mirror marker.
    const rows = wrapper
      .find('[data-testid="fitness-recent-activities"]')
      .findAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('Strava')
    expect(rows[0].text()).toContain('+ 1 mirror')
    wrapper.unmount()
  })

  it('hides the Sync Strava button while the flag is unknown (fail-closed)', async () => {
    const wrapper = mountView(null)
    await flushPromises()

    expect(wrapper.find('[data-testid="fitness-sync-garmin"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="fitness-sync-strava"]').exists()).toBe(
      false,
    )
    wrapper.unmount()
  })

  // T3: tile layout shell adoption.
  it('renders the fitness tile grid with the default tiles', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="fitness-tiles-grid"]').exists()).toBe(
      true,
    )
    // W6: the mood × recovery timeline tile is the first default tile.
    expect(
      wrapper.find('[data-testid="fitness-tile-mood-fitness"]').exists(),
    ).toBe(true)
    // Its component renders inside the tile (empty state with no data).
    expect(wrapper.find('[data-testid="mood-fitness-chart"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="fitness-tile-weekly-distinct"]').exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="fitness-tile-sleep"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="fitness-tile-hrv"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="fitness-tile-rhr"]').exists()).toBe(true)
    expect(
      wrapper.find('[data-testid="fitness-tile-recent-workouts"]').exists(),
    ).toBe(true)
    wrapper.unmount()
  })

  it('shows tile edit controls only after Edit layout is toggled on', async () => {
    const wrapper = mountView()
    await flushPromises()

    // Before edit mode: no edit controls visible.
    expect(wrapper.find('button[title="Move up"]').exists()).toBe(false)
    expect(wrapper.find('button[title="Hide chart"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tile-move-up-sleep"]').exists()).toBe(
      false,
    )

    await wrapper
      .find('[data-testid="fitness-edit-layout-toggle"]')
      .trigger('click')
    expect(
      wrapper.find('[data-testid="fitness-edit-layout-toggle"]').text(),
    ).toBe('Done editing')

    // Now controls are present per tile.
    expect(wrapper.find('button[title="Move up"]').exists()).toBe(true)
    expect(wrapper.find('button[title="Hide chart"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tile-move-up-sleep"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="tile-width-sleep"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('hides a fitness tile and shows the restore panel', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper
      .find('[data-testid="fitness-edit-layout-toggle"]')
      .trigger('click')

    await wrapper.find('[data-testid="tile-hide-sleep"]').trigger('click')
    expect(wrapper.find('[data-testid="fitness-tile-sleep"]').exists()).toBe(
      false,
    )
    expect(
      wrapper.find('[data-testid="fitness-hidden-tiles-panel"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="fitness-restore-tile-sleep"]').exists(),
    ).toBe(true)

    // Restore brings the tile back.
    await wrapper
      .find('[data-testid="fitness-restore-tile-sleep"]')
      .trigger('click')
    expect(wrapper.find('[data-testid="fitness-tile-sleep"]').exists()).toBe(
      true,
    )
    wrapper.unmount()
  })

  it('cycle-width on a tile rotates third → half → full → third', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper
      .find('[data-testid="fitness-edit-layout-toggle"]')
      .trigger('click')

    const btn = wrapper.find('[data-testid="tile-width-sleep"]')
    // Sleep defaults to 'third' → next state offered by the button is 'Half width'.
    expect(btn.attributes('title')).toBe('Half width')
    await btn.trigger('click')

    // Now sleep is 'half' → next offered is 'Full width'.
    expect(
      wrapper.find('[data-testid="tile-width-sleep"]').attributes('title'),
    ).toBe('Full width')
    await wrapper.find('[data-testid="tile-width-sleep"]').trigger('click')

    // 'full' → next is 'Third width'.
    expect(
      wrapper.find('[data-testid="tile-width-sleep"]').attributes('title'),
    ).toBe('Third width')
    wrapper.unmount()
  })
})
