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
    expect(
      wrapper.find('[data-testid="insights-entity-tab-topic"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="insights-entity-tab-activity"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="insights-entity-tab-place"]').exists(),
    ).toBe(true)
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
      wrapper.findAll('[data-testid="insights-entity-legend"] li'),
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
})
