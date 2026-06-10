import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import MoodCorrelationChart from '../MoodCorrelationChart.vue'
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
  fetchMoodEntityCorrelation: vi.fn().mockResolvedValue({
    dimension: 'agency',
    from: null,
    to: null,
    entity_type: 'person',
    overall_avg: 0,
    items: [],
  }),
}))

import { chartConstructorSpy, destroySpy } from './chart-test-utils'
import {
  fetchMoodDimensions,
  fetchMoodEntityCorrelation,
} from '@/api/dashboard'
const mockCorrelation = vi.mocked(fetchMoodEntityCorrelation)

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

// Harness mirrors the prop/event wiring `DashboardView.vue` gives the
// component so the moved assertions stay unchanged.
const Harness = defineComponent({
  components: { MoodCorrelationChart },
  setup() {
    const store = useDashboardStore()
    return { store }
  },
  template: `
    <MoodCorrelationChart
      :items="store.moodCorrelationItems"
      :overall-avg="store.moodCorrelationOverallAvg"
      :dimension="store.moodCorrelationDimension"
      :entity-type="store.moodCorrelationType"
      :dimensions="store.moodDimensions"
      :loading="store.moodCorrelationLoading"
      :has-loaded="store.moodCorrelationHasLoaded"
      :error="store.moodCorrelationError"
      range-phrase="over the last 3 months"
      @change-dimension="(d) => store.loadMoodEntityCorrelation(d)"
      @change-type="(t) => store.loadMoodEntityCorrelation(undefined, t)"
    />`,
})

async function mountWithCorrelation() {
  const store = useDashboardStore()
  await store.loadMoodDimensions()
  await store.loadMoodEntityCorrelation()
  const wrapper = mount(Harness)
  await flushPromises()
  return wrapper
}

describe('MoodCorrelationChart', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()
    vi.mocked(fetchMoodDimensions).mockResolvedValue({
      dimensions: fakeDimensions,
    })
    mockCorrelation.mockResolvedValue({
      dimension: 'agency',
      from: null,
      to: null,
      entity_type: 'person',
      overall_avg: 0,
      items: [],
    })
  })

  it('renders the correlation content when data is present', async () => {
    mockCorrelation.mockResolvedValue({
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
    const wrapper = await mountWithCorrelation()
    expect(
      wrapper
        .find('[data-testid="dashboard-mood-correlation-content"]')
        .exists(),
    ).toBe(true)
  })

  it('shows empty state when mood correlation returns no items', async () => {
    const wrapper = await mountWithCorrelation()
    expect(
      wrapper.find('[data-testid="dashboard-mood-correlation-empty"]').exists(),
    ).toBe(true)
  })

  it('shows error state when mood correlation fails', async () => {
    mockCorrelation.mockRejectedValue(new Error('correlation fail'))
    const wrapper = await mountWithCorrelation()
    expect(
      wrapper.find('[data-testid="dashboard-mood-correlation-error"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-mood-correlation-error"]').text(),
    ).toContain('correlation fail')
  })

  it('clicking a dimension pill reloads the correlation', async () => {
    const wrapper = await mountWithCorrelation()
    mockCorrelation.mockClear()

    await wrapper
      .find('[data-testid="dashboard-mood-correlation-dim-joy_sadness"]')
      .trigger('click')
    await flushPromises()

    expect(mockCorrelation).toHaveBeenCalledTimes(1)
  })

  it('clicking an entity type pill reloads the correlation', async () => {
    const wrapper = await mountWithCorrelation()
    mockCorrelation.mockClear()

    await wrapper
      .find('[data-testid="dashboard-mood-correlation-type-place"]')
      .trigger('click')
    await flushPromises()

    expect(mockCorrelation).toHaveBeenCalledTimes(1)
  })

  it('destroys the Chart instance on unmount', async () => {
    mockCorrelation.mockResolvedValue({
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
      ],
    })
    const wrapper = await mountWithCorrelation()
    expect(chartConstructorSpy).toHaveBeenCalled()
    destroySpy.mockClear()
    wrapper.unmount()
    expect(destroySpy).toHaveBeenCalled()
  })
})
