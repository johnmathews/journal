import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Chart.js + chartjs-config are stubbed the same way the dashboard specs
// do it — we assert on the constructor config, not real canvas pixels.
vi.mock(
  'chart.js',
  async () =>
    (await import('@/components/dashboard/__tests__/chart-test-utils'))
      .chartJsMockModule,
)
vi.mock('@/utils/chartjs-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/chartjs-config')>()
  return (
    await import('@/components/dashboard/__tests__/chart-test-utils')
  ).withStubbedChartColors(actual)
})

// The store's loadLayout()/persist hit the preferences API on other code
// paths; this component doesn't touch them, but the store module imports
// them, so keep the api layer inert.
vi.mock('@/api/preferences', () => ({
  fetchPreferences: vi.fn().mockResolvedValue({ preferences: {} }),
  updatePreferences: vi.fn().mockResolvedValue({ preferences: {} }),
}))
vi.mock('@/api/fitness', () => ({
  fetchActivities: vi.fn(),
  fetchDaily: vi.fn(),
  fetchSyncStatus: vi.fn(),
  triggerSync: vi.fn(),
  fetchMoodRecovery: vi.fn(),
  fetchDivergence: vi.fn(),
}))

import MoodFitnessChart from '../MoodFitnessChart.vue'
import { useFitnessStore } from '@/stores/fitness'
import { chartConstructorSpy } from '@/components/dashboard/__tests__/chart-test-utils'
import type { MoodRecoveryRow, DivergenceRow } from '@/types/fitness'

function makeMoodRow(over: Partial<MoodRecoveryRow> = {}): MoodRecoveryRow {
  return {
    local_date: '2026-05-09',
    training_load_acute: 412,
    training_readiness: 73,
    hrv_overnight_ms: 78,
    physical_fatigue: 0.4,
    mental_fatigue: 0.2,
    ...over,
  }
}

function makeDivRow(over: Partial<DivergenceRow> = {}): DivergenceRow {
  return {
    local_date: '2026-05-09',
    subjective_tired_z: 1.0,
    physical_fatigue: 0.4,
    mental_fatigue: 0.2,
    recovery_z: 0.5,
    hrv_z: 0.5,
    resting_hr_z: -0.2,
    sleep_z: 0.3,
    readiness_z: 0.6,
    acwr: 1.1,
    acwr_z: 0.4,
    quadrant: null,
    n_signals: 4,
    sufficient: true,
    ...over,
  }
}

