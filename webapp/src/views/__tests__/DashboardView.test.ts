import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../DashboardView.vue'

vi.mock('@/api/dashboard', () => ({
  fetchWritingStats: vi.fn(),
  fetchMoodDimensions: vi.fn().mockResolvedValue({ dimensions: [] }),
  fetchMoodTrends: vi.fn().mockResolvedValue({
    from: null,
    to: null,
    bin: 'week',
    bins: [],
  }),
  fetchCalendarHeatmap: vi.fn().mockResolvedValue({
    from: '2026-01-11',
    to: '2026-04-11',
    days: [],
  }),
  fetchEntityTrends: vi.fn().mockResolvedValue({
    from: null,
    to: null,
    bin: 'week',
    entity_type: 'topic',
    entities: [],
    bins: [],
  }),
  fetchMoodEntityCorrelation: vi.fn().mockResolvedValue({
    dimension: 'agency',
    from: null,
    to: null,
    entity_type: 'person',
    overall_avg: 0,
    items: [],
  }),
}))

vi.mock('@/api/insights', () => ({
  fetchMoodDimensions: vi.fn().mockResolvedValue({ dimensions: [] }),
  fetchMoodTrends: vi.fn().mockResolvedValue({
    from: null,
    to: null,
    bin: 'week',
    bins: [],
  }),
  fetchMoodDrilldown: vi
    .fn()
    .mockResolvedValue({ dimension: '', from: '', to: '', entries: [] }),
  fetchEntityDistribution: vi.fn().mockResolvedValue({
    type: 'topic',
    from: null,
    to: null,
    total: 0,
    items: [],
  }),
}))

vi.mock('@/api/jobs', () => ({
  triggerMoodBackfill: vi.fn(),
  getJob: vi.fn(),
}))

vi.mock('@/api/preferences', () => ({
  fetchPreferences: vi.fn().mockResolvedValue({ preferences: {} }),
  updatePreferences: vi.fn().mockResolvedValue({ preferences: {} }),
}))

// Stub chartjs-config so the view doesn't try to read real CSS
// variables in the happy-dom environment (they're empty strings,
// which makes adjustColorOpacity throw). The view only uses
// `getChartColors` for its return shape.
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
  chartAreaGradient: () => 'transparent',
}))

vi.mock('@/utils/mosaic', async () => {
  const actual =
    await vi.importActual<typeof import('@/utils/mosaic')>('@/utils/mosaic')
  return {
    ...actual,
    // Plain passthrough so the view's call to `adjustColorOpacity`
    // with a hex constant works without touching CSS vars.
  }
})

// Hoisted spies so they exist before the `vi.mock('chart.js', ...)`
// factory. `chartConstructorSpy` must be callable with `new`, so
// we wrap the spy in a `function` declaration that forwards to it.
// A plain `vi.fn().mockImplementation(...)` is not a constructor.
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

// Stub Chart.js's `Chart` constructor — a smoke-level assertion
// (was it called? how many times?) is sufficient for the view
// test; we don't need real canvas rendering. `Chart.register` and
// `Chart.defaults` are the static surface chartjs-config.ts uses
// at import time, so both are attached to the constructor stub.
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
    // Every chartjs-config.ts named import needs to exist so the
    // side-effect import doesn't throw. These are all registry
    // classes — the stubs just need to be non-undefined.
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
  fetchWritingStats,
  fetchCalendarHeatmap,
  fetchEntityTrends,
  fetchMoodEntityCorrelation,
} from '@/api/dashboard'
import { fetchEntityDistribution } from '@/api/insights'
import { useDashboardStore } from '@/stores/dashboard'
const mockFetch = vi.mocked(fetchWritingStats)
const mockEntityDist = vi.mocked(fetchEntityDistribution)
const mockCalendar = vi.mocked(fetchCalendarHeatmap)
const mockEntityTrends = vi.mocked(fetchEntityTrends)
vi.mocked(fetchMoodEntityCorrelation)

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    {
      path: '/entries/:id',
      name: 'entry-detail',
      component: { template: '<div />' },
    },
    {
      path: '/entries',
      name: 'entries',
      component: { template: '<div />' },
    },
  ],
})

