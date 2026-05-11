import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import FitnessView from '../FitnessView.vue'
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
}))

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
} from '@/api/fitness'
const mockFetchActivities = vi.mocked(fetchActivities)
const mockFetchDaily = vi.mocked(fetchDaily)
const mockFetchSyncStatus = vi.mocked(fetchSyncStatus)
const mockTriggerSync = vi.mocked(triggerSync)

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

function mountView() {
  return mount(FitnessView, {
    global: { plugins: [router, createPinia()] },
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

  it('renders a fresh-setup hint when both sources are null', async () => {
    mockFetchSyncStatus.mockResolvedValue({ strava: null, garmin: null })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="fitness-fresh-setup"]').exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain('journal fitness-reauth-strava')
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

  it('formats daily values into the sleep series (sleep_score)', async () => {
    mockFetchDaily.mockResolvedValue({
      items: [
        makeDaily({ id: 1, local_date: '2026-05-08', sleep_score: 80 }),
        makeDaily({ id: 2, local_date: '2026-05-09', sleep_score: 78 }),
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    // Expect at least the sleep chart constructor call to have a labels array
    // matching local_date order.
    const sleepCall = chartConstructorSpy.mock.calls.find(
      (c) =>
        (c[1] as { data: { datasets: Array<{ label: string }> } })?.data
          ?.datasets?.[0]?.label === 'Sleep score',
    )
    expect(sleepCall).toBeDefined()
    const cfg = sleepCall![1] as {
      data: {
        labels: string[]
        datasets: Array<{ data: Array<number | null> }>
      }
    }
    expect(cfg.data.labels).toHaveLength(2)
    expect(cfg.data.datasets[0].data).toEqual([80, 78])
    wrapper.unmount()
  })
})