describe('MoodFitnessChart', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    localStorage.clear()
  })

  it('builds a dual-axis chart with a training-load line + two fatigue lines', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useFitnessStore()
    store.moodRecovery = [
      makeMoodRow({ local_date: '2026-05-08', physical_fatigue: 0.4 }),
      makeMoodRow({ local_date: '2026-05-09', physical_fatigue: 0.1 }),
    ]

    const wrapper = mount(MoodFitnessChart, {
      global: { plugins: [pinia] },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(chartConstructorSpy).toHaveBeenCalled()
    const config = chartConstructorSpy.mock.calls.at(-1)![1] as {
      data: {
        datasets: Array<{
          label: string
          yAxisID: string
          data: Array<number | null>
          pointRadius: number
          cubicInterpolationMode?: string
        }>
      }
      options: { scales: Record<string, { position?: string }> }
    }
    const datasets = config.data.datasets
    expect(datasets).toHaveLength(3)

    // Dataset 0 = training load on the left axis.
    expect(datasets[0].yAxisID).toBe('y')
    expect(datasets[0].label).toBe('Training load (acute)')

    // Datasets 1 & 2 = the two fatigue facets on the right axis, and they
    // use the display-inverted "fresh" labels + scores (up = good).
    expect(datasets[1].yAxisID).toBe('y1')
    expect(datasets[2].yAxisID).toBe('y1')
    expect(datasets[1].label).toContain('fresh')
    expect(datasets[2].label).toContain('fresh')
    // Freshness is smoothed with the default 3-day centred MA before
    // plotting. Row freshness = [0.6, 0.9] (physical_fatigue 0.4 → 0.6,
    // 0.1 → 0.9); the centred window at index 0 truncates to [0.6, 0.9],
    // so the plotted value is their mean, 0.75.
    expect(datasets[1].data[0]).toBeCloseTo(0.75)

    // All three series are lines only (no resting point dots) and use
    // monotone cubic interpolation so they join smoothly without the
    // default-bezier overshoot on spiky daily data.
    for (const ds of datasets) {
      expect(ds.pointRadius).toBe(0)
      expect(ds.cubicInterpolationMode).toBe('monotone')
    }

    // Dual axes: left + right.
    expect(config.options.scales.y.position).toBe('left')
    expect(config.options.scales.y1.position).toBe('right')

    wrapper.unmount()
  })

  it('smooths its lines with the maWindow prop from the shared control', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useFitnessStore()
    store.moodRecovery = [
      makeMoodRow({ local_date: '2026-05-08', physical_fatigue: 0.4 }),
      makeMoodRow({ local_date: '2026-05-09', physical_fatigue: 0.1 }),
    ]

    // maWindow=1 → identity smoothing, so the first plotted freshness is
    // the raw inverted score 0.6 (not the 0.75 the 3-day default yields).
    const wrapper = mount(MoodFitnessChart, {
      props: { maWindow: 1 },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    const config = chartConstructorSpy.mock.calls.at(-1)![1] as {
      data: { datasets: Array<{ data: Array<number | null> }> }
    }
    expect(config.data.datasets[1].data[0]).toBeCloseTo(0.6)

    // Bumping the window to 3 re-renders with the smoothed value.
    chartConstructorSpy.mockClear()
    await wrapper.setProps({ maWindow: 3 })
    await flushPromises()
    await wrapper.vm.$nextTick()

    const smoothed = chartConstructorSpy.mock.calls.at(-1)![1] as {
      data: { datasets: Array<{ data: Array<number | null> }> }
    }
    expect(smoothed.data.datasets[1].data[0]).toBeCloseTo(0.75)

    wrapper.unmount()
  })

  it('lists the two flagged quadrants with human labels + summary counts', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useFitnessStore()
    store.moodRecovery = [makeMoodRow()]
    store.divergence = [
      makeDivRow({
        local_date: '2026-05-09',
        quadrant: 'likely_mental_fatigue',
      }),
      makeDivRow({
        local_date: '2026-05-08',
        quadrant: 'hidden_physical_under_recovery',
      }),
      // A congruent day should NOT surface as a flagged row.
      makeDivRow({ local_date: '2026-05-07', quadrant: 'congruent_ok' }),
    ]
    store.divergenceSummary = {
      likely_mental_fatigue: 1,
      hidden_physical_under_recovery: 1,
      congruent_fatigue: 0,
      congruent_ok: 4,
    }

    const wrapper = mount(MoodFitnessChart, {
      global: { plugins: [pinia] },
    })
    await flushPromises()

    const rows = wrapper.findAll('[data-testid="mood-fitness-divergence-row"]')
    expect(rows).toHaveLength(2)

    const text = wrapper.text()
    expect(text).toContain('likely mental fatigue')
    expect(text).toContain('possible hidden physical under-recovery')

    // Summary chips render all four quadrant counts.
    const summary = wrapper.find('[data-testid="mood-fitness-summary"]')
    expect(summary.exists()).toBe(true)
    expect(
      wrapper.find('[data-testid="mood-fitness-summary-congruent_ok"]').text(),
    ).toContain('4')

    wrapper.unmount()
  })

  it('renders the chart on cold load when data arrives after mount', async () => {
    // Regression: FitnessView mounts this component, then loads data
    // asynchronously. The canvas lives in the v-else (only present once
    // hasData is true), so the render watcher must be flush:'post' or it
    // no-ops before the canvas exists and the chart stays blank.
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useFitnessStore()

    const wrapper = mount(MoodFitnessChart, {
      global: { plugins: [pinia] },
    })
    await flushPromises()
    // Mounted with no data → empty state, no chart yet.
    expect(chartConstructorSpy).not.toHaveBeenCalled()

    // Data resolves after mount.
    store.moodRecovery = [
      makeMoodRow({ local_date: '2026-05-08' }),
      makeMoodRow({ local_date: '2026-05-09' }),
    ]
    await flushPromises()
    await wrapper.vm.$nextTick()

    // The chart must now render (fails without flush:'post').
    expect(chartConstructorSpy).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="mood-fitness-canvas"]').exists()).toBe(
      true,
    )

    wrapper.unmount()
  })

  it('renders a graceful empty state (no chart) when there are no rows', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useFitnessStore() // empty moodRecovery by default

    const wrapper = mount(MoodFitnessChart, {
      global: { plugins: [pinia] },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="mood-fitness-empty"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="mood-fitness-canvas"]').exists()).toBe(
      false,
    )
    expect(wrapper.text()).toContain(
      'Mood × recovery needs journal entries and Garmin wellness data',
    )
    // No chart constructed when there's no data.
    expect(chartConstructorSpy).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