function mountView() {
  return mount(DashboardView, {
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('DashboardView', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()
  })

  it('mounts and calls the API on load', async () => {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="dashboard-view"]').exists()).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('shows the explicit empty-state message below the threshold', async () => {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [{ bin_start: '2026-03-02', entry_count: 2, total_words: 120 }],
    })
    const wrapper = mountView()
    await flushPromises()
    const empty = wrapper.find('[data-testid="dashboard-empty"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('Not enough data yet')
    // Current count (2) is surfaced explicitly so the user knows
    // exactly why they're seeing the empty state.
    expect(
      wrapper.find('[data-testid="dashboard-entry-count-in-range"]').text(),
    ).toBe('2')
  })

  it('renders both chart cards when the threshold is met', async () => {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: Array.from({ length: 6 }, (_, i) => ({
        bin_start: `2026-03-${String(i * 7 + 2).padStart(2, '0')}`,
        entry_count: 1,
        total_words: 100,
      })),
    })
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-writing-chart-card"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-word-chart-card"]').exists(),
    ).toBe(true)
    // Chart.js was called twice (one per chart).
    expect(chartConstructorSpy).toHaveBeenCalledTimes(2)
  })

  it('renders the error banner when the store surfaces an error', async () => {
    mockFetch.mockRejectedValue(new Error('upstream down'))
    const wrapper = mountView()
    await flushPromises()
    const banner = wrapper.find('[data-testid="dashboard-error"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('upstream down')
  })

  it('clicking a range button refetches with the new range', async () => {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    const wrapper = mountView()
    await flushPromises()
    mockFetch.mockClear()

    await wrapper
      .find('[data-testid="dashboard-range-last_6_months"]')
      .trigger('click')
    await flushPromises()

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('clicking a bin button refetches with the new bin', async () => {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    const wrapper = mountView()
    await flushPromises()
    mockFetch.mockClear()

    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'month',
      bins: [],
    })
    await wrapper.find('[data-testid="dashboard-bin-month"]').trigger('click')
    await flushPromises()

    const call = mockFetch.mock.calls[0][0]
    expect(call?.bin).toBe('month')
  })

  it('all four bin options are rendered', async () => {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    const wrapper = mountView()
    await flushPromises()
    for (const bin of ['week', 'month', 'quarter', 'year']) {
      expect(
        wrapper.find(`[data-testid="dashboard-bin-${bin}"]`).exists(),
      ).toBe(true)
    }
  })

  it('all five range options are rendered', async () => {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    const wrapper = mountView()
    await flushPromises()
    for (const r of [
      'last_1_month',
      'last_3_months',
      'last_6_months',
      'last_1_year',
      'all',
    ]) {
      expect(
        wrapper.find(`[data-testid="dashboard-range-${r}"]`).exists(),
      ).toBe(true)
    }
  })

  it('active range and bin are visually marked via aria-pressed', async () => {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    const wrapper = mountView()
    await flushPromises()
    // Default: last_3_months + week.
    expect(
      wrapper
        .find('[data-testid="dashboard-range-last_3_months"]')
        .attributes('aria-pressed'),
    ).toBe('true')
    expect(
      wrapper
        .find('[data-testid="dashboard-bin-week"]')
        .attributes('aria-pressed'),
    ).toBe('true')
  })

  it('chart cards are torn down when the user drops below threshold', async () => {
    // First load: above threshold — charts rendered.
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: Array.from({ length: 6 }, (_, i) => ({
        bin_start: `2026-03-${String(i * 7 + 2).padStart(2, '0')}`,
        entry_count: 1,
        total_words: 100,
      })),
    })
    const wrapper = mountView()
    await flushPromises()
    expect(chartConstructorSpy).toHaveBeenCalledTimes(2)

    // Second load: now returns a below-threshold response.
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [{ bin_start: '2026-03-02', entry_count: 1, total_words: 100 }],
    })
    await wrapper
      .find('[data-testid="dashboard-range-last_1_month"]')
      .trigger('click')
    await flushPromises()

    // Previous chart instances destroyed.
    expect(destroySpy).toHaveBeenCalled()
    // Empty state now shown.
    expect(wrapper.find('[data-testid="dashboard-empty"]').exists()).toBe(true)
  })

  it('has a sticky filter bar', async () => {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    const wrapper = mountView()
    await flushPromises()
    const filters = wrapper.find('[data-testid="dashboard-filters"]')
    expect(filters.exists()).toBe(true)
    expect(filters.classes()).toContain('sticky')
  })
})

