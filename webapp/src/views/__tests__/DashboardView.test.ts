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
    CategoryScale: class {},
    Filler: class {},
    Legend: class {},
    LinearScale: class {},
    LineController: class {},
    LineElement: class {},
    PointElement: class {},
    Tooltip: class {},
  }
})

import { fetchWritingStats } from '@/api/dashboard'
const mockFetch = vi.mocked(fetchWritingStats)

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
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
})

describe('DashboardView — mood chart', () => {
  // `enableAutoUnmount(beforeEach)` is already installed at the
  // top of the sibling describe block above; calling it again
  // here would register a second unmount hook and vitest
  // reports it as a duplicate-setup error. One call covers the
  // whole test file.

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
        },
        {
          period: '2026-03-02',
          dimension: 'agency',
          avg_score: 0.7,
          entry_count: 3,
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

  it('clicking a toggle hides that dimension and re-renders', async () => {
    const wrapper = await setupWithMoodData()
    // Chart.js called twice: once for writing + word (2 charts),
    // once for the mood chart.
    const callsBeforeToggle = chartConstructorSpy.mock.calls.length

    await wrapper
      .find('[data-testid="dashboard-mood-toggle-joy_sadness"]')
      .trigger('click')
    await flushPromises()

    // The mood chart was destroyed and recreated.
    expect(chartConstructorSpy.mock.calls.length).toBeGreaterThan(
      callsBeforeToggle,
    )
    // Toggle now shows line-through class.
    expect(
      wrapper
        .find('[data-testid="dashboard-mood-toggle-joy_sadness"]')
        .classes()
        .some((c) => c.includes('line-through')),
    ).toBe(true)
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

  it('range change triggers BOTH writing and mood reloads', async () => {
    const wrapper = await setupWithMoodData()
    const { fetchWritingStats, fetchMoodTrends } =
      await import('@/api/dashboard')
    vi.mocked(fetchWritingStats).mockClear()
    vi.mocked(fetchMoodTrends).mockClear()

    await wrapper
      .find('[data-testid="dashboard-range-last_6_months"]')
      .trigger('click')
    await flushPromises()

    expect(fetchWritingStats).toHaveBeenCalledTimes(1)
    expect(fetchMoodTrends).toHaveBeenCalledTimes(1)
  })

  it('bin change triggers BOTH writing and mood reloads', async () => {
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
