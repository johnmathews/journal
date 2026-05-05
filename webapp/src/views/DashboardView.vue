<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { Chart } from 'chart.js'
import { useDashboardStore, rangeToDates } from '@/stores/dashboard'
import {
  DASHBOARD_BINS,
  DASHBOARD_RANGES,
  type DashboardBin,
  type DashboardRange,
  type DashboardTileId,
} from '@/types/dashboard'
import type { CalendarDay } from '@/types/dashboard'
import {
  INSIGHTS_ENTITY_TYPES,
  type InsightsEntityType,
} from '@/types/insights'
import { getChartColors } from '@/utils/chartjs-config'
import { adjustColorOpacity } from '@/utils/mosaic'
import {
  displayLabel,
  displayScore,
  isDisplayInverted,
} from '@/utils/mood-display'
import { groupDimensions } from '@/utils/mood-groups'

// Prevent tree-shaking of Chart.js registration side-effect.
void getChartColors

const store = useDashboardStore()
const router = useRouter()

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatScore(score: number): string {
  return score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2)
}

function navigateToEntry(entryId: number): void {
  router.push({ name: 'entry-detail', params: { id: String(entryId) } })
}

function rangeLabel(r: DashboardRange): string {
  switch (r) {
    case 'last_1_month':
      return 'Last month'
    case 'last_3_months':
      return 'Last 3 months'
    case 'last_6_months':
      return 'Last 6 months'
    case 'last_1_year':
      return 'Last year'
    case 'all':
      return 'All time'
  }
}

function binLabel(b: DashboardBin): string {
  return b.charAt(0).toUpperCase() + b.slice(1)
}

/** Human-readable range phrase for chart descriptions, e.g. "over the last 6 months". */
const rangePhrase = computed<string>(() => {
  const r = store.range
  if (r === 'last_1_month') return 'over the last month'
  if (r === 'last_3_months') return 'over the last 3 months'
  if (r === 'last_6_months') return 'over the last 6 months'
  if (r === 'last_1_year') return 'over the last year'
  return 'across all time'
})

function entityTypeLabel(t: InsightsEntityType): string {
  const labels: Record<InsightsEntityType, string> = {
    topic: 'Topics',
    activity: 'Activities',
    place: 'Places',
    person: 'People',
    organization: 'Organizations',
    other: 'Other',
  }
  return labels[t]
}

const MIN_ENTRIES_FOR_CHARTS = 5

const writingChartCanvas = ref<HTMLCanvasElement | null>(null)
const wordChartCanvas = ref<HTMLCanvasElement | null>(null)
const moodChartCanvas = ref<HTMLCanvasElement | null>(null)
const entityChartCanvas = ref<HTMLCanvasElement | null>(null)
const entityTrendsChartCanvas = ref<HTMLCanvasElement | null>(null)
const moodCorrelationChartCanvas = ref<HTMLCanvasElement | null>(null)

let writingChart: Chart | null = null
let wordChart: Chart | null = null
let moodChart: Chart | null = null
let entityChart: Chart | null = null
let entityTrendsChart: Chart | null = null
let moodCorrelationChart: Chart | null = null

let moodChartRenderedOnce = false

const MOOD_LINE_COLORS: readonly string[] = [
  '#8b5cf6', // violet
  '#0ea5e9', // sky
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#14b8a6', // teal
  '#a855f7', // purple
]

const DOUGHNUT_COLORS: readonly string[] = [
  '#8b5cf6',
  '#0ea5e9',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#14b8a6',
  '#a855f7',
  '#6366f1',
  '#84cc16',
  '#f97316',
  '#06b6d4',
]

// Entity legend expand/collapse — show top 8 by default.
const LEGEND_COLLAPSED_COUNT = 8
const entityLegendExpanded = ref(false)

const visibleEntityItems = computed(() => {
  if (entityLegendExpanded.value) return store.entityDistribution
  return store.entityDistribution.slice(0, LEGEND_COLLAPSED_COUNT)
})

const hiddenEntityCount = computed(
  () => store.entityDistribution.length - LEGEND_COLLAPSED_COUNT,
)

const showCharts = computed(
  () => store.totalEntriesInRange >= MIN_ENTRIES_FOR_CHARTS,
)

/**
 * Mood dimensions bucketed into the four conceptual groups (affect axes /
 * psychological needs / active negative affect / stance) per the toml's
 * leading comment. Each row in the chart's toggle UI renders one entry from
 * this list. Iterating preserves the toml's ordering, which the chart relies
 * on for line colour assignment.
 */
const groupedMoodDimensions = computed(() =>
  groupDimensions(store.moodDimensions),
)

/**
 * Stable index for each dimension across the flat (un-grouped) toml order.
 * The chart's line colours are assigned by this index so the colour
 * associated with `joy_sadness` doesn't depend on which group it ended up
 * rendered in. Built once per `moodDimensions` change.
 */
const moodDimensionIndex = computed<Map<string, number>>(() => {
  const m = new Map<string, number>()
  store.moodDimensions.forEach((d, i) => m.set(d.name, i))
  return m
})

const allEntityTrendsHidden = computed(
  () =>
    store.entityTrendEntities.length > 0 &&
    store.hiddenEntityTrends.size === store.entityTrendEntities.length,
)

function isTileVisible(id: DashboardTileId): boolean {
  return store.visibleTiles.includes(id)
}

function tileOrder(id: DashboardTileId): number {
  const idx = store.tileOrder.indexOf(id)
  return idx >= 0 ? idx : 999
}

function tileSpan(id: DashboardTileId): string {
  return store.getTileSpan(id) === 2 ? '1 / -1' : 'span 1'
}

const labels = computed(() => store.bins.map((b) => b.bin_start))
const entryCountSeries = computed(() => store.bins.map((b) => b.entry_count))
const wordCountSeries = computed(() => store.bins.map((b) => b.total_words))

// --- Writing frequency chart ---

function renderWritingChart(): void {
  if (!showCharts.value) {
    writingChart?.destroy()
    writingChart = null
    return
  }
  if (!writingChartCanvas.value) return
  const colors = getChartColors()
  const violet = '#8b5cf6'
  const translucent = adjustColorOpacity(violet, 0.15)

  writingChart?.destroy()
  writingChart = new Chart(writingChartCanvas.value, {
    type: 'line',
    data: {
      labels: labels.value,
      datasets: [
        {
          label: 'Entries',
          data: entryCountSeries.value,
          borderColor: violet,
          backgroundColor: translucent,
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: violet,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.tooltipBgColor.light,
          titleColor: colors.tooltipTitleColor.light,
          bodyColor: colors.tooltipBodyColor.light,
          borderColor: colors.tooltipBorderColor.light,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: colors.textColor.light, maxRotation: 0 },
        },
        y: {
          beginAtZero: true,
          grid: { color: colors.gridColor.light },
          ticks: { color: colors.textColor.light, precision: 0 },
        },
      },
    },
  })
}

// --- Word count chart ---

function renderWordChart(): void {
  if (!showCharts.value) {
    wordChart?.destroy()
    wordChart = null
    return
  }
  if (!wordChartCanvas.value) return
  const colors = getChartColors()

  wordChart?.destroy()
  wordChart = new Chart(wordChartCanvas.value, {
    type: 'line',
    data: {
      labels: labels.value,
      datasets: [
        {
          label: 'Words',
          data: wordCountSeries.value,
          borderColor: '#0ea5e9',
          backgroundColor: adjustColorOpacity('#0ea5e9', 0.15),
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#0ea5e9',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.tooltipBgColor.light,
          titleColor: colors.tooltipTitleColor.light,
          bodyColor: colors.tooltipBodyColor.light,
          borderColor: colors.tooltipBorderColor.light,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: colors.textColor.light, maxRotation: 0 },
        },
        y: {
          beginAtZero: true,
          grid: { color: colors.gridColor.light },
          ticks: { color: colors.textColor.light },
        },
      },
    },
  })
}

// --- Mood chart with variance bands ---

/** Display label for the drill-down panel header — uses the active
 *  dimension's `displayLabel` so frustration drill-downs read as "calm". */
const drillDimensionLabel = computed<string>(() => {
  const name = store.drillDimension
  if (!name) return ''
  const d = store.moodDimensions.find((m) => m.name === name)
  return d ? displayLabel(d) : name
})

/** Inverts an individual entry score for display when the drilled-into
 *  dimension is display-inverted; passes through otherwise. */