describe('DashboardView — mood chart', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()
  })

  const fakeDimensions = [
    {
      name: 'joy_sadness',
      positive_pole: 'joy',
      negative_pole: 'sadness',
      scale_type: 'bipolar' as const,
      score_min: -1.0,
      score_max: 1.0,
      notes: '...',
    },
    {
      name: 'agency',
      positive_pole: 'agency',
      negative_pole: 'apathy',
      scale_type: 'unipolar' as const,
      score_min: 0.0,
      score_max: 1.0,
      notes: '...',
    },
  ]

  const manyWritingBins = Array.from({ length: 6 }, (_, i) => ({
    bin_start: `2026-03-${String(i * 7 + 2).padStart(2, '0')}`,
    entry_count: 1,
    total_words: 100,
  }))

  async function setupWithMoodData() {
    const { fetchWritingStats, fetchMoodDimensions, fetchMoodTrends } =
      await import('@/api/dashboard')
    vi.mocked(fetchWritingStats).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: manyWritingBins,
    })
    vi.mocked(fetchMoodDimensions).mockResolvedValue({
      dimensions: fakeDimensions,
    })
    vi.mocked(fetchMoodTrends).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [
        {
          period: '2026-03-02',
          dimension: 'joy_sadness',
          avg_score: 0.4,
          entry_count: 3,
          score_min: 0.2,
          score_max: 0.6,
        },
        {
          period: '2026-03-02',
          dimension: 'agency',
          avg_score: 0.7,
          entry_count: 3,
          score_min: 0.5,
          score_max: 0.9,
        },
      ],
    })
    const wrapper = mountView()
    await flushPromises()
    return wrapper
  }

  it('renders the mood chart card when the server has dimensions', async () => {
    const wrapper = await setupWithMoodData()
    expect(
      wrapper.find('[data-testid="dashboard-mood-chart-card"]').exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="dashboard-mood-chart"]').exists()).toBe(
      true,
    )
  })

  it('hides the mood chart card when scoring is disabled on the server', async () => {
    const { fetchWritingStats, fetchMoodDimensions } =
      await import('@/api/dashboard')
    vi.mocked(fetchWritingStats).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: manyWritingBins,
    })
    vi.mocked(fetchMoodDimensions).mockResolvedValue({ dimensions: [] })
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-mood-chart-card"]').exists(),
    ).toBe(false)
  })

  it('renders a toggle per dimension with the scale badge', async () => {
    const wrapper = await setupWithMoodData()
    expect(
      wrapper
        .find('[data-testid="dashboard-mood-toggle-joy_sadness"]')
        .exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-mood-toggle-agency"]').exists(),
    ).toBe(true)
    // Bipolar facet shows ±1, unipolar shows 0..1.
    const joyText = wrapper
      .find('[data-testid="dashboard-mood-toggle-joy_sadness"]')
      .text()
    const agencyText = wrapper
      .find('[data-testid="dashboard-mood-toggle-agency"]')
      .text()
    expect(joyText).toContain('±1')
    expect(agencyText).toContain('0..1')
  })

  it('clicking a toggle flips that dimension only and re-renders', async () => {
    const wrapper = await setupWithMoodData()
    const callsBeforeToggle = chartConstructorSpy.mock.calls.length

    // Default selection is the affect-axes group: joy_sadness visible,
    // agency dimmed.
    const dimmedClass = (testid: string): boolean =>
      wrapper
        .find(`[data-testid="${testid}"]`)
        .classes()
        .some((c) => c.includes('opacity-40'))
    expect(dimmedClass('dashboard-mood-toggle-joy_sadness')).toBe(false)
    expect(dimmedClass('dashboard-mood-toggle-agency')).toBe(true)

    // Click agency → it becomes visible; joy_sadness unchanged.
    await wrapper
      .find('[data-testid="dashboard-mood-toggle-agency"]')
      .trigger('click')
    await flushPromises()

    expect(chartConstructorSpy.mock.calls.length).toBeGreaterThan(
      callsBeforeToggle,
    )
    expect(dimmedClass('dashboard-mood-toggle-agency')).toBe(false)
    expect(dimmedClass('dashboard-mood-toggle-joy_sadness')).toBe(false)

    // Click agency again → it becomes hidden; joy_sadness still unchanged.
    await wrapper
      .find('[data-testid="dashboard-mood-toggle-agency"]')
      .trigger('click')
    await flushPromises()
    expect(dimmedClass('dashboard-mood-toggle-agency')).toBe(true)
    expect(dimmedClass('dashboard-mood-toggle-joy_sadness')).toBe(false)
  })

  it('"All" button clears the selection and shows every dimension', async () => {
    const wrapper = await setupWithMoodData()
    const dimmedClass = (testid: string): boolean =>
      wrapper
        .find(`[data-testid="${testid}"]`)
        .classes()
        .some((c) => c.includes('opacity-40'))

    // Default selects the affect-axes group, so agency starts dimmed.
    expect(dimmedClass('dashboard-mood-toggle-agency')).toBe(true)

    // Click "All" → selection clears → every pill bright (no dimming).
    await wrapper
      .find('[data-testid="dashboard-mood-show-all"]')
      .trigger('click')
    await flushPromises()
    expect(dimmedClass('dashboard-mood-toggle-joy_sadness')).toBe(false)
    expect(dimmedClass('dashboard-mood-toggle-agency')).toBe(false)
  })

  it('"None" button no longer exists — drop confirmed', async () => {
    const wrapper = await setupWithMoodData()
    expect(
      wrapper.find('[data-testid="dashboard-mood-hide-all"]').exists(),
    ).toBe(false)
  })

  it('"All" is disabled when selection is empty, enabled when not', async () => {
    const wrapper = await setupWithMoodData()
    const allBtn = wrapper.find('[data-testid="dashboard-mood-show-all"]')
    // Default selection has the affect-axes group → All is enabled.
    expect(allBtn.attributes('disabled')).toBeUndefined()
    // Click All to clear → now disabled.
    await allBtn.trigger('click')
    await flushPromises()
    expect(allBtn.attributes('disabled')).toBeDefined()
  })

  it('Bug A regression: deselecting the only selected pill does NOT show empty state', async () => {
    const wrapper = await setupWithMoodData()
    // Default selection has only joy_sadness (the only affect-group member
    // present in the test fixture).
    // Click joy_sadness → selection becomes empty → "show all" semantics kick in.
    await wrapper
      .find('[data-testid="dashboard-mood-toggle-joy_sadness"]')
      .trigger('click')
    await flushPromises()
    // The all-hidden empty state must not appear (it was removed).
    expect(
      wrapper.find('[data-testid="dashboard-mood-all-hidden"]').exists(),
    ).toBe(false)
    // The chart container is still visible.
    expect(
      wrapper.find('[data-testid="dashboard-mood-chart-container"]').exists(),
    ).toBe(true)
  })

  it('renders one row per group label in toml order', async () => {
    const wrapper = await setupWithMoodData()
    // The two fakeDimensions in the test fixture are joy_sadness (affect)
    // and agency (needs) — so we expect two group rows.
    const affect = wrapper.find('[data-testid="dashboard-mood-group-affect"]')
    const needs = wrapper.find('[data-testid="dashboard-mood-group-needs"]')
    expect(affect.exists()).toBe(true)
    expect(needs.exists()).toBe(true)
    expect(affect.text()).toContain('Affect axes')
    expect(needs.text()).toContain('Psychological needs')
  })

  it('clicking a group label adds all its members to the selection when none are selected', async () => {
    const wrapper = await setupWithMoodData()
    // Clear selection first so every group starts in "none" state.
    await wrapper
      .find('[data-testid="dashboard-mood-show-all"]')
      .trigger('click')
    await flushPromises()
    // Click affect group → joy_sadness should now be the only selected.
    await wrapper
      .find('[data-testid="dashboard-mood-group-affect"]')
      .trigger('click')
    await flushPromises()
    const dimmed = (testid: string): boolean =>
      wrapper
        .find(`[data-testid="${testid}"]`)
        .classes()
        .some((c) => c.includes('opacity-40'))
    // joy_sadness selected → not dimmed; agency not selected → dimmed.
    expect(dimmed('dashboard-mood-toggle-joy_sadness')).toBe(false)
    expect(dimmed('dashboard-mood-toggle-agency')).toBe(true)
  })

  it('clicking a group label a second time removes its members from the selection', async () => {
    const wrapper = await setupWithMoodData()
    // Default: joy_sadness (affect group) selected. Click affect group →
    // removes joy_sadness.
    await wrapper
      .find('[data-testid="dashboard-mood-group-affect"]')
      .trigger('click')
    await flushPromises()
    // Selection is now empty → empty-selection semantics: every pill bright.
    const dimmed = (testid: string): boolean =>
      wrapper
        .find(`[data-testid="${testid}"]`)
        .classes()
        .some((c) => c.includes('opacity-40'))
    expect(dimmed('dashboard-mood-toggle-agency')).toBe(false)
    expect(dimmed('dashboard-mood-toggle-joy_sadness')).toBe(false)
  })

  it('shows the empty state when mood_trends returns no bins', async () => {
    const { fetchWritingStats, fetchMoodDimensions, fetchMoodTrends } =
      await import('@/api/dashboard')
    vi.mocked(fetchWritingStats).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: manyWritingBins,
    })
    vi.mocked(fetchMoodDimensions).mockResolvedValue({
      dimensions: fakeDimensions,
    })
    vi.mocked(fetchMoodTrends).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="dashboard-mood-empty"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="dashboard-mood-chart"]').exists()).toBe(
      false,
    )
  })

  it('shows the mood error banner on mood_trends failure', async () => {
    const { fetchWritingStats, fetchMoodDimensions, fetchMoodTrends } =
      await import('@/api/dashboard')
    vi.mocked(fetchWritingStats).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: manyWritingBins,
    })
    vi.mocked(fetchMoodDimensions).mockResolvedValue({
      dimensions: fakeDimensions,
    })
    vi.mocked(fetchMoodTrends).mockRejectedValue(
      new Error('mood upstream down'),
    )
    const wrapper = mountView()
    await flushPromises()

    const banner = wrapper.find('[data-testid="dashboard-mood-error"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('mood upstream down')
  })

  it('range change triggers writing, mood, and entity reloads', async () => {
    const wrapper = await setupWithMoodData()
    const { fetchWritingStats, fetchMoodTrends } =
      await import('@/api/dashboard')
    vi.mocked(fetchWritingStats).mockClear()
    vi.mocked(fetchMoodTrends).mockClear()
    mockEntityDist.mockClear()

    await wrapper
      .find('[data-testid="dashboard-range-last_6_months"]')
      .trigger('click')
    await flushPromises()

    expect(fetchWritingStats).toHaveBeenCalledTimes(1)
    expect(fetchMoodTrends).toHaveBeenCalledTimes(1)
    expect(mockEntityDist).toHaveBeenCalledTimes(1)
  })

  it('bin change triggers writing and mood reloads', async () => {
    const wrapper = await setupWithMoodData()
    const { fetchWritingStats, fetchMoodTrends } =
      await import('@/api/dashboard')
    vi.mocked(fetchWritingStats).mockClear()
    vi.mocked(fetchMoodTrends).mockClear()

    await wrapper.find('[data-testid="dashboard-bin-month"]').trigger('click')
    await flushPromises()

    expect(fetchWritingStats).toHaveBeenCalledTimes(1)
    expect(fetchMoodTrends).toHaveBeenCalledTimes(1)
    const moodCall = vi.mocked(fetchMoodTrends).mock.calls[0][0]
    expect(moodCall?.bin).toBe('month')
  })

  it('mood chart y-axis is fixed to [-1, +1]', async () => {
    await setupWithMoodData()

    // The mood chart is the last Chart instance created (after writing + word charts).
    const calls = chartConstructorSpy.mock.calls
    const lastConfig = calls[calls.length - 1][1] as {
      options: { scales: { y: { min: number; max: number } } }
    }
    expect(lastConfig.options.scales.y.min).toBe(-1)
    expect(lastConfig.options.scales.y.max).toBe(1)
  })

  it('mood chart y-axis stays [-1, +1] after toggling a single series', async () => {
    const wrapper = await setupWithMoodData()
    chartConstructorSpy.mockClear()

    // Toggle joy_sadness on (a bipolar series with positive values ~0.4)
    await wrapper
      .find('[data-testid="dashboard-mood-toggle-joy_sadness"]')
      .trigger('click')
    await flushPromises()

    // The chart was recreated — verify the new instance still has fixed bounds
    const calls = chartConstructorSpy.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const lastConfig = calls[calls.length - 1][1] as {
      options: { scales: { y: { min: number; max: number } } }
    }
    expect(lastConfig.options.scales.y.min).toBe(-1)
    expect(lastConfig.options.scales.y.max).toBe(1)
  })

  it('mood chart animates on first render but not after toggling', async () => {
    const wrapper = await setupWithMoodData()

    // First render: animation should be undefined (Chart.js default = animate).
    // Inspect the *first* chart construction, since the post-flush watcher
    // legitimately re-renders after the explicit onMounted call.
    const firstCalls = chartConstructorSpy.mock.calls
    const firstConfig = firstCalls[0][1] as {
      options: { animation?: false }
    }
    expect(firstConfig.options.animation).toBeUndefined()

    chartConstructorSpy.mockClear()

    // Toggle a dimension to trigger a re-render
    await wrapper
      .find('[data-testid="dashboard-mood-toggle-joy_sadness"]')
      .trigger('click')
    await flushPromises()

    // Subsequent render: animation should be disabled
    const secondCalls = chartConstructorSpy.mock.calls
    expect(secondCalls.length).toBeGreaterThan(0)
    const secondConfig = secondCalls[secondCalls.length - 1][1] as {
      options: { animation?: false }
    }
    expect(secondConfig.options.animation).toBe(false)
  })

  it('renders the drill-down panel when store has drill-down state', async () => {
    const wrapper = await setupWithMoodData()

    // No drill-down initially
    expect(wrapper.find('[data-testid="dashboard-drilldown"]').exists()).toBe(
      false,
    )

    // Simulate drill-down via store (clicking chart points is hard to
    // test through Chart.js stubs, so we set store state directly)
    const { useDashboardStore } = await import('@/stores/dashboard')
    const store = useDashboardStore()
    const { fetchMoodDrilldown } = await import('@/api/insights')
    vi.mocked(fetchMoodDrilldown).mockResolvedValue({
      dimension: 'joy_sadness',
      from: '2026-03-02',
      to: '2026-03-08',
      entries: [
        {
          entry_id: 1,
          entry_date: '2026-03-02',
          score: 0.5,
          confidence: 0.9,
          rationale: 'Positive day',
        },
      ],
    })
    await store.loadDrillDown('2026-03-02', 'joy_sadness')
    await flushPromises()

    // Drill-down panel should now be visible
    const panel = wrapper.find('[data-testid="dashboard-drilldown"]')
    expect(panel.exists()).toBe(true)
    // Header renders the dimension's display label (positive_pole),
    // not the snake_case `name`.
    expect(panel.text()).toContain('joy')
    expect(panel.text()).not.toContain('joy_sadness')
    expect(panel.text()).toContain('Positive day')

    // Close button clears drill-down
    await wrapper
      .find('[data-testid="dashboard-drilldown-close"]')
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="dashboard-drilldown"]').exists()).toBe(
      false,
    )
  })
})

