import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

// Stub the color helpers in chartjs-config so the chart components
// don't try to read real CSS variables in the happy-dom environment
// (they're empty strings, which makes adjustColorOpacity throw).
// `buildLineChartOptions` stays real so the line charts construct the
// canonical options shape from the stubbed colors.
vi.mock('@/utils/chartjs-config', async () => {
  const actual = await vi.importActual<typeof import('@/utils/chartjs-config')>(
    '@/utils/chartjs-config',
  )
  return {
    ...actual,
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
  }
})

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
import { formatBinLabel } from '@/utils/binLabel'
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

  it('shows empty entity state when no entities found', async () => {
    setupWritingStats()
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-entity-empty"]').exists(),
    ).toBe(true)
  })
})

describe('DashboardView — calendar heatmap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()
    // The heatmap grid window is derived from `new Date()` (rolling
    // last_3_months fallback under happy-dom's zero element width), so the
    // March-2026 fixture dates below age out of the grid on a real clock.
    // Pin Date only — faking timers would break flushPromises().
    vi.useFakeTimers({ now: new Date('2026-03-15T12:00:00'), toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
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

describe('DashboardView — empty-bin filling (W22)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()
    // `fillBins` resolves a null `to` to "today" and the default range
    // (last_3_months) derives `from` from the clock, so pin Date to make
    // the generated axis deterministic. Noon UTC keeps the ISO date
    // stable across CI timezones. Date only — faking timers would break
    // flushPromises().
    vi.useFakeTimers({
      now: new Date('2026-03-16T12:00:00Z'),
      toFake: ['Date'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Every Monday from the default range start (2025-12-16 → aligned to
  // Monday 2025-12-15) through today (Monday 2026-03-16).
  const expectedMondays = [
    '2025-12-15',
    '2025-12-22',
    '2025-12-29',
    '2026-01-05',
    '2026-01-12',
    '2026-01-19',
    '2026-01-26',
    '2026-02-02',
    '2026-02-09',
    '2026-02-16',
    '2026-02-23',
    '2026-03-02',
    '2026-03-09',
    '2026-03-16',
  ]

  type LineChartConfig = {
    type?: string
    data: {
      labels: string[]
      datasets: Array<{ label?: string; data: number[] }>
    }
  }

  function findChartConfig(datasetLabel: string): LineChartConfig | undefined {
    const call = chartConstructorSpy.mock.calls.find((c) => {
      const cfg = c[1] as LineChartConfig
      return cfg?.data?.datasets?.some((d) => d.label === datasetLabel)
    })
    return call?.[1] as LineChartConfig | undefined
  }

  it('writing and word charts render sparse weekly bins on a contiguous zero-filled axis', async () => {
    // Two bins six weeks apart — the server omits the empty weeks
    // between them, and previously the chart did too.
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [
        { bin_start: '2026-01-05', entry_count: 3, total_words: 300 },
        { bin_start: '2026-02-16', entry_count: 3, total_words: 150 },
      ],
    })
    mountView()
    await flushPromises()

    // Writing/word charts format their x-labels via formatBinLabel
    // (e.g. "15 Dec"); the entity-trends chart below still uses raw ISO
    // period labels, so expectedMondays stays ISO and is mapped here.
    const expectedWeekLabels = expectedMondays.map((m) =>
      formatBinLabel(m, 'week'),
    )
    const writing = findChartConfig('Entries')
    expect(writing).toBeDefined()
    expect(writing!.data.labels).toEqual(expectedWeekLabels)
    const expectedCounts = expectedMondays.map((m) =>
      m === '2026-01-05' || m === '2026-02-16' ? 3 : 0,
    )
    expect(writing!.data.datasets[0].data).toEqual(expectedCounts)

    const words = findChartConfig('Words')
    expect(words).toBeDefined()
    expect(words!.data.labels).toEqual(expectedWeekLabels)
    const expectedWords = expectedMondays.map((m) =>
      m === '2026-01-05' ? 300 : m === '2026-02-16' ? 150 : 0,
    )
    expect(words!.data.datasets[0].data).toEqual(expectedWords)
  })

  it('entity trends chart zero-fills missing periods on the x-axis', async () => {
    mockFetch.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [
        { bin_start: '2026-01-05', entry_count: 3, total_words: 300 },
        { bin_start: '2026-02-16', entry_count: 3, total_words: 150 },
      ],
    })
    mockEntityTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'topic',
      entities: ['meditation'],
      bins: [
        { period: '2026-01-05', entity: 'meditation', mention_count: 5 },
        { period: '2026-02-16', entity: 'meditation', mention_count: 2 },
      ],
    })
    mountView()
    await flushPromises()

    const trends = findChartConfig('meditation')
    expect(trends).toBeDefined()
    expect(trends!.data.labels).toEqual(expectedMondays)
    const expectedMentions = expectedMondays.map((m) =>
      m === '2026-01-05' ? 5 : m === '2026-02-16' ? 2 : 0,
    )
    expect(trends!.data.datasets[0].data).toEqual(expectedMentions)
  })
})
