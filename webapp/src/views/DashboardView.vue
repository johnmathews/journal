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
import BatchJobModal from '@/components/BatchJobModal.vue'

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
const moodChartCanvas = ref<HTMLCanvasElement | null>(null)
let writingChart: Chart | null = null
let wordChart: Chart | null = null
let moodChart: Chart | null = null

// Fixed palette for mood lines — cycled by dimension index so
// reordering facets in the TOML file produces a stable colour
// assignment. 8 colours is plenty for the 7-facet starting set
// plus one headroom; adding a 9th facet wraps around.
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

/**
 * Pivot the flat `{period, dimension, avg_score, entry_count}`
 * rows returned by /api/dashboard/mood-trends into a
 * `{periods: [], series: {dim: [value | null, ...]}}` shape
 * suitable for Chart.js multi-line rendering. Missing values
 * (period × dimension combinations the server didn't return)
 * are filled with `null` so Chart.js draws a gap rather than
 * connecting across missing data.
 *
 * Periods come out sorted chronologically (ISO dates sort
 * lexicographically). Dimensions follow the order of the
 * loaded dimension config so the chart colours are stable
 * across bin changes.
 */
function pivotMoodBins(): {
  periods: string[]
  series: Record<string, (number | null)[]>
} {
  const byPeriod: Map<string, Map<string, number>> = new Map()
  for (const b of store.moodBins) {
    let periodRow = byPeriod.get(b.period)
    if (!periodRow) {
      periodRow = new Map()
      byPeriod.set(b.period, periodRow)
    }
    periodRow.set(b.dimension, b.avg_score)
  }
  const periods = Array.from(byPeriod.keys()).sort()
  const series: Record<string, (number | null)[]> = {}
  for (const d of store.moodDimensions) {
    series[d.name] = periods.map((p) => byPeriod.get(p)?.get(d.name) ?? null)
  }
  return { periods, series }
}

/**
 * Create or update the mood chart. Called on initial load, on
 * bin/range change, and whenever the dimension-visibility
 * toggles flip. Destroys and recreates the instance on every
 * call — same rationale as the writing/word charts.
 *
 * Y-axis is fixed to `[-1, +1]` regardless of the mix of
 * bipolar and unipolar facets. Unipolar lines simply never
 * dip below zero, which is visually informative (you can see
 * "hovered near 0" distinct from "went negative"). Plotting
 * unipolar on a 0-to-1 sub-axis would fragment the visual and
 * hide any cross-facet correlation, which is the whole point
 * of the chart.
 */
function renderMoodChart(): void {
  if (!moodChartCanvas.value) return
  moodChart?.destroy()

  // No data to plot — the template shows the empty-state card
  // and we don't instantiate Chart.js at all.
  if (!store.hasMoodData) {
    moodChart = null
    return
  }

  const colors = getChartColors()
  const { periods, series } = pivotMoodBins()

  const datasets = store.moodDimensions
    .filter((d) => !store.hiddenMoodDimensions.has(d.name))
    .map((d, i) => {
      const color = MOOD_LINE_COLORS[i % MOOD_LINE_COLORS.length]
      return {
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
      }
    })

  moodChart = new Chart(moodChartCanvas.value, {
    type: 'line',
    data: {
      labels: periods,
      datasets,
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
          min: -1,
          max: 1,
          grid: { color: colors.gridColor.light },
          ticks: {
            color: colors.textColor.light,
            stepSize: 0.5,
          },
        },
      },
    },
  })
}

watch(
  () => store.bins,
  () => renderCharts(),
  { deep: false },
)

// Render mood chart when the data or the toggle set changes.
// `deep: false` on moodBins is fine because the store always
// replaces the array on reload rather than mutating in place.
watch(
  [() => store.moodBins, () => store.hiddenMoodDimensions],
  () => renderMoodChart(),
  { deep: false },
)

onMounted(async () => {
  // Load writing stats + mood dimensions in parallel on first
  // mount. Mood trends load happens after the dimensions arrive
  // so the chart has colour/label metadata ready before data.
  await Promise.all([store.loadWritingStats(), store.loadMoodDimensions()])
  renderCharts()
  // Only fire the mood-trends request when scoring is actually
  // configured on the server — an empty dimensions list is the
  // signal that `JOURNAL_ENABLE_MOOD_SCORING=false` and there's
  // nothing to plot.
  if (store.moodScoringEnabled) {
    await store.loadMoodTrends()
    renderMoodChart()
  }
})

// Dispose any Chart.js instances on unmount so canvas contexts
// don't leak across route changes.
import { onBeforeUnmount } from 'vue'
onBeforeUnmount(() => {
  writingChart?.destroy()
  wordChart?.destroy()
  moodChart?.destroy()
  writingChart = null
  wordChart = null
  moodChart = null
})

async function onRangeChange(r: DashboardRange): Promise<void> {
  // Fire both requests in parallel — the range + bin controls
  // apply to both charts, and running them sequentially would
  // double the wait on every click.
  const promises: Promise<void>[] = [store.loadWritingStats({ range: r })]
  if (store.moodScoringEnabled) {
    promises.push(store.loadMoodTrends({ range: r }))
  }
  await Promise.all(promises)
}

async function onBinChange(b: DashboardBin): Promise<void> {
  const promises: Promise<void>[] = [store.loadWritingStats({ bin: b })]
  if (store.moodScoringEnabled) {
    promises.push(store.loadMoodTrends({ bin: b }))
  }
  await Promise.all(promises)
}

function toggleDimension(name: string): void {
  store.toggleMoodDimension(name)
  // renderMoodChart fires via the watcher on hiddenMoodDimensions.
}

// Mood backfill modal. Fires a background job that re-scores
// journal entries so the mood chart picks up dimensions added
// to the config after older entries were ingested. On success
// we reload the mood trends so the new rows appear in the chart.
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

    <div v-else>
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

      <!-- Mood chart -->
      <section
        v-if="store.moodScoringEnabled"
        class="mt-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs px-5 py-4"
        data-testid="dashboard-mood-chart-card"
      >
        <header class="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Mood
            </h2>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Average score per {{ store.bin }} across each configured facet.
              Bipolar facets use [-1, +1]; unipolar facets use [0, +1] (absence
              of the positive pole).
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
                ? 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700/60 line-through decoration-2'
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

        <div v-else class="h-72 relative">
          <canvas
            ref="moodChartCanvas"
            data-testid="dashboard-mood-chart"
          ></canvas>
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