function drillEntryDisplayScore(score: number): number {
  const name = store.drillDimension
  if (!name) return score
  const d = store.moodDimensions.find((m) => m.name === name)
  if (!d) return score
  return displayScore(d, score) ?? score
}

function pivotMoodBins(): {
  periods: string[]
  series: Record<string, (number | null)[]>
  minSeries: Record<string, (number | null)[]>
  maxSeries: Record<string, (number | null)[]>
} {
  const byPeriod: Map<
    string,
    Map<string, { avg: number; min: number | null; max: number | null }>
  > = new Map()
  for (const b of store.moodBins) {
    let periodRow = byPeriod.get(b.period)
    if (!periodRow) {
      periodRow = new Map()
      byPeriod.set(b.period, periodRow)
    }
    periodRow.set(b.dimension, {
      avg: b.avg_score,
      min: b.score_min,
      max: b.score_max,
    })
  }
  const periods = Array.from(byPeriod.keys()).sort()
  const series: Record<string, (number | null)[]> = {}
  const minSeries: Record<string, (number | null)[]> = {}
  const maxSeries: Record<string, (number | null)[]> = {}
  for (const d of store.moodDimensions) {
    series[d.name] = periods.map((p) =>
      displayScore(d, byPeriod.get(p)?.get(d.name)?.avg ?? null),
    )
    // For display-inverted dimensions, the stored min becomes the upper
    // bound of the band after inversion (because `1 - small` is large), so
    // we feed each through `displayScore` AND swap them.
    const lo = (p: string) =>
      displayScore(d, byPeriod.get(p)?.get(d.name)?.min ?? null)
    const hi = (p: string) =>
      displayScore(d, byPeriod.get(p)?.get(d.name)?.max ?? null)
    const inverted = isDisplayInverted(d.name)
    minSeries[d.name] = periods.map((p) => (inverted ? hi(p) : lo(p)))
    maxSeries[d.name] = periods.map((p) => (inverted ? lo(p) : hi(p)))
  }
  return { periods, series, minSeries, maxSeries }
}

function renderMoodChart(): void {
  if (!moodChartCanvas.value) return
  moodChart?.destroy()

  if (!store.hasMoodData) {
    moodChart = null
    return
  }

  const colors = getChartColors()
  const { periods, series, minSeries, maxSeries } = pivotMoodBins()

  const allDimensions = store.moodDimensions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const datasets: any[] = []

  for (const d of allDimensions) {
    if (!store.isMoodDimensionVisible(d.name)) continue
    const fullIndex = allDimensions.indexOf(d)
    const color = MOOD_LINE_COLORS[fullIndex % MOOD_LINE_COLORS.length]
    const bandColor = adjustColorOpacity(color, 0.1)

    // Max boundary line (invisible, defines the top of the fill band)
    datasets.push({
      label: `${d.name}_max`,
      data: maxSeries[d.name] ?? [],
      borderColor: 'transparent',
      backgroundColor: 'transparent',
      pointRadius: 0,
      borderWidth: 0,
      fill: false,
      spanGaps: false,
    })

    // Min boundary line (fills up to the max line above)
    datasets.push({
      label: `${d.name}_min`,
      data: minSeries[d.name] ?? [],
      borderColor: 'transparent',
      backgroundColor: bandColor,
      pointRadius: 0,
      borderWidth: 0,
      fill: '-1',
      spanGaps: false,
    })

    // Average line (the main visible line)
    datasets.push({
      label: d.name,
      data: series[d.name] ?? [],
      borderColor: color,
      backgroundColor: adjustColorOpacity(color, 0.12),
      fill: false,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: color,
      spanGaps: false,
    })
  }

  moodChart = new Chart(moodChartCanvas.value, {
    type: 'line',
    data: { labels: periods, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: moodChartRenderedOnce ? false : undefined,
      onClick: (_event, elements, chart) => {
        if (elements.length === 0) return
        const el = elements[0]
        const dsLabel = chart.data.datasets[el.datasetIndex].label as string
        if (dsLabel.endsWith('_min') || dsLabel.endsWith('_max')) return
        const period = chart.data.labels?.[el.index] as string
        if (!period || !dsLabel) return
        if (store.drillPeriod === period && store.drillDimension === dsLabel) {
          store.clearDrillDown()
        } else {
          store.loadDrillDown(period, dsLabel)
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.tooltipBgColor.light,
          titleColor: colors.tooltipTitleColor.light,
          bodyColor: colors.tooltipBodyColor.light,
          borderColor: colors.tooltipBorderColor.light,
          filter: (item) => {
            const label = item.dataset.label || ''
            return !label.endsWith('_min') && !label.endsWith('_max')
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: colors.textColor.light, maxRotation: 0 },
        },
        y: {
          min: -1,
          max: 1,
          grid: { color: colors.gridColor.light },
          ticks: { color: colors.textColor.light, stepSize: 0.5 },
        },
      },
    },
  })
  moodChartRenderedOnce = true
}

// --- Entity doughnut chart ---

