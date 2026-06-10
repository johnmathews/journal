import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import MoodTrendsChart from '../MoodTrendsChart.vue'
import { useDashboardStore } from '@/stores/dashboard'

vi.mock(
  'chart.js',
  async () => (await import('./chart-test-utils')).chartJsMockModule,
)
vi.mock('@/utils/chartjs-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/chartjs-config')>()
  return (await import('./chart-test-utils')).withStubbedChartColors(actual)
})

vi.mock('@/api/dashboard', () => ({
  fetchMoodDimensions: vi.fn().mockResolvedValue({ dimensions: [] }),
  fetchMoodTrends: vi.fn().mockResolvedValue({
    from: null,
    to: null,
    bin: 'week',
    bins: [],
  }),
}))

vi.mock('@/api/insights', () => ({
  fetchMoodDrilldown: vi
    .fn()
    .mockResolvedValue({ dimension: '', from: '', to: '', entries: [] }),
}))

import { chartConstructorSpy, destroySpy } from './chart-test-utils'
import { fetchMoodDimensions, fetchMoodTrends } from '@/api/dashboard'
import { fetchMoodDrilldown } from '@/api/insights'

// Harness mirrors the prop/event wiring `DashboardView.vue` gives the
// component, so the store keeps owning selection/drill-down state and
// the assertions moved here from the view test stay unchanged.
const Harness = defineComponent({
  components: { MoodTrendsChart },
  setup() {
    const store = useDashboardStore()
    return { store }
  },
  template: `
    <MoodTrendsChart
      :dimensions="store.moodDimensions"
      :bins="store.moodBins"
      :selected-dimensions="store.selectedMoodDimensions"
      :is-dimension-visible="store.isMoodDimensionVisible"
      :group-selection-state="store.moodGroupSelectionState"
      :range="store.range"
      :bin="store.bin"
      range-phrase="over the last 3 months"
      :loading="store.moodLoading"
      :has-loaded="store.moodHasLoaded"
      :error="store.moodError"
      :drill-period="store.drillPeriod"
      :drill-dimension="store.drillDimension"
      :drill-entries="store.drillEntries"
      :drill-loading="store.drillLoading"
      :drill-error="store.drillError"
      @toggle-dimension="store.toggleMoodDimension"
      @toggle-group="store.toggleMoodGroup"
      @drill-down="(p, d) => store.loadDrillDown(p, d)"
      @clear-drill-down="store.clearDrillDown()"
    />`,
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

describe('MoodTrendsChart', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()
  })

  async function setupWithMoodData() {
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
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    await store.loadMoodTrends()
    const wrapper = mount(Harness)
    await flushPromises()
    return wrapper
  }

  it('renders the chart canvas when the server has dimensions', async () => {
    const wrapper = await setupWithMoodData()
    expect(wrapper.find('[data-testid="dashboard-mood-chart"]').exists()).toBe(
      true,
    )
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

  it('"All" button no longer exists — drop confirmed', async () => {
    const wrapper = await setupWithMoodData()
    expect(
      wrapper.find('[data-testid="dashboard-mood-show-all"]').exists(),
    ).toBe(false)
  })

  it('"None" button no longer exists — drop confirmed', async () => {
    const wrapper = await setupWithMoodData()
    expect(
      wrapper.find('[data-testid="dashboard-mood-hide-all"]').exists(),
    ).toBe(false)
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
    // (The show-all UI button was removed; reach into the store directly.)
    const store = useDashboardStore()
    store.showAllMoodDimensions()
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
    vi.mocked(fetchMoodDimensions).mockResolvedValue({
      dimensions: fakeDimensions,
    })
    vi.mocked(fetchMoodTrends).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [],
    })
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    await store.loadMoodTrends()
    const wrapper = mount(Harness)
    await flushPromises()

    expect(wrapper.find('[data-testid="dashboard-mood-empty"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="dashboard-mood-chart"]').exists()).toBe(
      false,
    )
  })

  it('shows the mood error banner on mood_trends failure', async () => {
    vi.mocked(fetchMoodDimensions).mockResolvedValue({
      dimensions: fakeDimensions,
    })
    vi.mocked(fetchMoodTrends).mockRejectedValue(
      new Error('mood upstream down'),
    )
    const store = useDashboardStore()
    await store.loadMoodDimensions()
    await store.loadMoodTrends()
    const wrapper = mount(Harness)
    await flushPromises()

    const banner = wrapper.find('[data-testid="dashboard-mood-error"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('mood upstream down')
  })

  it('mood chart y-axis is fixed to [-1, +1]', async () => {
    await setupWithMoodData()

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

  it('destroys the Chart instance on unmount', async () => {
    const wrapper = await setupWithMoodData()
    destroySpy.mockClear()
    wrapper.unmount()
    expect(destroySpy).toHaveBeenCalled()
  })

  it('renders the drill-down panel when store has drill-down state', async () => {
    const wrapper = await setupWithMoodData()

    // No drill-down initially
    expect(wrapper.find('[data-testid="dashboard-drilldown"]').exists()).toBe(
      false,
    )

    // Simulate drill-down via store (clicking chart points is hard to
    // test through Chart.js stubs, so we set store state directly)
    const store = useDashboardStore()
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