describe('DashboardView — entity distribution', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()
  })

  const manyWritingBins = Array.from({ length: 6 }, (_, i) => ({
    bin_start: `2026-03-${String(i * 7 + 2).padStart(2, '0')}`,
    entry_count: 1,
    total_words: 100,
  }))

  function setupWritingStats() {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: manyWritingBins,
    })
  }

  it('renders entity type tabs', async () => {
    setupWritingStats()
    const wrapper = mountView()
    await flushPromises()
    for (const type of [
      'topic',
      'activity',
      'place',
      'person',
      'organization',
      'other',
    ]) {
      expect(
        wrapper.find(`[data-testid="dashboard-entity-tab-${type}"]`).exists(),
      ).toBe(true)
    }
  })

  it('shows empty entity state when no entities found', async () => {
    setupWritingStats()
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-entity-empty"]').exists(),
    ).toBe(true)
  })

  it('renders entity legend capped at 8 items', async () => {
    setupWritingStats()
    const items = Array.from({ length: 12 }, (_, i) => ({
      canonical_name: `entity-${i}`,
      entity_type: 'topic',
      mention_count: 20 - i,
    }))
    mockEntityDist.mockResolvedValue({
      type: 'topic',
      from: null,
      to: null,
      total: 12,
      items,
    })
    const wrapper = mountView()
    await flushPromises()

    const rows = wrapper.findAll(
      '[data-testid="dashboard-entity-legend"] tbody tr',
    )
    expect(rows).toHaveLength(8)
    expect(
      wrapper.find('[data-testid="dashboard-entity-legend-toggle"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-entity-legend-toggle"]').text(),
    ).toContain('Show 4 more')
  })

  it('expands and collapses the entity legend', async () => {
    setupWritingStats()
    const items = Array.from({ length: 12 }, (_, i) => ({
      canonical_name: `entity-${i}`,
      entity_type: 'topic',
      mention_count: 20 - i,
    }))
    mockEntityDist.mockResolvedValue({
      type: 'topic',
      from: null,
      to: null,
      total: 12,
      items,
    })
    const wrapper = mountView()
    await flushPromises()

    // Expand
    await wrapper
      .find('[data-testid="dashboard-entity-legend-toggle"]')
      .trigger('click')
    await flushPromises()
    expect(
      wrapper.findAll('[data-testid="dashboard-entity-legend"] tbody tr'),
    ).toHaveLength(12)
    expect(
      wrapper.find('[data-testid="dashboard-entity-legend-toggle"]').text(),
    ).toContain('Show fewer')

    // Collapse
    await wrapper
      .find('[data-testid="dashboard-entity-legend-toggle"]')
      .trigger('click')
    await flushPromises()
    expect(
      wrapper.findAll('[data-testid="dashboard-entity-legend"] tbody tr'),
    ).toHaveLength(8)
  })

  it('does not show toggle when 8 or fewer items', async () => {
    setupWritingStats()
    mockEntityDist.mockResolvedValue({
      type: 'topic',
      from: null,
      to: null,
      total: 3,
      items: [
        {
          canonical_name: 'meditation',
          entity_type: 'topic',
          mention_count: 14,
        },
        { canonical_name: 'running', entity_type: 'topic', mention_count: 9 },
        { canonical_name: 'sleep', entity_type: 'topic', mention_count: 5 },
      ],
    })
    const wrapper = mountView()
    await flushPromises()

    expect(
      wrapper.findAll('[data-testid="dashboard-entity-legend"] tbody tr'),
    ).toHaveLength(3)
    expect(
      wrapper.find('[data-testid="dashboard-entity-legend-toggle"]').exists(),
    ).toBe(false)
  })

  it('clicking entity type tab changes the type', async () => {
    setupWritingStats()
    mockEntityDist.mockResolvedValue({
      type: 'activity',
      from: null,
      to: null,
      total: 0,
      items: [],
    })
    const wrapper = mountView()
    await flushPromises()
    mockEntityDist.mockClear()

    await wrapper
      .find('[data-testid="dashboard-entity-tab-activity"]')
      .trigger('click')
    await flushPromises()

    expect(mockEntityDist).toHaveBeenCalledTimes(1)
  })

  it('shows entity error state', async () => {
    setupWritingStats()
    mockEntityDist.mockRejectedValue(new Error('entity fail'))
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-entity-error"]').exists(),
    ).toBe(true)
  })
})

