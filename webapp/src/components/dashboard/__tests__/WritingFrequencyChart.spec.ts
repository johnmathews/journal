import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import WritingFrequencyChart from '../WritingFrequencyChart.vue'

vi.mock(
  'chart.js',
  async () => (await import('./chart-test-utils')).chartJsMockModule,
)
vi.mock('@/utils/chartjs-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/chartjs-config')>()
  return (await import('./chart-test-utils')).withStubbedChartColors(actual)
})

import { chartConstructorSpy, destroySpy } from './chart-test-utils'

describe('WritingFrequencyChart', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    vi.clearAllMocks()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()
    // `fillBins` resolves a null `to` to "today" and the last_3_months
    // range derives `from` from the clock, so pin Date to make the
    // generated axis deterministic. Date only — faking timers would
    // break async helpers.
    vi.useFakeTimers({
      now: new Date('2026-03-16T12:00:00Z'),
      toFake: ['Date'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function mountChart() {
    return mount(WritingFrequencyChart, {
      props: {
        bins: [
          { bin_start: '2026-01-05', entry_count: 3, total_words: 300 },
          { bin_start: '2026-02-16', entry_count: 3, total_words: 150 },
        ],
        range: 'last_3_months' as const,
        bin: 'week' as const,
        rangePhrase: 'over the last 3 months',
      },
    })
  }

  it('renders the canvas and builds a zero-filled line chart', () => {
    const wrapper = mountChart()
    expect(
      wrapper.find('[data-testid="dashboard-writing-chart"]').exists(),
    ).toBe(true)
    expect(chartConstructorSpy).toHaveBeenCalledTimes(1)

    const config = chartConstructorSpy.mock.calls[0][1] as {
      type: string
      data: {
        labels: string[]
        datasets: Array<{ label: string; data: number[] }>
      }
    }
    expect(config.type).toBe('line')
    expect(config.data.datasets[0].label).toBe('Entries')
    // Sparse server bins are zero-filled to a contiguous weekly axis.
    expect(config.data.labels).toContain('2026-01-12') // an empty week
    expect(config.data.labels[config.data.labels.length - 1]).toBe('2026-03-16')
    const byLabel = new Map(
      config.data.labels.map((l, i) => [l, config.data.datasets[0].data[i]]),
    )
    expect(byLabel.get('2026-01-05')).toBe(3)
    expect(byLabel.get('2026-01-12')).toBe(0)
  })

  it('re-renders when the bins prop changes', async () => {
    const wrapper = mountChart()
    chartConstructorSpy.mockClear()
    destroySpy.mockClear()

    await wrapper.setProps({
      bins: [{ bin_start: '2026-03-02', entry_count: 1, total_words: 80 }],
    })
    await wrapper.vm.$nextTick()

    expect(destroySpy).toHaveBeenCalled()
    expect(chartConstructorSpy).toHaveBeenCalledTimes(1)
  })

  it('destroys the Chart instance on unmount', () => {
    const wrapper = mountChart()
    destroySpy.mockClear()
    wrapper.unmount()
    expect(destroySpy).toHaveBeenCalled()
  })
})
