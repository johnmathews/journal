import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import EntityDistributionChart from '../EntityDistributionChart.vue'
import { useDashboardStore } from '@/stores/dashboard'

vi.mock(
  'chart.js',
  async () => (await import('./chart-test-utils')).chartJsMockModule,
)
vi.mock('@/utils/chartjs-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/chartjs-config')>()
  return (await import('./chart-test-utils')).withStubbedChartColors(actual)
})

vi.mock('@/api/insights', () => ({
  fetchEntityDistribution: vi.fn().mockResolvedValue({
    type: 'topic',
    from: null,
    to: null,
    total: 0,
    items: [],
  }),
}))

import { chartConstructorSpy, destroySpy } from './chart-test-utils'
import { fetchEntityDistribution } from '@/api/insights'
const mockEntityDist = vi.mocked(fetchEntityDistribution)

// Harness mirrors the prop/event wiring `DashboardView.vue` gives the
// component so the moved assertions stay unchanged.
const Harness = defineComponent({
  components: { EntityDistributionChart },
  setup() {
    const store = useDashboardStore()
    return { store }
  },
  template: `
    <EntityDistributionChart
      :items="store.entityDistribution"
      :entity-type="store.entityType"
      :loading="store.entityLoading"
      :has-loaded="store.entityHasLoaded"
      :error="store.entityError"
      range-phrase="over the last 3 months"
      @change-type="(t) => store.loadEntityDistribution(t)"
    />`,
})

async function mountWithDistribution() {
  const store = useDashboardStore()
  await store.loadEntityDistribution()
  const wrapper = mount(Harness)
  await flushPromises()
  return wrapper
}

describe('EntityDistributionChart', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()
    mockEntityDist.mockResolvedValue({
      type: 'topic',
      from: null,
      to: null,
      total: 0,
      items: [],
    })
  })

  it('renders entity type tabs', async () => {
    const wrapper = await mountWithDistribution()
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
    const wrapper = await mountWithDistribution()
    expect(
      wrapper.find('[data-testid="dashboard-entity-empty"]').exists(),
    ).toBe(true)
  })

  it('renders entity legend capped at 8 items', async () => {
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
    const wrapper = await mountWithDistribution()

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
    const wrapper = await mountWithDistribution()

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
    const wrapper = await mountWithDistribution()

    expect(
      wrapper.findAll('[data-testid="dashboard-entity-legend"] tbody tr'),
    ).toHaveLength(3)
    expect(
      wrapper.find('[data-testid="dashboard-entity-legend-toggle"]').exists(),
    ).toBe(false)
  })

  it('clicking entity type tab changes the type', async () => {
    mockEntityDist.mockResolvedValue({
      type: 'activity',
      from: null,
      to: null,
      total: 0,
      items: [],
    })
    const wrapper = await mountWithDistribution()
    mockEntityDist.mockClear()

    await wrapper
      .find('[data-testid="dashboard-entity-tab-activity"]')
      .trigger('click')
    await flushPromises()

    expect(mockEntityDist).toHaveBeenCalledTimes(1)
  })

  it('shows entity error state', async () => {
    mockEntityDist.mockRejectedValue(new Error('entity fail'))
    const wrapper = await mountWithDistribution()
    expect(
      wrapper.find('[data-testid="dashboard-entity-error"]').exists(),
    ).toBe(true)
  })

  it('destroys the Chart instance on unmount', async () => {
    mockEntityDist.mockResolvedValue({
      type: 'topic',
      from: null,
      to: null,
      total: 1,
      items: [
        {
          canonical_name: 'meditation',
          entity_type: 'topic',
          mention_count: 3,
        },
      ],
    })
    const wrapper = await mountWithDistribution()
    expect(chartConstructorSpy).toHaveBeenCalled()
    destroySpy.mockClear()
    wrapper.unmount()
    expect(destroySpy).toHaveBeenCalled()
  })
})
