import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import CalendarHeatmap from '../CalendarHeatmap.vue'
import { useDashboardStore } from '@/stores/dashboard'

vi.mock('@/api/dashboard', () => ({
  fetchCalendarHeatmap: vi.fn().mockResolvedValue({
    from: '2026-01-11',
    to: '2026-04-11',
    days: [],
  }),
}))

import { fetchCalendarHeatmap } from '@/api/dashboard'
const mockCalendar = vi.mocked(fetchCalendarHeatmap)

// The view computes the visible window from the measured tile width
// (zero under happy-dom → rolling last_3_months fallback). The harness
// pins the same window explicitly so the grid matches what the view
// would render with the clock pinned below.
const DATE_RANGE = { from: '2025-12-15', to: '2026-03-15' }

const Harness = defineComponent({
  components: { CalendarHeatmap },
  setup() {
    const store = useDashboardStore()
    return { store, dateRange: DATE_RANGE }
  },
  template: `
    <CalendarHeatmap
      :days="store.calendarDays"
      :loading="store.calendarLoading"
      :has-loaded="store.calendarHasLoaded"
      :error="store.calendarError"
      :date-range="dateRange"
    />`,
})

async function mountWithCalendar() {
  const store = useDashboardStore()
  await store.loadCalendarHeatmap({ from: DATE_RANGE.from, to: DATE_RANGE.to })
  const wrapper = mount(Harness)
  await flushPromises()
  return wrapper
}

describe('CalendarHeatmap', () => {
  enableAutoUnmount(beforeEach)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // The heatmap grid window is derived from `new Date()` in the view
    // (rolling last_3_months fallback under happy-dom's zero element
    // width), so the March-2026 fixture dates below age out of the grid
    // on a real clock. Pin Date only — faking timers would break
    // flushPromises().
    vi.useFakeTimers({ now: new Date('2026-03-15T12:00:00'), toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the grid and legend when data is present', async () => {
    mockCalendar.mockResolvedValue({
      from: '2026-01-11',
      to: '2026-04-11',
      days: [
        { date: '2026-03-02', entry_count: 2, total_words: 400 },
        { date: '2026-03-09', entry_count: 1, total_words: 150 },
      ],
    })
    const wrapper = await mountWithCalendar()
    expect(
      wrapper.find('[data-testid="dashboard-calendar-content"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-calendar-legend"]').exists(),
    ).toBe(true)
  })

  it('shows empty state when calendar has no data', async () => {
    mockCalendar.mockResolvedValue({
      from: '2026-01-11',
      to: '2026-04-11',
      days: [],
    })
    const wrapper = await mountWithCalendar()
    expect(
      wrapper.find('[data-testid="dashboard-calendar-empty"]').exists(),
    ).toBe(true)
  })

  it('shows error state when calendar fails', async () => {
    mockCalendar.mockRejectedValue(new Error('calendar fail'))
    const wrapper = await mountWithCalendar()
    expect(
      wrapper.find('[data-testid="dashboard-calendar-error"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-calendar-error"]').text(),
    ).toContain('calendar fail')
  })

  it('colors cells by word count using quantile thresholds', async () => {
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
    const wrapper = await mountWithCalendar()
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
    mockCalendar.mockResolvedValue({
      from: '2026-03-02',
      to: '2026-03-04',
      days: [{ date: '2026-03-02', entry_count: 1, total_words: 1234 }],
    })
    const wrapper = await mountWithCalendar()
    const cell = wrapper.find(
      '[data-testid="dashboard-calendar-cell-2026-03-02"]',
    )
    expect(cell.exists()).toBe(true)
    const title = cell.attributes('title') ?? ''
    expect(title).toContain('1,234 words')
    expect(title).toContain('1 entry')
  })
})