describe('DashboardView — calendar heatmap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()
  })

  const manyWritingBins = Array.from({ length: 6 }, (_, i) => ({
    bin_start: `2026-03-${String(i * 7 + 2).padStart(2, '0')}`,
    entry_count: 1,
    total_words: 100,
  }))

  function setupWritingStats() {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: manyWritingBins,
    })
  }

  it('renders the calendar section when data is present', async () => {
    setupWritingStats()
    mockCalendar.mockResolvedValue({
      from: '2026-01-11',
      to: '2026-04-11',
      days: [
        { date: '2026-03-02', entry_count: 2, total_words: 400 },
        { date: '2026-03-09', entry_count: 1, total_words: 150 },
      ],
    })
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-calendar-section"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-calendar-content"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-calendar-legend"]').exists(),
    ).toBe(true)
  })

  it('shows empty state when calendar has no data', async () => {
    setupWritingStats()
    mockCalendar.mockResolvedValue({
      from: '2026-01-11',
      to: '2026-04-11',
      days: [],
    })
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-calendar-empty"]').exists(),
    ).toBe(true)
  })

  it('shows error state when calendar fails', async () => {
    setupWritingStats()
    mockCalendar.mockRejectedValue(new Error('calendar fail'))
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-calendar-error"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-calendar-error"]').text(),
    ).toContain('calendar fail')
  })

  it('colors cells by word count using quantile thresholds', async () => {
    setupWritingStats()
    // Provide a spread of word counts so quantile buckets are exercised:
    // p25 ≈ 100, p50 ≈ 300, p75 ≈ 800
    mockCalendar.mockResolvedValue({
      from: '2026-03-02',
      to: '2026-03-09',
      days: [
        { date: '2026-03-02', entry_count: 1, total_words: 50 },
        { date: '2026-03-03', entry_count: 1, total_words: 100 },
        { date: '2026-03-04', entry_count: 1, total_words: 300 },
        { date: '2026-03-05', entry_count: 1, total_words: 800 },
        { date: '2026-03-06', entry_count: 1, total_words: 2000 },
        { date: '2026-03-07', entry_count: 0, total_words: 0 },
      ],
    })
    const wrapper = mountView()
    await flushPromises()
    // Zero-word cell gets the gray bg class
    const zeroCell = wrapper.find(
      '[data-testid="dashboard-calendar-cell-2026-03-07"]',
    )
    expect(zeroCell.exists()).toBe(true)
    expect(zeroCell.classes()).toContain('bg-gray-100')
    // Non-zero cells exist and have violet color classes
    const lowCell = wrapper.find(
      '[data-testid="dashboard-calendar-cell-2026-03-02"]',
    )
    expect(lowCell.exists()).toBe(true)
    expect(
      lowCell.classes().some((c: string) => c.startsWith('bg-violet')),
    ).toBe(true)
    // High word-count cell (outlier)
    const highCell = wrapper.find(
      '[data-testid="dashboard-calendar-cell-2026-03-06"]',
    )
    expect(highCell.exists()).toBe(true)
    expect(
      highCell.classes().some((c: string) => c.startsWith('bg-violet')),
    ).toBe(true)
  })

  it('shows word count in tooltip text', async () => {
    setupWritingStats()
    mockCalendar.mockResolvedValue({
      from: '2026-03-02',
      to: '2026-03-04',
      days: [{ date: '2026-03-02', entry_count: 1, total_words: 1234 }],
    })
    const wrapper = mountView()
    await flushPromises()
    const cell = wrapper.find(
      '[data-testid="dashboard-calendar-cell-2026-03-02"]',
    )
    expect(cell.exists()).toBe(true)
    const title = cell.attributes('title') ?? ''
    expect(title).toContain('1,234 words')
    expect(title).toContain('1 entry')
  })
})

