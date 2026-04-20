import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import InsightsView from '../InsightsView.vue'

vi.mock('@/api/insights', () => ({
  fetchMoodDimensions: vi.fn().mockResolvedValue({ dimensions: [] }),
  fetchMoodTrends: vi.fn().mockResolvedValue({
    from: null,
    to: null,
    bin: 'week',
    bins: [],
  }),
  fetchMoodDrilldown: vi.fn().mockResolvedValue({
    dimension: 'agency',
    from: '2026-04-14',
    to: '2026-04-20',
    entries: [],
  }),
  fetchEntityDistribution: vi.fn().mockResolvedValue({
    type: 'topic',
    from: null,
    to: null,
    total: 0,
    items: [],
  }),
}))

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
  return { ...actual }
})

const { ChartStub } = vi.hoisted(() => {
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
    ChartStub,
  }
})

vi.mock('chart.js', () => ({
  Chart: ChartStub,
}))

import {
  fetchMoodDimensions,
  fetchMoodTrends,
  fetchEntityDistribution,
} from '@/api/insights'

enableAutoUnmount(afterEach)

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/insights', name: 'insights', component: InsightsView },
    {
      path: '/entries/:id',
      name: 'entry-detail',
      component: { template: '<div/>' },
      props: true,
    },
  ],
})

function mountView() {
  return mount(InsightsView, {
    global: { plugins: [router] },
  })
}

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

