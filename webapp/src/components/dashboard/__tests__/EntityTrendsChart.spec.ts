import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import EntityTrendsChart from '../EntityTrendsChart.vue'
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
  fetchEntityTrends: vi.fn().mockResolvedValue({
    from: null,
    to: null,
    bin: 'week',
    entity_type: 'topic',
    entities: [],
    bins: [],
  }),
}))

import { chartConstructorSpy, destroySpy } from './chart-test-utils'
import { fetchEntityTrends } from '@/api/dashboard'
const mockEntityTrends = vi.mocked(fetchEntityTrends)

// Harness mirrors the prop/event wiring `DashboardView.vue` gives the
// component so the moved assertions stay unchanged.
const Harness = defineComponent({
  components: { EntityTrendsChart },
  setup() {
    const store = useDashboardStore()
    return { store }
  },
  template: `
    <EntityTrendsChart
      :entities="store.entityTrendEntities"
      :bins="store.entityTrends"
      :hidden-entities="store.hiddenEntityTrends"
      :entity-type="store.entityTrendsType"
      :range="store.range"
      :bin="store.bin"
      range-phrase="over the last 3 months"
      :loading="store.entityTrendsLoading"
      :has-loaded="store.entityTrendsHasLoaded"
      :error="store.entityTrendsError"
      @change-type="(t) => store.loadEntityTrends(t)"
      @toggle-entity="store.toggleEntityTrend"
      @show-all="store.showAllEntityTrends()"
      @hide-all="store.hideAllEntityTrends()"
    />`,
})

async function mountWithTrends() {
  const store = useDashboardStore()
  await store.loadEntityTrends()
  const wrapper = mount(Harness)
  await flushPromises()
  return wrapper
}

describe('EntityTrendsChart', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()
    mockEntityTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'topic',
      entities: [],
      bins: [],
    })
  })

  it('renders the entity trends content with entity type tabs', async () => {
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
    const wrapper = await mountWithTrends()
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
    const wrapper = await mountWithTrends()
    expect(
      wrapper.find('[data-testid="dashboard-entity-trends-empty"]').exists(),
    ).toBe(true)
  })

  it('shows error state when entity trends fails', async () => {
    mockEntityTrends.mockRejectedValue(new Error('trends fail'))
    const wrapper = await mountWithTrends()
    expect(
      wrapper.find('[data-testid="dashboard-entity-trends-error"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-entity-trends-error"]').text(),
    ).toContain('trends fail')
  })

  it('clicking an entity trends tab triggers reload', async () => {
    const wrapper = await mountWithTrends()
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
    await mountWithTrends()

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
              itemSort?: (
                a: { datasetIndex: number },
                b: { datasetIndex: number },
              ) => number
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

    // 3. `itemSort` reverses dataset order so the tooltip lists
    //    segments top-to-bottom matching the visual stack —
    //    Chart.js draws higher datasetIndex on top of the bar,
    //    so descending datasetIndex puts the visual top first.
    const itemSort = opts.plugins?.tooltip?.itemSort
    expect(typeof itemSort).toBe('function')
    expect(itemSort!({ datasetIndex: 0 }, { datasetIndex: 2 })).toBeGreaterThan(
      0,
    )
    expect(itemSort!({ datasetIndex: 2 }, { datasetIndex: 0 })).toBeLessThan(0)
    const sorted = [
      { datasetIndex: 0 },
      { datasetIndex: 1 },
      { datasetIndex: 2 },
    ].sort(itemSort!)
    expect(sorted.map((s) => s.datasetIndex)).toEqual([2, 1, 0])
  })

  it('destroys the Chart instance on unmount', async () => {
    mockEntityTrends.mockResolvedValue({
      from: null,
      to: null,
      bin: 'week',
      entity_type: 'topic',
      entities: ['meditation'],
      bins: [{ period: '2026-03-02', entity: 'meditation', mention_count: 5 }],
    })
    const wrapper = await mountWithTrends()
    expect(chartConstructorSpy).toHaveBeenCalled()
    destroySpy.mockClear()
    wrapper.unmount()
    expect(destroySpy).toHaveBeenCalled()
  })
})