describe('DashboardView — entity trends', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()
  })

  const manyWritingBins = Array.from({ length: 6 }, (_, i) => ({
    bin_start: `2026-03-${String(i * 7 + 2).padStart(2, '0')}`,
    entry_count: 1,
    total_words: 100,
  }))

  function setupWritingStats() {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: manyWritingBins,
    })
  }

  it('renders the entity trends section with entity type tabs', async () => {
    setupWritingStats()
    mockEntityTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'topic',
      entities: ['meditation', 'running'],
      bins: [
        { period: '2026-03-02', entity: 'meditation', mention_count: 5 },
        { period: '2026-03-02', entity: 'running', mention_count: 3 },
      ],
    })
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-entity-trends-section"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-entity-trends-content"]').exists(),
    ).toBe(true)
    // Has entity type tabs
    for (const type of ['topic', 'activity', 'place', 'person']) {
      expect(
        wrapper
          .find(`[data-testid="dashboard-entity-trends-tab-${type}"]`)
          .exists(),
      ).toBe(true)
    }
  })

  it('shows empty state when entity trends has no data', async () => {
    setupWritingStats()
    mockEntityTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'topic',
      entities: [],
      bins: [],
    })
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-entity-trends-empty"]').exists(),
    ).toBe(true)
  })

  it('shows error state when entity trends fails', async () => {
    setupWritingStats()
    mockEntityTrends.mockRejectedValue(new Error('trends fail'))
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-entity-trends-error"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-entity-trends-error"]').text(),
    ).toContain('trends fail')
  })

  it('clicking an entity trends tab triggers reload', async () => {
    setupWritingStats()
    const wrapper = mountView()
    await flushPromises()
    mockEntityTrends.mockClear()

    mockEntityTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'activity',
      entities: [],
      bins: [],
    })
    await wrapper
      .find('[data-testid="dashboard-entity-trends-tab-activity"]')
      .trigger('click')
    await flushPromises()

    expect(mockEntityTrends).toHaveBeenCalledTimes(1)
  })

  // Regression: hovering a stacked bar segment used to surface the wrong
  // dataset (often a zero-value one) because the global tooltip defaults
  // are `mode: 'nearest'` + `intersect: false`. The stacked Topic Trends
  // chart needs to opt into `interaction: { mode: 'index', intersect:
  // false }` and filter zero-valued items out of the tooltip body.
  it('stacked entity trends chart uses index mode and filters zero values', async () => {
    setupWritingStats()
    mockEntityTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'topic',
      entities: ['agentic', 'faith', 'mcp'],
      bins: [
        // 'mcp' has no row for 2026-04-06 — pivots to 0, the
        // exact case that misled the old tooltip.
        { period: '2026-04-06', entity: 'agentic', mention_count: 3 },
        { period: '2026-04-06', entity: 'faith', mention_count: 1 },
      ],
    })
    mountView()
    await flushPromises()

    // Find the constructor call that built the stacked bar chart.
    const stackedCall = chartConstructorSpy.mock.calls.find((call) => {
      const cfg = call[1] as {
        type?: string
        options?: { scales?: { x?: { stacked?: boolean } } }
      }
      return cfg?.type === 'bar' && cfg?.options?.scales?.x?.stacked === true
    })
    expect(stackedCall).toBeDefined()
    const opts = (
      stackedCall![1] as {
        options: {
          interaction?: { mode?: string; intersect?: boolean }
          plugins?: {
            tooltip?: {
              filter?: (item: { parsed: { y: number } }) => boolean
            }
          }
        }
      }
    ).options

    // 1. `mode: 'index'` makes hover hit-testing pick the column,
    //    not the nearest dataset anchor — so cursor position
    //    inside a segment maps to that column's stack.
    expect(opts.interaction?.mode).toBe('index')
    expect(opts.interaction?.intersect).toBe(false)

    // 2. The tooltip `filter` skips zero-valued entries so the
    //    body only lists segments actually drawn in the column.
    const filter = opts.plugins?.tooltip?.filter
    expect(typeof filter).toBe('function')
    expect(filter!({ parsed: { y: 0 } })).toBe(false)
    expect(filter!({ parsed: { y: 1 } })).toBe(true)
  })
})