function renderEntityChart(): void {
  if (!entityChartCanvas.value) return
  entityChart?.destroy()

  const items = store.entityDistribution
  if (items.length === 0) {
    entityChart = null
    return
  }

  const colors = getChartColors()
  const bgColors = items.map(
    (_, i) => DOUGHNUT_COLORS[i % DOUGHNUT_COLORS.length],
  )

  entityChart = new Chart(entityChartCanvas.value, {
    type: 'doughnut',
    data: {
      labels: items.map((it) => it.canonical_name),
      datasets: [
        {
          data: items.map((it) => it.mention_count),
          backgroundColor: bgColors,
          borderColor: colors.backdropColor.light,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.tooltipBgColor.light,
          titleColor: colors.tooltipTitleColor.light,
          bodyColor: colors.tooltipBodyColor.light,
          borderColor: colors.tooltipBorderColor.light,
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.parsed} mentions`,
          },
        },
      },
    },
  })
}

// --- Calendar heatmap computed ---

const calendarContainerRef = ref<HTMLElement | null>(null)
const { width: calendarContainerWidth } = useElementSize(calendarContainerRef)

/** Pixel constants for the heatmap grid layout. */
const HEATMAP_CELL_SIZE = 18
const HEATMAP_GAP = 3
const HEATMAP_COL_WIDTH = HEATMAP_CELL_SIZE + HEATMAP_GAP // 21px
const HEATMAP_DAY_LABEL_WIDTH = 32 // left-side day-of-week labels

/**
 * The date range the calendar heatmap should display and fetch.
 * Expands backward from today to fill the available tile width,
 * with the selected range as a minimum bound.
 */
const heatmapDateRange = computed<{ from: string | null; to: string | null }>(
  () => {
    const now = new Date()
    const to = now.toISOString().slice(0, 10)
    const { from: rangeFrom } = rangeToDates(store.range)

    const cw = calendarContainerWidth.value
    if (cw <= 0) {
      // Container not measured yet — use the selected range as fallback
      return { from: rangeFrom, to: rangeFrom ? to : null }
    }

    const maxWeeks = Math.floor(
      (cw - HEATMAP_DAY_LABEL_WIDTH) / HEATMAP_COL_WIDTH,
    )
    const expandedStart = new Date(now)
    expandedStart.setDate(expandedStart.getDate() - maxWeeks * 7)

    // For "all time" or when the expanded range already covers the
    // selected range, use the expanded start. Otherwise use whichever
    // goes further back.
    let finalStart = expandedStart
    if (rangeFrom) {
      const rangeStart = new Date(rangeFrom + 'T00:00:00')
      if (rangeStart < expandedStart) finalStart = rangeStart
    }

    return { from: finalStart.toISOString().slice(0, 10), to }
  },
)

/** Human-readable span of the visible heatmap, e.g. "14 months". */
const heatmapSpanLabel = computed<string>(() => {
  const { from, to } = heatmapDateRange.value
  if (!from || !to) return ''
  const ms =
    new Date(to + 'T00:00:00').getTime() -
    new Date(from + 'T00:00:00').getTime()
  const days = Math.round(ms / (24 * 60 * 60 * 1000))
  if (days >= 365 * 2) {
    const y = Math.round(days / 365)
    return `${y} years`
  }
  if (days >= 60) {
    const m = Math.round(days / 30.44)
    return `${m} months`
  }
  const w = Math.max(1, Math.round(days / 7))
  return w === 1 ? '1 week' : `${w} weeks`
})

interface HeatmapCell {
  date: string
  entry_count: number
  total_words: number
  dayOfWeek: number // 0=Mon … 6=Sun
  weekIndex: number
}

interface HeatmapMonth {
  label: string
  colStart: number
}

const calendarGrid = computed(() => {
  const days = store.calendarDays
  if (days.length === 0)
    return {
      cells: [] as HeatmapCell[],
      weeks: 0,
      months: [] as HeatmapMonth[],
    }

  // Build a lookup of date -> day data
  const lookup = new Map<string, CalendarDay>()
  for (const d of days) {
    lookup.set(d.date, d)
  }

  // Use heatmapDateRange for grid boundaries — it already accounts
  // for container width expansion and selected-range minimum.
  const { from: heatFrom, to: heatTo } = heatmapDateRange.value
  const sortedDates = days.map((d) => d.date).sort()
  const startDate = heatFrom
    ? new Date(heatFrom + 'T00:00:00')
    : new Date(sortedDates[0] + 'T00:00:00')
  const endDate = heatTo
    ? new Date(heatTo + 'T00:00:00')
    : new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00')

  // Align start to the Monday of its week
  const startDay = startDate.getDay() // 0=Sun, 1=Mon, ...
  const mondayOffset = startDay === 0 ? 6 : startDay - 1
  startDate.setDate(startDate.getDate() - mondayOffset)

  const cells: HeatmapCell[] = []
  const months: HeatmapMonth[] = []
  let weekIndex = 0
  let lastMonth = -1
  const cur = new Date(startDate)

  while (cur <= endDate) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    const jsDay = cur.getDay() // 0=Sun
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1 // 0=Mon … 6=Sun

    // Track month labels
    if (cur.getMonth() !== lastMonth) {
      months.push({
        label: cur.toLocaleDateString('en-US', { month: 'short' }),
        colStart: weekIndex,
      })
      lastMonth = cur.getMonth()
    }

    const data = lookup.get(iso)
    cells.push({
      date: iso,
      entry_count: data?.entry_count ?? 0,
      total_words: data?.total_words ?? 0,
      dayOfWeek,
      weekIndex,
    })

    // Advance day
    cur.setDate(cur.getDate() + 1)
    // New week when we hit Monday
    const nextJsDay = cur.getDay()
    const nextDow = nextJsDay === 0 ? 6 : nextJsDay - 1
    if (nextDow === 0 && cur <= endDate) {
      weekIndex++
    }
  }

  return { cells, weeks: weekIndex + 1, months }
})

// Quantile thresholds for word-count heatmap coloring.
// Uses 25th/50th/75th percentiles of non-zero days so that
// outlier heavy-writing days stand out clearly.
const heatmapThresholds = computed(() => {
  const wordCounts = calendarGrid.value.cells
    .map((c) => c.total_words)
    .filter((w) => w > 0)
    .sort((a, b) => a - b)
  if (wordCounts.length === 0) return { p25: 1, p50: 2, p75: 3 }
  const pct = (p: number) =>
    wordCounts[
      Math.min(Math.floor(p * wordCounts.length), wordCounts.length - 1)
    ]
  return { p25: pct(0.25), p50: pct(0.5), p75: pct(0.75) }
})

function heatmapColor(words: number): string {
  if (words === 0) return '' // handled by class
  const { p25, p50, p75 } = heatmapThresholds.value
  if (words <= p25) return 'bg-violet-200 dark:bg-violet-300/40'
  if (words <= p50) return 'bg-violet-400 dark:bg-violet-400/60'
  if (words <= p75) return 'bg-violet-500 dark:bg-violet-500/70'
  return 'bg-violet-700 dark:bg-violet-400'
}

function heatmapTooltip(cell: HeatmapCell): string {
  const d = new Date(cell.date + 'T00:00:00')
  const formatted = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${formatted}: ${cell.total_words.toLocaleString()} words (${cell.entry_count} ${cell.entry_count === 1 ? 'entry' : 'entries'})`
}

const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']

// --- Entity trends chart ---

function entityColorFor(entity: string): string {
  const idx = store.entityTrendEntities.indexOf(entity)
  const safeIdx = idx >= 0 ? idx : 0
  return MOOD_LINE_COLORS[safeIdx % MOOD_LINE_COLORS.length]
}

function renderEntityTrendsChart(): void {
  if (!entityTrendsChartCanvas.value) return
  entityTrendsChart?.destroy()

  const entities = store.entityTrendEntities
  const trendBins = store.entityTrends
  if (entities.length === 0 || trendBins.length === 0) {
    entityTrendsChart = null
    return
  }

  const colors = getChartColors()
  const visibleEntities = entities.filter(
    (e) => !store.hiddenEntityTrends.has(e),
  )
  if (visibleEntities.length === 0) {
    entityTrendsChart = null
    return
  }

  // Pivot: collect unique periods, build one series per visible entity
  const periodSet = new Set<string>()
  for (const b of trendBins) periodSet.add(b.period)
  const periods = Array.from(periodSet).sort()

  const byEntity = new Map<string, Map<string, number>>()
  for (const b of trendBins) {
    let m = byEntity.get(b.entity)
    if (!m) {
      m = new Map()
      byEntity.set(b.entity, m)
    }
    m.set(b.period, b.mention_count)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const datasets: any[] = visibleEntities.map((entity) => {
    const entityData = byEntity.get(entity)
    const color = entityColorFor(entity)
    return {
      label: entity,
      data: periods.map((p) => entityData?.get(p) ?? 0),
      backgroundColor: adjustColorOpacity(color, 0.85),
      borderColor: color,
      borderWidth: 1,
      borderRadius: 2,
    }
  })

  entityTrendsChart = new Chart(entityTrendsChartCanvas.value, {
    type: 'bar',
    data: { labels: periods, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // Override the global `nearest` + `intersect: false` defaults: in
      // a stacked bar that resolves hover to the closest dataset anchor
      // (often a zero-valued one), so the tooltip names a series that
      // isn't drawn under the cursor.
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (item) => (item.parsed?.y ?? 0) > 0,
          backgroundColor: colors.tooltipBgColor.light,
          titleColor: colors.tooltipTitleColor.light,
          bodyColor: colors.tooltipBodyColor.light,
          borderColor: colors.tooltipBorderColor.light,
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: colors.textColor.light, maxRotation: 0 },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: colors.gridColor.light },
          ticks: { color: colors.textColor.light, precision: 0 },
        },
      },
    },
  })
}

// --- Mood-entity correlation chart ---

function renderMoodCorrelationChart(): void {
  if (!moodCorrelationChartCanvas.value) return
  moodCorrelationChart?.destroy()

  const items = store.moodCorrelationItems
  if (items.length === 0) {
    moodCorrelationChart = null
    return
  }

  const colors = getChartColors()
  // Look up the active dimension so display-inverted ones (frustration → calm)
  // render with `1 - score` and a flipped above/below-average colouring.
  const activeDim = store.moodDimensions.find(
    (d) => d.name === store.moodCorrelationDimension,
  )
  const toDisplay = (s: number): number =>
    activeDim ? (displayScore(activeDim, s) ?? s) : s
  const overallAvg = toDisplay(store.moodCorrelationOverallAvg)
  const itemScores = items.map((it) => toDisplay(it.avg_score))

  const barColors = itemScores.map((s) =>
    s >= overallAvg ? '#22c55e' : '#ef4444',
  )

  moodCorrelationChart = new Chart(moodCorrelationChartCanvas.value, {
    type: 'bar',
    data: {
      labels: items.map((it) => it.entity),
      datasets: [
        {
          label: 'Avg score',
          data: itemScores,
          backgroundColor: barColors,
          borderColor: barColors,
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.tooltipBgColor.light,
          titleColor: colors.tooltipTitleColor.light,
          bodyColor: colors.tooltipBodyColor.light,
          borderColor: colors.tooltipBorderColor.light,
          callbacks: {
            label: (ctx) => {
              const item = items[ctx.dataIndex]
              const shown = itemScores[ctx.dataIndex]
              return `Score: ${shown.toFixed(3)} (${item.entry_count} entries)`
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: colors.gridColor.light },
          ticks: { color: colors.textColor.light },
        },
        y: {
          grid: { display: false },
          ticks: { color: colors.textColor.light, font: { size: 11 } },
        },
      },
    },
    plugins: [
      {
        id: 'overallAvgLine',
        afterDraw(chart) {
          const xScale = chart.scales.x
          if (!xScale) return
          const xPixel = xScale.getPixelForValue(overallAvg)
          const ctx = chart.ctx
          const { top, bottom } = chart.chartArea
          ctx.save()
          ctx.strokeStyle = '#6366f1'
          ctx.lineWidth = 2
          ctx.setLineDash([6, 4])
          ctx.beginPath()
          ctx.moveTo(xPixel, top)
          ctx.lineTo(xPixel, bottom)
          ctx.stroke()
          ctx.restore()
        },
      },
    ],
  })
}

// --- Watchers ---

watch(
  () => store.bins,
  () => {
    renderWritingChart()
    renderWordChart()
  },
  { deep: false },
)

// `flush: 'post'` is essential here: when the v-if/v-else branches in
// the mood-trends card flip (e.g. loading → loaded, or — historically —
// the all-hidden empty state → chart), Vue mounts/unmounts the canvas
// element. The default `flush: 'pre'` would fire this watcher *before*
// Vue patches the DOM, so `moodChartCanvas.value` would still be `null`
// and `renderMoodChart` would silently no-op. Running post-flush
// guarantees the canvas ref is live when we draw.
watch(
  [() => store.moodBins, () => store.selectedMoodDimensions],
  () => renderMoodChart(),
  { deep: false, flush: 'post' },
)

watch(
  () => store.entityDistribution,
  () => {
    entityLegendExpanded.value = false
    renderEntityChart()
  },
  { deep: false },
)

watch(
  [() => store.entityTrends, () => store.hiddenEntityTrends],
  () => renderEntityTrendsChart(),
  { deep: false },
)

watch(
  () => store.moodCorrelationItems,
  () => renderMoodCorrelationChart(),
  { deep: false },
)

// Re-render charts when tiles become visible again (v-if recreates the DOM).
// nextTick ensures the canvas ref is available after the DOM update.
watch(
  () => store.visibleTiles,
  async (visible, oldVisible) => {
    await nextTick()
    // Only re-render charts whose tile just appeared
    const appeared = visible.filter((id) => !oldVisible?.includes(id))
    for (const id of appeared) {
      switch (id) {
        case 'writing-frequency':
          renderWritingChart()
          break
        case 'word-count':
          renderWordChart()
          break
        case 'entity-distribution':
          renderEntityChart()
          break
        case 'mood-trends':
          renderMoodChart()
          break
        case 'topic-trends':
          renderEntityTrendsChart()
          break
        case 'mood-entity-correlation':
          renderMoodCorrelationChart()
          break
      }
    }
  },
)

// --- Lifecycle ---

onMounted(async () => {
  await Promise.all([
    store.loadWritingStats(),
    store.loadMoodDimensions(),
    store.loadLayout(),
  ])
  renderWritingChart()
  renderWordChart()
  const { from: heatFrom, to: heatTo } = heatmapDateRange.value
  const promises: Promise<void>[] = [
    store.loadEntityDistribution(),
    store.loadCalendarHeatmap({ from: heatFrom, to: heatTo }),
    store.loadEntityTrends(),
  ]
  if (store.moodScoringEnabled) {
    promises.push(store.loadMoodTrends())
    promises.push(store.loadMoodEntityCorrelation())
  }
  await Promise.all(promises)
  renderMoodChart()
  renderEntityChart()
  renderEntityTrendsChart()
  renderMoodCorrelationChart()
})

onBeforeUnmount(() => {
  writingChart?.destroy()
  wordChart?.destroy()
  moodChart?.destroy()
  entityChart?.destroy()
  entityTrendsChart?.destroy()
  moodCorrelationChart?.destroy()
  writingChart = null
  wordChart = null
  moodChart = null
  entityChart = null
  entityTrendsChart = null
  moodCorrelationChart = null
})

// Re-fetch calendar data when the visible date range changes (range
// selector change or container resize crossing a 21px boundary).
watch(
  () => `${heatmapDateRange.value.from}|${heatmapDateRange.value.to}`,
  () => {
    const { from, to } = heatmapDateRange.value
    store.loadCalendarHeatmap({ from, to })
  },
)

// --- Event handlers ---

async function onRangeChange(r: DashboardRange): Promise<void> {
  store.clearDrillDown()
  const promises: Promise<void>[] = [
    store.loadWritingStats({ range: r }),
    store.loadEntityDistribution(),
    store.loadEntityTrends(),
  ]
  if (store.moodScoringEnabled) {
    promises.push(store.loadMoodTrends({ range: r }))
    promises.push(store.loadMoodEntityCorrelation())
  }
  await Promise.all(promises)
}

async function onBinChange(b: DashboardBin): Promise<void> {
  store.clearDrillDown()
  const promises: Promise<void>[] = [
    store.loadWritingStats({ bin: b }),
    store.loadEntityTrends(),
  ]
  if (store.moodScoringEnabled) {
    promises.push(store.loadMoodTrends({ bin: b }))
  }
  await Promise.all(promises)
}

function toggleDimension(name: string): void {
  store.toggleMoodDimension(name)
}

async function onEntityTypeChange(type: InsightsEntityType): Promise<void> {
  await store.loadEntityDistribution(type)
}

async function onEntityTrendsTypeChange(
  type: InsightsEntityType,
): Promise<void> {
  await store.loadEntityTrends(type)
}

async function onMoodCorrelationDimensionChange(
  dimension: string,
): Promise<void> {
  await store.loadMoodEntityCorrelation(dimension)
}

async function onMoodCorrelationTypeChange(
  type: InsightsEntityType,
): Promise<void> {
  await store.loadMoodEntityCorrelation(undefined, type)
}
</script>

<template>
  <div data-testid="dashboard-view">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1
        class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold"
      >
        Dashboard
      </h1>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          :class="
            store.editingLayout
              ? 'bg-violet-500 text-white border-violet-500'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600'
          "
          data-testid="dashboard-edit-layout-toggle"
          @click="store.editingLayout = !store.editingLayout"
        >
          {{ store.editingLayout ? 'Done editing' : 'Edit layout' }}
        </button>
      </div>
    </div>

    <!-- Filter bar (sticky so it stays visible while scrolling) -->
    <div
      class="mb-6 flex flex-wrap items-end gap-6 sticky top-16 z-10 bg-white dark:bg-gray-800 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700/60 shadow-xs px-5 py-3"
      data-testid="dashboard-filters"
    >
      <div>
        <label
          class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
          >Range</label
        >
        <div
          class="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Date range"
          data-testid="dashboard-range"
        >
          <button
            v-for="r in DASHBOARD_RANGES"
            :key="r"
            type="button"
            class="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
            :class="
              store.range === r
                ? 'bg-violet-500 text-white border-violet-500'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60'
            "
            :data-testid="`dashboard-range-${r}`"
            :aria-pressed="store.range === r"
            @click="onRangeChange(r)"
          >
            {{ rangeLabel(r) }}
          </button>
        </div>
      </div>
      <div>
        <label
          class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
          >Bin width</label
        >
        <div
          class="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Bin width"
          data-testid="dashboard-bin"
        >
          <button
            v-for="b in DASHBOARD_BINS"
            :key="b"
            type="button"
            class="px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize"
            :class="
              store.bin === b
                ? 'bg-violet-500 text-white border-violet-500'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60'
            "
            :data-testid="`dashboard-bin-${b}`"
            :aria-pressed="store.bin === b"
            @click="onBinChange(b)"
          >
            {{ binLabel(b) }}
          </button>
        </div>
      </div>
    </div>

    <!-- Loading / error / empty / charts -->
    <div
      v-if="store.loading && !store.hasLoaded"
      class="py-16 text-center text-gray-600 dark:text-gray-300"
      data-testid="dashboard-loading"
    >
      Loading dashboard…
    </div>

    <div
      v-else-if="store.error"
      class="mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
      data-testid="dashboard-error"
    >
      {{ store.error }}
    </div>

    <div
      v-else-if="!showCharts"
      class="py-16 text-center text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
      data-testid="dashboard-empty"
    >
      <p class="text-base font-medium text-gray-700 dark:text-gray-200 mb-1">
        Not enough data yet
      </p>
      <p class="text-sm">
        The dashboard needs at least
        <span class="font-semibold">{{ MIN_ENTRIES_FOR_CHARTS }}</span>
        entries in the selected range to plot a meaningful trend. You currently
        have
        <span class="font-mono" data-testid="dashboard-entry-count-in-range">{{
          store.totalEntriesInRange
        }}</span
        >.
      </p>
      <p class="text-xs mt-2 text-gray-600 dark:text-gray-300">
        Try widening the range or ingesting more entries.
      </p>
    </div>

    <div v-else>
      <!-- Hidden tiles restoration panel -->
      <div
        v-if="store.editingLayout && store.hiddenTiles.length > 0"
        class="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-dashed border-amber-300 dark:border-amber-600/50 rounded-xl px-5 py-3"
        data-testid="dashboard-hidden-tiles-panel"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="text-xs font-medium text-amber-700 dark:text-amber-400 mr-1"
            >Hidden charts:</span
          >
          <button
            v-for="id in store.hiddenTiles"
            :key="id"
            type="button"
            class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-violet-400 dark:hover:border-violet-500 transition-colors"
            :data-testid="`dashboard-restore-tile-${id}`"
            @click="store.showTile(id)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-3 w-3"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clip-rule="evenodd"
              />
            </svg>
            {{ store.tileDefs.get(id)?.title ?? id }}
          </button>
          <button
            type="button"
            class="ml-2 text-xs text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300 font-medium"
            data-testid="dashboard-reset-layout"
            @click="store.resetLayout()"
          >
            Reset all
          </button>
        </div>
      </div>

      <!-- Dashboard tiles grid -->
      <div
        class="grid grid-cols-1 xl:grid-cols-2 gap-6"
        data-testid="dashboard-tiles-grid"
      >
        <!-- Calendar Heatmap -->
        <section
          v-if="isTileVisible('calendar-heatmap')"
          ref="calendarContainerRef"
          :style="{
            order: tileOrder('calendar-heatmap'),
            gridColumn: tileSpan('calendar-heatmap'),
          }"
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs px-5 py-4 relative group"
          data-testid="dashboard-calendar-section"
        >
          <header class="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2
                class="text-sm font-semibold text-gray-800 dark:text-gray-100"
              >
                Writing Consistency
              </h2>
              <p class="text-xs text-gray-600 dark:text-gray-300">
                Daily word count{{
                  heatmapSpanLabel ? ` over the last ${heatmapSpanLabel}` : ''
                }}.
              </p>
            </div>
            <div
              v-if="store.editingLayout"
              class="flex items-center gap-1 shrink-0"
            >
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Move up"
                data-testid="tile-move-up-calendar-heatmap"
                @click="store.moveTile('calendar-heatmap', 'up')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Move down"
                data-testid="tile-move-down-calendar-heatmap"
                @click="store.moveTile('calendar-heatmap', 'down')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                :title="
                  store.getTileSpan('calendar-heatmap') === 1
                    ? 'Full width'
                    : 'Half width'
                "
                data-testid="tile-width-calendar-heatmap"
                @click="
                  store.setTileWidth(
                    'calendar-heatmap',
                    store.getTileSpan('calendar-heatmap') === 1 ? 2 : 1,
                  )
                "
              >
                <svg
                  v-if="store.getTileSpan('calendar-heatmap') === 2"
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <rect x="2" y="7" width="7" height="6" rx="1" />
                  <rect x="11" y="7" width="7" height="6" rx="1" />
                </svg>
                <svg
                  v-else
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <rect x="2" y="7" width="16" height="6" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Hide chart"
                data-testid="tile-hide-calendar-heatmap"
                @click="store.hideTile('calendar-heatmap')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </header>

          <div
            v-if="store.calendarLoading && !store.calendarHasLoaded"
            class="py-12 text-center text-gray-600 dark:text-gray-300 text-sm"
            data-testid="dashboard-calendar-loading"
          >
            Loading calendar data…
          </div>

          <div
            v-else-if="store.calendarError"
            class="mb-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
            data-testid="dashboard-calendar-error"
          >
            {{ store.calendarError }}
          </div>

          <div
            v-else-if="store.calendarDays.length === 0"
            class="py-8 text-center text-gray-600 dark:text-gray-300 text-sm"
            data-testid="dashboard-calendar-empty"
          >
            No calendar data available for this range.
          </div>

          <div
            v-else
            class="overflow-hidden"
            data-testid="dashboard-calendar-content"
          >
            <!-- Month labels -->
            <div
              class="relative flex text-[11px] text-gray-600 dark:text-gray-300 mb-1"
              :style="{ paddingLeft: '32px' }"
            >
              <div
                v-for="(m, mi) in calendarGrid.months"
                :key="mi"
                class="whitespace-nowrap"
                :style="{
                  position: 'absolute',
                  left: `${32 + m.colStart * 21}px`,
                }"
              >
                {{ m.label }}
              </div>
            </div>

            <div class="flex gap-0 mt-4" data-testid="dashboard-calendar-grid">
              <!-- Day-of-week labels -->
              <div
                class="flex flex-col gap-[3px] mr-1.5 text-[11px] text-gray-600 dark:text-gray-300"
              >
                <div
                  v-for="(lbl, li) in WEEKDAY_LABELS"
                  :key="li"
                  class="h-[18px] flex items-center justify-end pr-1"
                  :style="{ width: '28px' }"
                >
                  {{ lbl }}
                </div>
              </div>

              <!-- Week columns -->
              <div class="flex gap-[3px]">
                <div
                  v-for="w in calendarGrid.weeks"
                  :key="w"
                  class="flex flex-col gap-[3px]"
                >
                  <template v-for="dow in 7" :key="`${w}-${dow}`">
                    <div
                      v-if="
                        calendarGrid.cells.find(
                          (c) =>
                            c.weekIndex === w - 1 && c.dayOfWeek === dow - 1,
                        )
                      "
                      class="w-[18px] h-[18px] rounded-sm"
                      :class="[
                        heatmapColor(
                          calendarGrid.cells.find(
                            (c) =>
                              c.weekIndex === w - 1 && c.dayOfWeek === dow - 1,
                          )!.total_words,
                        ),
                        calendarGrid.cells.find(
                          (c) =>
                            c.weekIndex === w - 1 && c.dayOfWeek === dow - 1,
                        )!.total_words === 0
                          ? 'bg-gray-100 dark:bg-gray-700'
                          : '',
                      ]"
                      :title="
                        heatmapTooltip(
                          calendarGrid.cells.find(
                            (c) =>
                              c.weekIndex === w - 1 && c.dayOfWeek === dow - 1,
                          )!,
                        )
                      "
                      :data-testid="`dashboard-calendar-cell-${calendarGrid.cells.find((c) => c.weekIndex === w - 1 && c.dayOfWeek === dow - 1)!.date}`"
                    ></div>
                    <div v-else class="w-[18px] h-[18px]"></div>
                  </template>
                </div>
              </div>
            </div>

            <!-- Legend -->
            <div
              class="flex items-center gap-2 mt-3 text-[11px] text-gray-600 dark:text-gray-300"
              data-testid="dashboard-calendar-legend"
            >
              <span>Fewer words</span>
              <div
                class="w-[18px] h-[18px] rounded-sm bg-gray-100 dark:bg-gray-700"
              ></div>
              <div
                class="w-[18px] h-[18px] rounded-sm bg-violet-200 dark:bg-violet-300/40"
              ></div>
              <div
                class="w-[18px] h-[18px] rounded-sm bg-violet-400 dark:bg-violet-400/60"
              ></div>
              <div
                class="w-[18px] h-[18px] rounded-sm bg-violet-600 dark:bg-violet-500/80"
              ></div>
              <span>More words</span>
            </div>
          </div>
        </section>

        <!-- Entity Distribution -->
        <section
          v-if="isTileVisible('entity-distribution')"
          :style="{
            order: tileOrder('entity-distribution'),
            gridColumn: tileSpan('entity-distribution'),
          }"
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs px-5 py-4 relative"
          data-testid="dashboard-entity-section"
        >
          <header class="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2
                class="text-sm font-semibold text-gray-800 dark:text-gray-100"
              >
                What I Write About
              </h2>
              <p class="text-xs text-gray-600 dark:text-gray-300">
                Entity mention frequency by type {{ rangePhrase }}.
              </p>
            </div>
            <div
              v-if="store.editingLayout"
              class="flex items-center gap-1 shrink-0"
            >
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Move up"
                @click="store.moveTile('entity-distribution', 'up')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Move down"
                @click="store.moveTile('entity-distribution', 'down')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                :title="
                  store.getTileSpan('entity-distribution') === 1
                    ? 'Full width'
                    : 'Half width'
                "
                data-testid="tile-width-entity-distribution"
                @click="
                  store.setTileWidth(
                    'entity-distribution',
                    store.getTileSpan('entity-distribution') === 1 ? 2 : 1,
                  )
                "
              >
                <svg
                  v-if="store.getTileSpan('entity-distribution') === 2"
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <rect x="2" y="7" width="7" height="6" rx="1" />
                  <rect x="11" y="7" width="7" height="6" rx="1" />
                </svg>
                <svg
                  v-else
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <rect x="2" y="7" width="16" height="6" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Hide chart"
                @click="store.hideTile('entity-distribution')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </header>

          <!-- Entity type tabs -->
          <div
            class="flex flex-wrap gap-2 mb-4"
            data-testid="dashboard-entity-tabs"
          >
            <button
              v-for="t in INSIGHTS_ENTITY_TYPES"
              :key="t"
              type="button"
              class="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
              :class="
                store.entityType === t
                  ? 'bg-violet-500 text-white border-violet-500'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60'
              "
              :data-testid="`dashboard-entity-tab-${t}`"
              :aria-pressed="store.entityType === t"
              @click="onEntityTypeChange(t)"
            >
              {{ entityTypeLabel(t) }}
            </button>
          </div>

          <div
            v-if="store.entityLoading && !store.entityHasLoaded"
            class="py-12 text-center text-gray-600 dark:text-gray-300 text-sm"
            data-testid="dashboard-entity-loading"
          >
            Loading entity data…
          </div>

          <div
            v-else-if="store.entityError"
            class="mb-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
            data-testid="dashboard-entity-error"
          >
            {{ store.entityError }}
          </div>

          <div
            v-else-if="store.entityDistribution.length === 0"
            class="py-8 text-center text-gray-600 dark:text-gray-300 text-sm"
            data-testid="dashboard-entity-empty"
          >
            No {{ store.entityType }} entities found in this range.
          </div>

          <div
            v-else
            class="flex flex-col md:flex-row gap-6"
            data-testid="dashboard-entity-content"
          >
            <div class="h-64 w-64 flex-shrink-0 mx-auto md:mx-0">
              <canvas
                ref="entityChartCanvas"
                data-testid="dashboard-entity-chart"
              ></canvas>
            </div>
            <div>
              <table class="text-sm" data-testid="dashboard-entity-legend">
                <tbody>
                  <tr
                    v-for="(item, i) in visibleEntityItems"
                    :key="item.canonical_name"
                    class="text-gray-700 dark:text-gray-200"
                  >
                    <td class="py-0.5 pr-2">
                      <span
                        class="inline-block w-3 h-3 rounded-sm"
                        :style="{
                          backgroundColor:
                            DOUGHNUT_COLORS[i % DOUGHNUT_COLORS.length],
                        }"
                      ></span>
                    </td>
                    <td class="py-0.5 pr-3 truncate max-w-48">
                      {{ item.canonical_name }}
                    </td>
                    <td
                      class="py-0.5 text-right text-xs text-gray-600 dark:text-gray-300 font-mono tabular-nums"
                    >
                      {{ item.mention_count }}
                    </td>
                  </tr>
                </tbody>
              </table>
              <button
                v-if="hiddenEntityCount > 0"
                type="button"
                class="mt-2 text-xs text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300 font-medium"
                data-testid="dashboard-entity-legend-toggle"
                @click="entityLegendExpanded = !entityLegendExpanded"
              >
                {{
                  entityLegendExpanded
                    ? 'Show fewer'
                    : `Show ${hiddenEntityCount} more`
                }}
              </button>
            </div>
          </div>
        </section>

        <!-- Writing Frequency -->
        <section
          v-if="isTileVisible('writing-frequency')"
          :style="{
            order: tileOrder('writing-frequency'),
            gridColumn: tileSpan('writing-frequency'),
          }"
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs px-5 py-4 relative"
          data-testid="dashboard-writing-chart-card"
        >
          <header class="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2
                class="text-sm font-semibold text-gray-800 dark:text-gray-100"
              >
                Writing frequency
              </h2>
              <p class="text-xs text-gray-600 dark:text-gray-300">
                Entries per {{ store.bin }} {{ rangePhrase }}.
              </p>
            </div>
            <div
              v-if="store.editingLayout"
              class="flex items-center gap-1 shrink-0"
            >
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Move up"
                @click="store.moveTile('writing-frequency', 'up')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Move down"
                @click="store.moveTile('writing-frequency', 'down')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                :title="
                  store.getTileSpan('writing-frequency') === 1
                    ? 'Full width'
                    : 'Half width'
                "
                data-testid="tile-width-writing-frequency"
                @click="
                  store.setTileWidth(
                    'writing-frequency',
                    store.getTileSpan('writing-frequency') === 1 ? 2 : 1,
                  )
                "
              >
                <svg
                  v-if="store.getTileSpan('writing-frequency') === 2"
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <rect x="2" y="7" width="7" height="6" rx="1" />
                  <rect x="11" y="7" width="7" height="6" rx="1" />
                </svg>
                <svg
                  v-else
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <rect x="2" y="7" width="16" height="6" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Hide chart"
                @click="store.hideTile('writing-frequency')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </header>
          <div class="h-64 relative">
            <canvas
              ref="writingChartCanvas"
              data-testid="dashboard-writing-chart"
            ></canvas>
          </div>
        </section>

        <!-- Word Count -->
        <section
          v-if="isTileVisible('word-count')"
          :style="{
            order: tileOrder('word-count'),
            gridColumn: tileSpan('word-count'),
          }"
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs px-5 py-4 relative"
          data-testid="dashboard-word-chart-card"
        >
          <header class="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2
                class="text-sm font-semibold text-gray-800 dark:text-gray-100"
              >
                Word count
              </h2>
              <p class="text-xs text-gray-600 dark:text-gray-300">
                Total words per {{ store.bin }} {{ rangePhrase }}.
              </p>
            </div>
            <div
              v-if="store.editingLayout"
              class="flex items-center gap-1 shrink-0"
            >
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Move up"
                @click="store.moveTile('word-count', 'up')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Move down"
                @click="store.moveTile('word-count', 'down')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                :title="
                  store.getTileSpan('word-count') === 1
                    ? 'Full width'
                    : 'Half width'
                "
                data-testid="tile-width-word-count"
                @click="
                  store.setTileWidth(
                    'word-count',
                    store.getTileSpan('word-count') === 1 ? 2 : 1,
                  )
                "
              >
                <svg
                  v-if="store.getTileSpan('word-count') === 2"
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <rect x="2" y="7" width="7" height="6" rx="1" />
                  <rect x="11" y="7" width="7" height="6" rx="1" />
                </svg>
                <svg
                  v-else
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <rect x="2" y="7" width="16" height="6" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Hide chart"
                @click="store.hideTile('word-count')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </header>
          <div class="h-64 relative">
            <canvas
              ref="wordChartCanvas"
              data-testid="dashboard-word-chart"
            ></canvas>
          </div>
        </section>

        <!-- Mood Trends -->
        <section
          v-if="store.moodScoringEnabled && isTileVisible('mood-trends')"
          :style="{
            order: tileOrder('mood-trends'),
            gridColumn: tileSpan('mood-trends'),
          }"
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs px-5 py-4 relative"
          data-testid="dashboard-mood-chart-card"
        >
          <header class="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                class="text-sm font-semibold text-gray-800 dark:text-gray-100"
              >
                Mood Trends
              </h2>
              <p class="text-xs text-gray-600 dark:text-gray-300">
                Average score per {{ store.bin }} {{ rangePhrase }}, with
                min/max variance bands. Click a data point to see contributing
                entries.
              </p>
            </div>
            <div class="flex items-center gap-2">
              <div v-if="store.editingLayout" class="flex items-center gap-1">
                <button
                  type="button"
                  class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  title="Move up"
                  @click="store.moveTile('mood-trends', 'up')"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  title="Move down"
                  @click="store.moveTile('mood-trends', 'down')"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  :title="
                    store.getTileSpan('mood-trends') === 1
                      ? 'Full width'
                      : 'Half width'
                  "
                  data-testid="tile-width-mood-trends"
                  @click="
                    store.setTileWidth(
                      'mood-trends',
                      store.getTileSpan('mood-trends') === 1 ? 2 : 1,
                    )
                  "
                >
                  <svg
                    v-if="store.getTileSpan('mood-trends') === 2"
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <rect x="2" y="7" width="7" height="6" rx="1" />
                    <rect x="11" y="7" width="7" height="6" rx="1" />
                  </svg>
                  <svg
                    v-else
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <rect x="2" y="7" width="16" height="6" rx="1" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  title="Hide chart"
                  @click="store.hideTile('mood-trends')"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </header>

          <!-- Dimension toggles, grouped per mood-dimensions.toml comment -->
          <div
            v-if="store.moodDimensions.length"
            class="space-y-1.5 mb-3"
            role="group"
            aria-label="Mood dimensions"
            data-testid="dashboard-mood-toggles"
          >
            <div
              v-for="g in groupedMoodDimensions"
              :key="g.group.id"
              class="flex flex-wrap items-center gap-2"
            >
              <button
                v-if="g.group.label"
                type="button"
                class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[0.65rem] font-semibold uppercase tracking-wide border transition-colors text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-700/40"
                :data-testid="`dashboard-mood-group-${g.group.id}`"
                :aria-pressed="
                  store.moodGroupSelectionState(g.group.members) === 'all'
                    ? 'true'
                    : store.moodGroupSelectionState(g.group.members) === 'some'
                      ? 'mixed'
                      : 'false'
                "
                @click="store.toggleMoodGroup(g.group.members)"
              >
                <span
                  class="inline-block w-2.5 h-2.5 rounded-full border border-gray-400 dark:border-gray-500"
                  :class="{
                    'bg-violet-500 border-violet-500':
                      store.moodGroupSelectionState(g.group.members) === 'all',
                    'bg-gradient-to-r from-violet-500 from-50% to-transparent to-50% border-violet-500':
                      store.moodGroupSelectionState(g.group.members) === 'some',
                  }"
                  aria-hidden="true"
                ></span>
                {{ g.group.label }}
              </button>
              <button
                v-for="d in g.members"
                :key="d.name"
                type="button"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
                :class="
                  store.isMoodDimensionVisible(d.name)
                    ? 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700/60'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 opacity-40'
                "
                :data-testid="`dashboard-mood-toggle-${d.name}`"
                :aria-pressed="store.isMoodDimensionVisible(d.name)"
                @click="toggleDimension(d.name)"
              >
                <span
                  class="inline-block w-2 h-2 rounded-full"
                  :style="{
                    backgroundColor:
                      MOOD_LINE_COLORS[
                        (moodDimensionIndex.get(d.name) ?? 0) %
                          MOOD_LINE_COLORS.length
                      ],
                  }"
                  aria-hidden="true"
                ></span>
                {{ displayLabel(d) }}
                <span
                  class="text-gray-600 dark:text-gray-300 font-mono text-[0.65rem]"
                  >{{ d.scale_type === 'bipolar' ? '±1' : '0..1' }}</span
                >
              </button>
            </div>
            <div class="flex justify-end">
              <button
                type="button"
                class="px-1.5 py-0.5 rounded text-[0.65rem] uppercase tracking-wide text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40 disabled:opacity-30 disabled:cursor-default"
                :disabled="store.selectedMoodDimensions.size === 0"
                data-testid="dashboard-mood-show-all"
                @click="store.showAllMoodDimensions()"
              >
                All
              </button>
            </div>
          </div>

          <div
            v-if="store.moodLoading && !store.moodHasLoaded"
            class="py-12 text-center text-gray-600 dark:text-gray-300 text-sm"
            data-testid="dashboard-mood-loading"
          >
            Loading mood data…
          </div>

          <div
            v-else-if="store.moodError"
            class="mb-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
            data-testid="dashboard-mood-error"
          >
            {{ store.moodError }}
          </div>

          <div
            v-else-if="!store.hasMoodData"
            class="py-8 text-center text-gray-600 dark:text-gray-300 text-sm"
            data-testid="dashboard-mood-empty"
          >
            <p class="font-medium text-gray-700 dark:text-gray-200 mb-1">
              No mood data in this range yet
            </p>
            <p class="text-xs">
              Run
              <code class="font-mono text-xs">journal backfill-mood</code>
              to score historical entries, or ingest a new entry with mood
              scoring enabled.
            </p>
          </div>

          <div
            v-else
            class="h-72 relative"
            data-testid="dashboard-mood-chart-container"
          >
            <canvas
              ref="moodChartCanvas"
              data-testid="dashboard-mood-chart"
            ></canvas>
          </div>

          <!-- Drill-down panel -->
          <div
            v-if="store.drillPeriod"
            class="mt-4 border-t border-gray-200 dark:border-gray-700/60 pt-4"
            data-testid="dashboard-drilldown"
          >
            <div class="flex items-center justify-between mb-3">
              <h3
                class="text-sm font-semibold text-gray-800 dark:text-gray-100"
              >
                {{ drillDimensionLabel }} — {{ formatDate(store.drillPeriod) }}
              </h3>
              <button
                type="button"
                class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                data-testid="dashboard-drilldown-close"
                @click="store.clearDrillDown()"
              >
                Close
              </button>
            </div>

            <div
              v-if="store.drillLoading"
              class="py-4 text-center text-gray-600 dark:text-gray-300 text-sm"
            >
              Loading entries…
            </div>

            <div
              v-else-if="store.drillError"
              class="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
            >
              {{ store.drillError }}
            </div>

            <div
              v-else-if="store.drillEntries.length === 0"
              class="py-4 text-center text-gray-600 dark:text-gray-300 text-sm"
            >
              No scored entries for this period.
            </div>

            <div v-else class="overflow-x-auto">
              <table
                class="w-full text-sm"
                data-testid="dashboard-drilldown-table"
              >
                <thead>
                  <tr
                    class="text-left text-xs text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700/60"
                  >
                    <th class="pb-2 pr-4 font-medium">Date</th>
                    <th class="pb-2 pr-4 font-medium">Score</th>
                    <th class="pb-2 font-medium">Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="entry in store.drillEntries"
                    :key="entry.entry_id"
                    class="border-b border-gray-100 dark:border-gray-700/40 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                    @click="navigateToEntry(entry.entry_id)"
                  >
                    <td
                      class="py-2 pr-4 whitespace-nowrap text-gray-700 dark:text-gray-200"
                    >
                      {{ formatDate(entry.entry_date) }}
                    </td>
                    <td
                      class="py-2 pr-4 whitespace-nowrap font-mono text-xs"
                      :class="
                        drillEntryDisplayScore(entry.score) >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      "
                    >
                      {{ formatScore(drillEntryDisplayScore(entry.score)) }}
                    </td>
                    <td class="py-2 text-gray-600 dark:text-gray-300 text-xs">
                      {{ entry.rationale || 'No rationale available' }}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p class="mt-2 text-xs text-gray-600 dark:text-gray-300">
                Note: Entries scored before the rationale feature will show "No
                rationale available". Run
                <code class="font-mono">journal backfill-mood --force</code> to
                populate rationales for all entries.
              </p>
            </div>
          </div>
        </section>

        <!-- Topic Trends -->
        <section
          v-if="isTileVisible('topic-trends')"
          :style="{
            order: tileOrder('topic-trends'),
            gridColumn: tileSpan('topic-trends'),
          }"
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs px-5 py-4 relative"
          data-testid="dashboard-entity-trends-section"
        >
          <header class="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2
                class="text-sm font-semibold text-gray-800 dark:text-gray-100"
              >
                Topic Trends
              </h2>
              <p class="text-xs text-gray-600 dark:text-gray-300">
                Entity mentions {{ rangePhrase }}, grouped per {{ store.bin }}.
              </p>
            </div>
            <div
              v-if="store.editingLayout"
              class="flex items-center gap-1 shrink-0"
            >
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Move up"
                @click="store.moveTile('topic-trends', 'up')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Move down"
                @click="store.moveTile('topic-trends', 'down')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                :title="
                  store.getTileSpan('topic-trends') === 1
                    ? 'Full width'
                    : 'Half width'
                "
                data-testid="tile-width-topic-trends"
                @click="
                  store.setTileWidth(
                    'topic-trends',
                    store.getTileSpan('topic-trends') === 1 ? 2 : 1,
                  )
                "
              >
                <svg
                  v-if="store.getTileSpan('topic-trends') === 2"
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <rect x="2" y="7" width="7" height="6" rx="1" />
                  <rect x="11" y="7" width="7" height="6" rx="1" />
                </svg>
                <svg
                  v-else
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <rect x="2" y="7" width="16" height="6" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Hide chart"
                @click="store.hideTile('topic-trends')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </header>

          <!-- Entity type tabs -->
          <div
            class="flex flex-wrap gap-2 mb-4"
            data-testid="dashboard-entity-trends-tabs"
          >
            <button
              v-for="t in INSIGHTS_ENTITY_TYPES"
              :key="t"
              type="button"
              class="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
              :class="
                store.entityTrendsType === t
                  ? 'bg-violet-500 text-white border-violet-500'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60'
              "
              :data-testid="`dashboard-entity-trends-tab-${t}`"
              :aria-pressed="store.entityTrendsType === t"
              @click="onEntityTrendsTypeChange(t)"
            >
              {{ entityTypeLabel(t) }}
            </button>
          </div>

          <div
            v-if="store.entityTrendsLoading && !store.entityTrendsHasLoaded"
            class="py-12 text-center text-gray-600 dark:text-gray-300 text-sm"
            data-testid="dashboard-entity-trends-loading"
          >
            Loading entity trends…
          </div>

          <div
            v-else-if="store.entityTrendsError"
            class="mb-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
            data-testid="dashboard-entity-trends-error"
          >
            {{ store.entityTrendsError }}
          </div>

          <div
            v-else-if="store.entityTrendEntities.length === 0"
            class="py-8 text-center text-gray-600 dark:text-gray-300 text-sm"
            data-testid="dashboard-entity-trends-empty"
          >
            No {{ store.entityTrendsType }} entity trends found in this range.
          </div>

          <template v-else>
            <!-- Entity toggles -->
            <div
              class="flex flex-wrap items-center gap-2 mb-3"
              role="group"
              aria-label="Topic trends entities"
              data-testid="dashboard-entity-trends-toggles"
            >
              <button
                v-for="entity in store.entityTrendEntities"
                :key="entity"
                type="button"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
                :class="
                  store.hiddenEntityTrends.has(entity)
                    ? 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 opacity-40'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700/60'
                "
                :data-testid="`dashboard-entity-trends-toggle-${entity}`"
                :aria-pressed="!store.hiddenEntityTrends.has(entity)"
                @click="store.toggleEntityTrend(entity)"
              >
                <span
                  class="inline-block w-2 h-2 rounded-full"
                  :style="{ backgroundColor: entityColorFor(entity) }"
                  aria-hidden="true"
                ></span>
                {{ entity }}
              </button>
              <span
                class="ml-auto inline-flex items-center gap-1 text-[0.65rem] uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >
                <button
                  type="button"
                  class="px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700/40 disabled:opacity-30 disabled:cursor-default"
                  :disabled="store.hiddenEntityTrends.size === 0"
                  data-testid="dashboard-entity-trends-show-all"
                  @click="store.showAllEntityTrends()"
                >
                  All
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  class="px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700/40 disabled:opacity-30 disabled:cursor-default"
                  :disabled="allEntityTrendsHidden"
                  data-testid="dashboard-entity-trends-hide-all"
                  @click="store.hideAllEntityTrends()"
                >
                  None
                </button>
              </span>
            </div>

            <div
              v-if="allEntityTrendsHidden"
              class="py-8 text-center text-gray-600 dark:text-gray-300 text-sm"
              data-testid="dashboard-entity-trends-all-hidden"
            >
              All entities hidden.
              <button
                type="button"
                class="ml-1 text-violet-600 dark:text-violet-400 hover:underline"
                data-testid="dashboard-entity-trends-all-hidden-show-all"
                @click="store.showAllEntityTrends()"
              >
                Show all
              </button>
            </div>

            <div
              v-else
              class="h-72 relative"
              data-testid="dashboard-entity-trends-content"
            >
              <canvas
                ref="entityTrendsChartCanvas"
                data-testid="dashboard-entity-trends-chart"
              ></canvas>
            </div>
          </template>
        </section>

        <!-- Mood-Entity Correlation -->
        <section
          v-if="
            store.moodScoringEnabled && isTileVisible('mood-entity-correlation')
          "
          :style="{
            order: tileOrder('mood-entity-correlation'),
            gridColumn: tileSpan('mood-entity-correlation'),
          }"
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs px-5 py-4 relative"
          data-testid="dashboard-mood-correlation-section"
        >
          <header class="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2
                class="text-sm font-semibold text-gray-800 dark:text-gray-100"
              >
                Mood by Entity
              </h2>
              <p class="text-xs text-gray-600 dark:text-gray-300">
                Average mood score per entity {{ rangePhrase }}. Dashed line
                shows overall average.
              </p>
            </div>
            <div
              v-if="store.editingLayout"
              class="flex items-center gap-1 shrink-0"
            >
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Move up"
                @click="store.moveTile('mood-entity-correlation', 'up')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Move down"
                @click="store.moveTile('mood-entity-correlation', 'down')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                :title="
                  store.getTileSpan('mood-entity-correlation') === 1
                    ? 'Full width'
                    : 'Half width'
                "
                data-testid="tile-width-mood-entity-correlation"
                @click="
                  store.setTileWidth(
                    'mood-entity-correlation',
                    store.getTileSpan('mood-entity-correlation') === 1 ? 2 : 1,
                  )
                "
              >
                <svg
                  v-if="store.getTileSpan('mood-entity-correlation') === 2"
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <rect x="2" y="7" width="7" height="6" rx="1" />
                  <rect x="11" y="7" width="7" height="6" rx="1" />
                </svg>
                <svg
                  v-else
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <rect x="2" y="7" width="16" height="6" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Hide chart"
                @click="store.hideTile('mood-entity-correlation')"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </header>

          <!-- Dimension selector -->
          <div class="flex flex-col gap-3 mb-4">
            <div>
              <label
                class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
              >
                Dimension
              </label>
              <div
                class="flex flex-wrap gap-2"
                data-testid="dashboard-mood-correlation-dimensions"
              >
                <button
                  v-for="d in store.moodDimensions"
                  :key="d.name"
                  type="button"
                  class="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                  :class="
                    store.moodCorrelationDimension === d.name
                      ? 'bg-violet-500 text-white border-violet-500'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60'
                  "
                  :data-testid="`dashboard-mood-correlation-dim-${d.name}`"
                  :aria-pressed="store.moodCorrelationDimension === d.name"
                  @click="onMoodCorrelationDimensionChange(d.name)"
                >
                  {{ displayLabel(d) }}
                </button>
              </div>
            </div>

            <div>
              <label
                class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
              >
                Entity type
              </label>
              <div
                class="flex flex-wrap gap-2"
                data-testid="dashboard-mood-correlation-types"
              >
                <button
                  v-for="t in INSIGHTS_ENTITY_TYPES"
                  :key="t"
                  type="button"
                  class="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                  :class="
                    store.moodCorrelationType === t
                      ? 'bg-violet-500 text-white border-violet-500'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60'
                  "
                  :data-testid="`dashboard-mood-correlation-type-${t}`"
                  :aria-pressed="store.moodCorrelationType === t"
                  @click="onMoodCorrelationTypeChange(t)"
                >
                  {{ entityTypeLabel(t) }}
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="
              store.moodCorrelationLoading && !store.moodCorrelationHasLoaded
            "
            class="py-12 text-center text-gray-600 dark:text-gray-300 text-sm"
            data-testid="dashboard-mood-correlation-loading"
          >
            Loading mood correlation…
          </div>

          <div
            v-else-if="store.moodCorrelationError"
            class="mb-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
            data-testid="dashboard-mood-correlation-error"
          >
            {{ store.moodCorrelationError }}
          </div>

          <div
            v-else-if="store.moodCorrelationItems.length === 0"
            class="py-8 text-center text-gray-600 dark:text-gray-300 text-sm"
            data-testid="dashboard-mood-correlation-empty"
          >
            No mood-entity data for this selection.
          </div>

          <div
            v-else
            class="h-80 relative"
            data-testid="dashboard-mood-correlation-content"
          >
            <canvas
              ref="moodCorrelationChartCanvas"
              data-testid="dashboard-mood-correlation-chart"
            ></canvas>
          </div>
        </section>
      </div>
      <!-- end dashboard tiles grid -->
    </div>
  </div>
</template>