describe('InsightsView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    await router.push('/insights')
    await router.isReady()
  })

  it('renders the page title and filter controls', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="insights-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="insights-filters"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="insights-range"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="insights-bin"]').exists()).toBe(true)
  })

  it('shows entity section even without mood data', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="insights-entity-section"]').exists(),
    ).toBe(true)
  })

  it('shows mood section when scoring is enabled', async () => {
    vi.mocked(fetchMoodDimensions).mockResolvedValue({
      dimensions: fakeDimensions,
    })
    vi.mocked(fetchMoodTrends).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [
        {
          period: '2026-04-14',
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
    expect(wrapper.find('[data-testid="insights-mood-section"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="insights-mood-toggles"]').exists()).toBe(
      true,
    )
  })

  it('renders entity type tabs', async () => {
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
        wrapper.find(`[data-testid="insights-entity-tab-${type}"]`).exists(),
      ).toBe(true)
    }
  })

  it('shows empty entity state when no entities found', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="insights-entity-empty"]').exists()).toBe(
      true,
    )
  })

  it('renders entity legend when data is present', async () => {
    vi.mocked(fetchEntityDistribution).mockResolvedValue({
      type: 'topic',
      from: null,
      to: null,
      total: 2,
      items: [
        {
          canonical_name: 'meditation',
          entity_type: 'topic',
          mention_count: 14,
        },
        { canonical_name: 'running', entity_type: 'topic', mention_count: 9 },
      ],
    })
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="insights-entity-legend"]').exists(),
    ).toBe(true)
    expect(
      wrapper.findAll('[data-testid="insights-entity-legend"] tbody tr'),
    ).toHaveLength(2)
  })

  it('shows mood empty state when no mood data in range', async () => {
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
    expect(wrapper.find('[data-testid="insights-mood-empty"]').exists()).toBe(
      true,
    )
  })

  it('shows mood error state', async () => {
    vi.mocked(fetchMoodDimensions).mockResolvedValue({
      dimensions: fakeDimensions,
    })
    vi.mocked(fetchMoodTrends).mockRejectedValue(new Error('server down'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="insights-mood-error"]').exists()).toBe(
      true,
    )
  })

  it('shows entity error state', async () => {
    vi.mocked(fetchEntityDistribution).mockRejectedValue(new Error('fail'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="insights-entity-error"]').exists()).toBe(
      true,
    )
  })

  it('hides mood section when scoring is disabled', async () => {
    vi.mocked(fetchMoodDimensions).mockResolvedValue({ dimensions: [] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="insights-mood-section"]').exists()).toBe(
      false,
    )
  })

  it('shows drill-down panel when drillPeriod is set', async () => {
    vi.mocked(fetchMoodDimensions).mockResolvedValue({
      dimensions: fakeDimensions,
    })
    vi.mocked(fetchMoodTrends).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [
        {
          period: '2026-04-14',
          dimension: 'agency',
          avg_score: 0.7,
          entry_count: 3,
          score_min: 0.5,
          score_max: 0.9,
        },
      ],
    })
    const { fetchMoodDrilldown } = await import('@/api/insights')
    vi.mocked(fetchMoodDrilldown).mockResolvedValue({
      dimension: 'agency',
      from: '2026-04-14',
      to: '2026-04-20',
      entries: [
        {
          entry_id: 42,
          entry_date: '2026-04-15',
          score: 0.72,
          confidence: 0.88,
          rationale: 'Took initiative on project.',
        },
        {
          entry_id: 43,
          entry_date: '2026-04-16',
          score: -0.3,
          confidence: null,
          rationale: null,
        },
      ],
    })
    const wrapper = mountView()
    await flushPromises()

    // Trigger drill-down via store
    const { useInsightsStore } = await import('@/stores/insights')
    const store = useInsightsStore()
    await store.loadDrillDown('2026-04-14', 'agency')
    await flushPromises()

    expect(wrapper.find('[data-testid="insights-drilldown"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="insights-drilldown-table"]').exists(),
    ).toBe(true)
    const rows = wrapper.findAll(
      '[data-testid="insights-drilldown-table"] tbody tr',
    )
    expect(rows).toHaveLength(2)

    // Close drill-down
    await wrapper
      .find('[data-testid="insights-drilldown-close"]')
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="insights-drilldown"]').exists()).toBe(
      false,
    )
  })

  it('clicking a range button changes the filter', async () => {
    const wrapper = mountView()
    await flushPromises()
    const btn = wrapper.find('[data-testid="insights-range-last_1_year"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    const { useInsightsStore } = await import('@/stores/insights')
    const store = useInsightsStore()
    expect(store.range).toBe('last_1_year')
  })

  it('clicking a bin button changes the filter', async () => {
    const wrapper = mountView()
    await flushPromises()
    const btn = wrapper.find('[data-testid="insights-bin-month"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    const { useInsightsStore } = await import('@/stores/insights')
    const store = useInsightsStore()
    expect(store.bin).toBe('month')
  })

  it('clicking entity type tab changes the type', async () => {
    vi.mocked(fetchEntityDistribution).mockResolvedValue({
      type: 'activity',
      from: null,
      to: null,
      total: 0,
      items: [],
    })
    const wrapper = mountView()
    await flushPromises()
    await wrapper
      .find('[data-testid="insights-entity-tab-activity"]')
      .trigger('click')
    await flushPromises()
    const { useInsightsStore } = await import('@/stores/insights')
    const store = useInsightsStore()
    expect(store.entityType).toBe('activity')
  })

  it('clicking mood dimension toggle calls store', async () => {
    vi.mocked(fetchMoodDimensions).mockResolvedValue({
      dimensions: fakeDimensions,
    })
    vi.mocked(fetchMoodTrends).mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      bins: [
        {
          period: '2026-04-14',
          dimension: 'agency',
          avg_score: 0.7,
          entry_count: 1,
          score_min: 0.7,
          score_max: 0.7,
        },
      ],
    })
    const wrapper = mountView()
    await flushPromises()
    const toggle = wrapper.find(
      '[data-testid="insights-mood-toggle-joy_sadness"]',
    )
    expect(toggle.exists()).toBe(true)
    await toggle.trigger('click')
    await flushPromises()
    const { useInsightsStore } = await import('@/stores/insights')
    const store = useInsightsStore()
    // After clicking joy_sadness (which was hidden), it should now be isolated
    expect(store.hiddenMoodDimensions.has('agency')).toBe(true)
    expect(store.hiddenMoodDimensions.has('joy_sadness')).toBe(false)
  })

  it('shows mood loading state', async () => {
    vi.mocked(fetchMoodDimensions).mockResolvedValue({
      dimensions: fakeDimensions,
    })
    // Make mood trends hang forever
    vi.mocked(fetchMoodTrends).mockReturnValue(new Promise(() => {}))
    const wrapper = mountView()
    // Don't flush — let it stay in loading state
    await new Promise((r) => setTimeout(r, 10))
    expect(wrapper.find('[data-testid="insights-mood-loading"]').exists()).toBe(
      true,
    )
  })
})