describe('DashboardView — mood-entity correlation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()
  })

  const fakeDimensions = [
    {
      name: 'joy_sadness',
      positive_pole: 'joy',
      negative_pole: 'sadness',
      scale_type: 'bipolar' as const,
      score_min: -1.0,
      score_max: 1.0,
      notes: '...',
    },
    {
      name: 'agency',
      positive_pole: 'agency',
      negative_pole: 'apathy',
      scale_type: 'unipolar' as const,
      score_min: 0.0,
      score_max: 1.0,
      notes: '...',
    },
  ]

  const manyWritingBins = Array.from({ length: 6 }, (_, i) => ({
    bin_start: `2026-03-${String(i * 7 + 2).padStart(2, '0')}`,
    entry_count: 1,
    total_words: 100,
  }))

  async function setupWithMoodAndCorrelation() {
    const {
      fetchWritingStats,
      fetchMoodDimensions,
      fetchMoodTrends,
      fetchMoodEntityCorrelation,
    } = await import('@/api/dashboard')
    vi.mocked(fetchWritingStats).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: manyWritingBins,
    })
    vi.mocked(fetchMoodDimensions).mockResolvedValue({
      dimensions: fakeDimensions,
    })
    vi.mocked(fetchMoodTrends).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [
        {
          period: '2026-03-02',
          dimension: 'agency',
          avg_score: 0.7,
          entry_count: 3,
          score_min: 0.5,
          score_max: 0.9,
        },
      ],
    })
    vi.mocked(fetchMoodEntityCorrelation).mockResolvedValue({
      dimension: 'agency',
      from: null,
      to: null,
      entity_type: 'person',
      overall_avg: 0.45,
      items: [
        {
          entity: 'Alice',
          entity_type: 'person',
          avg_score: 0.6,
          entry_count: 5,
        },
        {
          entity: 'Bob',
          entity_type: 'person',
          avg_score: 0.3,
          entry_count: 3,
        },
      ],
    })
    const wrapper = mountView()
    await flushPromises()
    return wrapper
  }

  it('renders mood correlation section when mood scoring is enabled and data is present', async () => {
    const wrapper = await setupWithMoodAndCorrelation()
    expect(
      wrapper
        .find('[data-testid="dashboard-mood-correlation-section"]')
        .exists(),
    ).toBe(true)
    expect(
      wrapper
        .find('[data-testid="dashboard-mood-correlation-content"]')
        .exists(),
    ).toBe(true)
  })

  it('hides mood correlation section when mood scoring is disabled', async () => {
    const { fetchWritingStats, fetchMoodDimensions } =
      await import('@/api/dashboard')
    vi.mocked(fetchWritingStats).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: manyWritingBins,
    })
    vi.mocked(fetchMoodDimensions).mockResolvedValue({ dimensions: [] })
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper
        .find('[data-testid="dashboard-mood-correlation-section"]')
        .exists(),
    ).toBe(false)
  })

  it('shows empty state when mood correlation returns no items', async () => {
    const {
      fetchWritingStats,
      fetchMoodDimensions,
      fetchMoodTrends,
      fetchMoodEntityCorrelation,
    } = await import('@/api/dashboard')
    vi.mocked(fetchWritingStats).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: manyWritingBins,
    })
    vi.mocked(fetchMoodDimensions).mockResolvedValue({
      dimensions: fakeDimensions,
    })
    vi.mocked(fetchMoodTrends).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    vi.mocked(fetchMoodEntityCorrelation).mockResolvedValue({
      dimension: 'agency',
      from: null,
      to: null,
      entity_type: 'person',
      overall_avg: 0,
      items: [],
    })
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-mood-correlation-empty"]').exists(),
    ).toBe(true)
  })

  it('shows error state when mood correlation fails', async () => {
    const {
      fetchWritingStats,
      fetchMoodDimensions,
      fetchMoodTrends,
      fetchMoodEntityCorrelation,
    } = await import('@/api/dashboard')
    vi.mocked(fetchWritingStats).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: manyWritingBins,
    })
    vi.mocked(fetchMoodDimensions).mockResolvedValue({
      dimensions: fakeDimensions,
    })
    vi.mocked(fetchMoodTrends).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    vi.mocked(fetchMoodEntityCorrelation).mockRejectedValue(
      new Error('correlation fail'),
    )
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-mood-correlation-error"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-mood-correlation-error"]').text(),
    ).toContain('correlation fail')
  })
})

