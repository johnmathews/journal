<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Chart } from 'chart.js'
import { useDashboardStore } from '@/stores/dashboard'
import {
  DASHBOARD_BINS,
  DASHBOARD_RANGES,
  type DashboardBin,
  type DashboardRange,
} from '@/types/dashboard'
import {
  INSIGHTS_ENTITY_TYPES,
  type InsightsEntityType,
} from '@/types/insights'
import { getChartColors } from '@/utils/chartjs-config'
import { adjustColorOpacity } from '@/utils/mosaic'
import BatchJobModal from '@/components/BatchJobModal.vue'

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
let writingChart: Chart | null = null
let wordChart: Chart | null = null
let moodChart: Chart | null = null
let entityChart: Chart | null = null
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

const labels = computed(() => store.bins.map((b) => b.bin_start))
const entryCountSeries = computed(() => store.bins.map((b) => b.entry_count))
const wordCountSeries = computed(() => store.bins.map((b) => b.total_words))

// --- Writing + word count charts ---

function renderCharts(): void {
  if (!showCharts.value) {
    writingChart?.destroy()
    writingChart = null
    wordChart?.destroy()
    wordChart = null
    return
  }
  const colors = getChartColors()
  const violet = '#8b5cf6'
  const translucent = adjustColorOpacity(violet, 0.15)

  if (writingChartCanvas.value) {
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

  if (wordChartCanvas.value) {
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
}

// --- Mood chart with variance bands ---

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
    series[d.name] = periods.map(
      (p) => byPeriod.get(p)?.get(d.name)?.avg ?? null,
    )
    minSeries[d.name] = periods.map(
      (p) => byPeriod.get(p)?.get(d.name)?.min ?? null,
    )
    maxSeries[d.name] = periods.map(
      (p) => byPeriod.get(p)?.get(d.name)?.max ?? null,
    )
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
    if (store.hiddenMoodDimensions.has(d.name)) continue
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

// --- Watchers ---

watch(
  () => store.bins,
  () => renderCharts(),
  { deep: false },
)

watch(
  [() => store.moodBins, () => store.hiddenMoodDimensions],
  () => renderMoodChart(),
  { deep: false },
)

watch(
  () => store.entityDistribution,
  () => {
    entityLegendExpanded.value = false
    renderEntityChart()
  },
  { deep: false },
)

// --- Lifecycle ---

onMounted(async () => {
  await Promise.all([store.loadWritingStats(), store.loadMoodDimensions()])
  renderCharts()
  const promises: Promise<void>[] = [store.loadEntityDistribution()]
  if (store.moodScoringEnabled) {
    promises.push(store.loadMoodTrends())
  }
  await Promise.all(promises)
  renderMoodChart()
  renderEntityChart()
})

onBeforeUnmount(() => {
  writingChart?.destroy()
  wordChart?.destroy()
  moodChart?.destroy()
  entityChart?.destroy()
  writingChart = null
  wordChart = null
  moodChart = null
  entityChart = null
})

// --- Event handlers ---

async function onRangeChange(r: DashboardRange): Promise<void> {
  store.clearDrillDown()
  const promises: Promise<void>[] = [
    store.loadWritingStats({ range: r }),
    store.loadEntityDistribution(),
  ]
  if (store.moodScoringEnabled) {
    promises.push(store.loadMoodTrends({ range: r }))
  }
  await Promise.all(promises)
}

async function onBinChange(b: DashboardBin): Promise<void> {
  store.clearDrillDown()
  const promises: Promise<void>[] = [store.loadWritingStats({ bin: b })]
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

const showMoodBackfillModal = ref(false)

async function onMoodJobSucceeded(): Promise<void> {
  await store.loadMoodTrends()
  renderMoodChart()
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
    </div>

    <!-- Filter bar (sticky so it stays visible while scrolling) -->
    <div
      class="mb-6 flex flex-wrap items-end gap-6 sticky top-16 z-10 bg-white dark:bg-gray-800 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700/60 shadow-xs px-5 py-3"
      data-testid="dashboard-filters"
    >
      <div>
        <label
          class="block text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold mb-1"
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
          class="block text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold mb-1"
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
      class="py-16 text-center text-gray-500 dark:text-gray-400"
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
      class="py-16 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
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
      <p class="text-xs mt-2 text-gray-400 dark:text-gray-500">
        Try widening the range or ingesting more entries.
      </p>
    </div>

    <div v-else>
      <!-- Writing frequency + word count -->
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs px-5 py-4"
          data-testid="dashboard-writing-chart-card"
        >
          <header class="mb-3">
            <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Writing frequency
            </h2>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Entries per {{ store.bin }}
            </p>
          </header>
          <div class="h-64 relative">
            <canvas
              ref="writingChartCanvas"
              data-testid="dashboard-writing-chart"
            ></canvas>
          </div>
        </section>
        <section
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs px-5 py-4"
          data-testid="dashboard-word-chart-card"
        >
          <header class="mb-3">
            <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Word count
            </h2>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Total words per {{ store.bin }}
            </p>
          </header>
          <div class="h-64 relative">
            <canvas
              ref="wordChartCanvas"
              data-testid="dashboard-word-chart"
            ></canvas>
          </div>
        </section>
      </div>

      <!-- Mood chart with variance bands -->
      <section
        v-if="store.moodScoringEnabled"
        class="mt-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs px-5 py-4"
        data-testid="dashboard-mood-chart-card"
      >
        <header class="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Mood Trends
            </h2>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Average score per {{ store.bin }} with min/max variance bands.
              Click a data point to see contributing entries.
            </p>
          </div>
          <button
            type="button"
            class="btn-sm bg-violet-500 hover:bg-violet-600 text-white"
            data-testid="run-mood-backfill-button"
            @click="showMoodBackfillModal = true"
          >
            Run mood backfill
          </button>
        </header>

        <!-- Dimension toggles -->
        <div
          v-if="store.moodDimensions.length"
          class="flex flex-wrap gap-2 mb-3"
          role="group"
          aria-label="Mood dimensions"
          data-testid="dashboard-mood-toggles"
        >
          <button
            v-for="(d, i) in store.moodDimensions"
            :key="d.name"
            type="button"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
            :class="
              store.hiddenMoodDimensions.has(d.name)
                ? 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700/60 opacity-40'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700/60'
            "
            :data-testid="`dashboard-mood-toggle-${d.name}`"
            :aria-pressed="!store.hiddenMoodDimensions.has(d.name)"
            @click="toggleDimension(d.name)"
          >
            <span
              class="inline-block w-2 h-2 rounded-full"
              :style="{
                backgroundColor: MOOD_LINE_COLORS[i % MOOD_LINE_COLORS.length],
              }"
              aria-hidden="true"
            ></span>
            {{ d.positive_pole }}
            <span
              class="text-gray-400 dark:text-gray-500 font-mono text-[0.65rem]"
              >{{ d.scale_type === 'bipolar' ? '±1' : '0..1' }}</span
            >
          </button>
        </div>

        <div
          v-if="store.moodLoading && !store.moodHasLoaded"
          class="py-12 text-center text-gray-500 dark:text-gray-400 text-sm"
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
          class="py-8 text-center text-gray-500 dark:text-gray-400 text-sm"
          data-testid="dashboard-mood-empty"
        >
          <p class="font-medium text-gray-700 dark:text-gray-200 mb-1">
            No mood data in this range yet
          </p>
          <p class="text-xs">
            Run
            <code class="font-mono text-xs">journal backfill-mood</code>
            to score historical entries, or ingest a new entry with mood scoring
            enabled.
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
            <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {{ store.drillDimension }} — {{ formatDate(store.drillPeriod) }}
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
            class="py-4 text-center text-gray-500 dark:text-gray-400 text-sm"
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
            class="py-4 text-center text-gray-500 dark:text-gray-400 text-sm"
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
                  class="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700/60"
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
                      entry.score >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    "
                  >
                    {{ formatScore(entry.score) }}
                  </td>
                  <td class="py-2 text-gray-600 dark:text-gray-300 text-xs">
                    {{ entry.rationale || 'No rationale available' }}
                  </td>
                </tr>
              </tbody>
            </table>
            <p class="mt-2 text-xs text-gray-400 dark:text-gray-500">
              Note: Entries scored before the rationale feature will show "No
              rationale available". Run
              <code class="font-mono">journal backfill-mood --force</code> to
              populate rationales for all entries.
            </p>
          </div>
        </div>
      </section>

      <!-- Entity Distribution -->
      <section
        class="mt-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs px-5 py-4"
        data-testid="dashboard-entity-section"
      >
        <header class="mb-3">
          <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
            What I Write About
          </h2>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Entity mention frequency by type in the selected range.
          </p>
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
          class="py-12 text-center text-gray-500 dark:text-gray-400 text-sm"
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
          class="py-8 text-center text-gray-500 dark:text-gray-400 text-sm"
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
                    class="py-0.5 text-right text-xs text-gray-400 dark:text-gray-500 font-mono tabular-nums"
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
    </div>

    <BatchJobModal
      v-model="showMoodBackfillModal"
      title="Run mood backfill"
      job-kind="mood_backfill"
      @job-succeeded="onMoodJobSucceeded"
    />
  </div>
</template>
