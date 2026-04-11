<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Chart } from 'chart.js'
import { useDashboardStore } from '@/stores/dashboard'
import {
  DASHBOARD_BINS,
  DASHBOARD_RANGES,
  type DashboardBin,
  type DashboardRange,
} from '@/types/dashboard'
import { getChartColors } from '@/utils/chartjs-config'
import { adjustColorOpacity } from '@/utils/mosaic'

// The side-effect import in chartjs-config.ts registers the line
// chart components with Chart.js. Referencing the named export
// here prevents the bundler from tree-shaking the side-effect
// import away when this view is lazy-loaded by the router.
void getChartColors

const store = useDashboardStore()

// Minimum corpus threshold for showing the charts. Below this
// number of entries in the active range we show an explicit
// "not enough data yet" message — following the user's
// "explicit is better than implicit" rule. Hiding charts
// silently or showing a 1-point chart is both ambiguous and
// embarrassing.
const MIN_ENTRIES_FOR_CHARTS = 5

const writingChartCanvas = ref<HTMLCanvasElement | null>(null)
const wordChartCanvas = ref<HTMLCanvasElement | null>(null)
let writingChart: Chart | null = null
let wordChart: Chart | null = null

/** Human-readable label for a DashboardRange option. */
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

/** Human-readable label for a DashboardBin option. */
function binLabel(b: DashboardBin): string {
  return b.charAt(0).toUpperCase() + b.slice(1)
}

const showCharts = computed(
  () => store.totalEntriesInRange >= MIN_ENTRIES_FOR_CHARTS,
)

const labels = computed(() => store.bins.map((b) => b.bin_start))
const entryCountSeries = computed(() => store.bins.map((b) => b.entry_count))
const wordCountSeries = computed(() => store.bins.map((b) => b.total_words))

/**
 * Create or update the two charts. Called on initial data load
 * and whenever the bins array changes. We `destroy()` and
 * recreate rather than mutating `chart.data` because the axis
 * labels change with the bin width and Chart.js handles a fresh
 * instance more predictably than an in-place update.
 */
function renderCharts(): void {
  if (!showCharts.value) {
    // If the user zooms back down below the threshold (e.g.
    // switches to "last month" on an empty corpus), make sure
    // any previous chart instances are torn down so Chart.js
    // doesn't retain the old canvas context.
    writingChart?.destroy()
    writingChart = null
    wordChart?.destroy()
    wordChart = null
    return
  }
  const colors = getChartColors()
  const violet = '#8b5cf6' // matches Mosaic accent for highlights
  const translucent = adjustColorOpacity(violet, 0.15)

  // Writing frequency
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
            ticks: {
              color: colors.textColor.light,
              precision: 0,
            },
          },
        },
      },
    })
  }

  // Word count
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

watch(
  () => store.bins,
  () => renderCharts(),
  { deep: false },
)

onMounted(async () => {
  await store.loadWritingStats()
  renderCharts()
})

// Dispose any Chart.js instances on unmount so canvas contexts
// don't leak across route changes.
import { onBeforeUnmount } from 'vue'
onBeforeUnmount(() => {
  writingChart?.destroy()
  wordChart?.destroy()
  writingChart = null
  wordChart = null
})

async function onRangeChange(r: DashboardRange): Promise<void> {
  await store.loadWritingStats({ range: r })
}

async function onBinChange(b: DashboardBin): Promise<void> {
  await store.loadWritingStats({ bin: b })
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

    <!-- Filter bar -->
    <div
      class="mb-6 flex flex-wrap items-end gap-6"
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

    <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
  </div>
</template>