describe('DashboardView — tile layout editing', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()
  })

  const manyBins = Array.from({ length: 6 }, (_, i) => ({
    bin_start: `2026-03-${String(i * 7 + 2).padStart(2, '0')}`,
    entry_count: 1,
    total_words: 100,
  }))

  function setupMocks() {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: manyBins,
    })
  }

  it('shows the edit layout button', async () => {
    setupMocks()
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-edit-layout-toggle"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-edit-layout-toggle"]').text(),
    ).toBe('Edit layout')
  })

  it('toggles edit mode and shows tile controls', async () => {
    setupMocks()
    const wrapper = mountView()
    await flushPromises()

    // No move/hide buttons before edit mode
    expect(wrapper.find('button[title="Move up"]').exists()).toBe(false)
    expect(wrapper.find('button[title="Hide chart"]').exists()).toBe(false)

    // Enter edit mode
    await wrapper
      .find('[data-testid="dashboard-edit-layout-toggle"]')
      .trigger('click')

    expect(
      wrapper.find('[data-testid="dashboard-edit-layout-toggle"]').text(),
    ).toBe('Done editing')
    // Now controls should be visible
    expect(wrapper.find('button[title="Move up"]').exists()).toBe(true)
    expect(wrapper.find('button[title="Move down"]').exists()).toBe(true)
    expect(wrapper.find('button[title="Hide chart"]').exists()).toBe(true)
  })

  it('hides a tile and shows the restore panel', async () => {
    setupMocks()
    const wrapper = mountView()
    await flushPromises()

    // Enter edit mode
    await wrapper
      .find('[data-testid="dashboard-edit-layout-toggle"]')
      .trigger('click')

    // Both chart cards should be visible
    expect(
      wrapper.find('[data-testid="dashboard-writing-chart-card"]').exists(),
    ).toBe(true)

    // Hide the writing chart via its hide button
    const writingCard = wrapper.find(
      '[data-testid="dashboard-writing-chart-card"]',
    )
    await writingCard.find('button[title="Hide chart"]').trigger('click')

    // Writing chart should be gone
    expect(
      wrapper.find('[data-testid="dashboard-writing-chart-card"]').exists(),
    ).toBe(false)

    // Hidden tiles panel should appear with a restore button
    expect(
      wrapper.find('[data-testid="dashboard-hidden-tiles-panel"]').exists(),
    ).toBe(true)
    expect(
      wrapper
        .find('[data-testid="dashboard-restore-tile-writing-frequency"]')
        .exists(),
    ).toBe(true)
  })

  it('restores a hidden tile', async () => {
    setupMocks()
    const wrapper = mountView()
    await flushPromises()

    // Enter edit mode and hide writing chart
    await wrapper
      .find('[data-testid="dashboard-edit-layout-toggle"]')
      .trigger('click')
    const writingCard = wrapper.find(
      '[data-testid="dashboard-writing-chart-card"]',
    )
    await writingCard.find('button[title="Hide chart"]').trigger('click')

    // Restore it
    await wrapper
      .find('[data-testid="dashboard-restore-tile-writing-frequency"]')
      .trigger('click')

    // Should be back
    expect(
      wrapper.find('[data-testid="dashboard-writing-chart-card"]').exists(),
    ).toBe(true)
    // Hidden tiles panel should be gone (no more hidden tiles)
    expect(
      wrapper.find('[data-testid="dashboard-hidden-tiles-panel"]').exists(),
    ).toBe(false)
  })

  it('reset layout button restores all tiles', async () => {
    setupMocks()
    const wrapper = mountView()
    await flushPromises()

    // Enter edit mode and hide two tiles
    await wrapper
      .find('[data-testid="dashboard-edit-layout-toggle"]')
      .trigger('click')

    // Hide writing chart
    let card = wrapper.find('[data-testid="dashboard-writing-chart-card"]')
    await card.find('button[title="Hide chart"]').trigger('click')

    // Hide word chart
    card = wrapper.find('[data-testid="dashboard-word-chart-card"]')
    await card.find('button[title="Hide chart"]').trigger('click')

    // Both should be gone
    expect(
      wrapper.find('[data-testid="dashboard-writing-chart-card"]').exists(),
    ).toBe(false)
    expect(
      wrapper.find('[data-testid="dashboard-word-chart-card"]').exists(),
    ).toBe(false)

    // Click reset
    await wrapper
      .find('[data-testid="dashboard-reset-layout"]')
      .trigger('click')

    // Both should be back
    expect(
      wrapper.find('[data-testid="dashboard-writing-chart-card"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-word-chart-card"]').exists(),
    ).toBe(true)
  })

  it('hidden tiles panel is not visible outside edit mode', async () => {
    setupMocks()
    const wrapper = mountView()
    await flushPromises()

    // Enter edit mode and hide a tile
    await wrapper
      .find('[data-testid="dashboard-edit-layout-toggle"]')
      .trigger('click')
    const card = wrapper.find('[data-testid="dashboard-writing-chart-card"]')
    await card.find('button[title="Hide chart"]').trigger('click')

    // Exit edit mode
    await wrapper
      .find('[data-testid="dashboard-edit-layout-toggle"]')
      .trigger('click')

    // Hidden tiles panel should NOT be visible outside edit mode
    expect(
      wrapper.find('[data-testid="dashboard-hidden-tiles-panel"]').exists(),
    ).toBe(false)
    // But the tile should still be hidden
    expect(
      wrapper.find('[data-testid="dashboard-writing-chart-card"]').exists(),
    ).toBe(false)
  })

  it('shows width toggle buttons in edit mode', async () => {
    setupMocks()
    const wrapper = mountView()
    await flushPromises()

    // No width buttons before edit mode
    expect(
      wrapper.find('[data-testid="tile-width-writing-frequency"]').exists(),
    ).toBe(false)

    // Enter edit mode
    await wrapper
      .find('[data-testid="dashboard-edit-layout-toggle"]')
      .trigger('click')

    // Width button should now be visible
    expect(
      wrapper.find('[data-testid="tile-width-writing-frequency"]').exists(),
    ).toBe(true)
  })

  it('clicking width toggle changes tile span', async () => {
    setupMocks()
    const wrapper = mountView()
    await flushPromises()

    const store = useDashboardStore()

    // writing-frequency defaults to span 1 (half width)
    expect(store.getTileSpan('writing-frequency')).toBe(1)

    // Enter edit mode
    await wrapper
      .find('[data-testid="dashboard-edit-layout-toggle"]')
      .trigger('click')

    // Click width toggle → should set to full width (span 2)
    await wrapper
      .find('[data-testid="tile-width-writing-frequency"]')
      .trigger('click')
    expect(store.getTileSpan('writing-frequency')).toBe(2)

    // Click again → should toggle back to half width (span 1)
    await wrapper
      .find('[data-testid="tile-width-writing-frequency"]')
      .trigger('click')
    expect(store.getTileSpan('writing-frequency')).toBe(1)
  })

  it('width toggle button title reflects the target state', async () => {
    setupMocks()
    const wrapper = mountView()
    await flushPromises()

    // Enter edit mode
    await wrapper
      .find('[data-testid="dashboard-edit-layout-toggle"]')
      .trigger('click')

    // writing-frequency is half-width by default → button should offer "Full width"
    const btn = wrapper.find('[data-testid="tile-width-writing-frequency"]')
    expect(btn.attributes('title')).toBe('Full width')

    // Click to expand
    await btn.trigger('click')
    await wrapper.vm.$nextTick()

    // Now it's full-width → button should offer "Half width"
    expect(
      wrapper
        .find('[data-testid="tile-width-writing-frequency"]')
        .attributes('title'),
    ).toBe('Half width')
  })
})
