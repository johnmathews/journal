<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Chart, type ChartType } from 'chart.js'
import { useFitnessStore } from '@/stores/fitness'
import { getChartColors, getThemedGridColor } from '@/utils/chartjs-config'
import { adjustColorOpacity } from '@/utils/mosaic'
import type {
  FitnessActivityType,
  FitnessSource,
} from '@/types/fitness'

const store = useFitnessStore()
const {
  activities,
  daily,
  loadingActivities,
  loadingStatus,
  activitiesError,
  dailyError,
  statusError,
  distinctActivities,
  isFreshSetup,
} = storeToRefs(store)

// --- Date window ---
//
// Default to a 90-day trailing window. Wide enough to surface a
// meaningful weekly chart, narrow enough that initial load is quick on
// the Garmin daily endpoint (90 rows × 6 raw fan-in is not a lot of work
// for the API but the wire payload grows quickly with every extra month).
function isoToday(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

const startDate = ref(isoDaysAgo(90))
const endDate = ref(isoToday())

async function reloadAll() {
  await Promise.all([
    store.loadSyncStatus(),
    store.loadActivities(startDate.value, endDate.value),
    store.loadDaily(startDate.value, endDate.value),
  ])
}

// --- Distinct-activity series for the activities-per-week chart ---

const ACTIVITY_TYPE_ORDER: FitnessActivityType[] = [
  'run',
  'ride',
  'swim',
  'walk',
  'hike',
  'strength',
  'other',
]

const ACTIVITY_TYPE_COLOR: Record<FitnessActivityType, string> = {
  run: '#8b5cf6', // violet
  ride: '#0ea5e9', // sky
  swim: '#06b6d4', // cyan
  walk: '#10b981', // emerald
  hike: '#84cc16', // lime
  strength: '#f59e0b', // amber
  other: '#94a3b8', // slate
}

interface WeeklyBucket {
  weekStart: string // ISO date — Monday
  byType: Record<FitnessActivityType, number>
}

/**
 * Bucket distinct workouts into ISO weeks (Monday start). Returns
 * one bucket per week in [startDate, endDate], even empty ones, so
 * Chart.js doesn't compress visually identical gaps.
 */
function bucketByWeek(): WeeklyBucket[] {
  const start = new Date(startDate.value + 'T00:00:00Z')
  const end = new Date(endDate.value + 'T00:00:00Z')

  // Step `start` back to the Monday of its week (ISO weeks).
  const dow = start.getUTCDay() // 0=Sun..6=Sat
  const diffToMonday = (dow + 6) % 7
  const cursor = new Date(start)
  cursor.setUTCDate(cursor.getUTCDate() - diffToMonday)

  const buckets: WeeklyBucket[] = []
  while (cursor.getTime() <= end.getTime()) {
    const weekStart = cursor.toISOString().slice(0, 10)
    buckets.push({
      weekStart,
      byType: {
        run: 0,
        ride: 0,
        swim: 0,
        walk: 0,
        hike: 0,
        strength: 0,
        other: 0,
      },
    })
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }

  for (const ds of distinctActivities.value) {
    const a = ds.representative
    const t = new Date(a.start_time).getTime()
    const idx = buckets.findIndex((b, i) => {
      const bs = new Date(b.weekStart + 'T00:00:00Z').getTime()
      const next = buckets[i + 1]
        ? new Date(buckets[i + 1].weekStart + 'T00:00:00Z').getTime()
        : Infinity
      return t >= bs && t < next
    })
    if (idx === -1) continue
    buckets[idx].byType[a.activity_type] += 1
  }

  return buckets
}

const weeklyBuckets = computed(() => bucketByWeek())

const weekLabels = computed(() =>
  weeklyBuckets.value.map((b) => {
    // Render as "May 5" — the year is implied by the date window.
    const d = new Date(b.weekStart + 'T00:00:00Z')
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }),
)

// --- Chart canvases and instances ---

const activitiesChartCanvas = ref<HTMLCanvasElement | null>(null)
const sleepChartCanvas = ref<HTMLCanvasElement | null>(null)
const hrvChartCanvas = ref<HTMLCanvasElement | null>(null)
const rhrChartCanvas = ref<HTMLCanvasElement | null>(null)

let activitiesChart: Chart | null = null
let sleepChart: Chart | null = null
let hrvChart: Chart | null = null
let rhrChart: Chart | null = null

function renderActivitiesChart(): void {
  if (!activitiesChartCanvas.value) return
  const colors = getChartColors()
  activitiesChart?.destroy()
  const datasets = ACTIVITY_TYPE_ORDER.map((type) => ({
    label: type.charAt(0).toUpperCase() + type.slice(1),
    data: weeklyBuckets.value.map((b) => b.byType[type]),
    backgroundColor: ACTIVITY_TYPE_COLOR[type],
    borderRadius: 2,
    borderSkipped: false as const,
    stack: 'activity',
  }))
  activitiesChart = new Chart(activitiesChartCanvas.value, {
    type: 'bar',
    data: { labels: weekLabels.value, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom' },
        tooltip: {
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
          grid: { color: getThemedGridColor() },
          ticks: { color: colors.textColor.light, precision: 0 },
        },
      },
    },
  })
}

interface DailySeries {
  labels: string[]
  values: Array<number | null>
}

function dailySeries(field: keyof (typeof daily.value)[number]): DailySeries {
  const sorted = [...daily.value].sort((a, b) =>
    a.local_date.localeCompare(b.local_date),
  )
  const labels = sorted.map((row) => {
    const d = new Date(row.local_date + 'T00:00:00Z')
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  })
  const values = sorted.map((row) => {
    const v = row[field]
    return typeof v === 'number' ? v : null
  })
  return { labels, values }
}

function renderLineChart(
  canvas: HTMLCanvasElement | null,
  series: DailySeries,
  label: string,
  color: string,
): Chart | null {
  if (!canvas) return null
  const colors = getChartColors()
  return new Chart(canvas, {
    type: 'line' as ChartType,
    data: {
      labels: series.labels,
      datasets: [
        {
          label,
          data: series.values,
          borderColor: color,
          backgroundColor: adjustColorOpacity(color, 0.15),
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: color,
          spanGaps: true,
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
          ticks: {
            color: colors.textColor.light,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
          },
        },
        y: {
          beginAtZero: false,
          grid: { color: getThemedGridColor() },
          ticks: { color: colors.textColor.light, precision: 0 },
        },
      },
    },
  })
}

function renderSleepChart(): void {
  sleepChart?.destroy()
  sleepChart = renderLineChart(
    sleepChartCanvas.value,
    dailySeries('sleep_score'),
    'Sleep score',
    '#6366f1',
  )
}

function renderHrvChart(): void {
  hrvChart?.destroy()
  hrvChart = renderLineChart(
    hrvChartCanvas.value,
    dailySeries('hrv_overnight_ms'),
    'HRV overnight (ms)',
    '#10b981',
  )
}

function renderRhrChart(): void {
  rhrChart?.destroy()
  rhrChart = renderLineChart(
    rhrChartCanvas.value,
    dailySeries('resting_hr_bpm'),
    'Resting HR (bpm)',
    '#f43f5e',
  )
}

watch(
  () => activities.value,
  () => renderActivitiesChart(),
)
watch(
  () => daily.value,
  () => {
    renderSleepChart()
    renderHrvChart()
    renderRhrChart()
  },
)

// `reloadAll` populates `activities` and `daily`, which the watchers
// above pick up and translate into chart renders. No explicit render
// calls here — that would double-render every chart on mount.
onMounted(() => {
  void reloadAll()
})

onBeforeUnmount(() => {
  activitiesChart?.destroy()
  sleepChart?.destroy()
  hrvChart?.destroy()
  rhrChart?.destroy()
  store.cancelPendingStatusRefresh()
})

function sourceLabel(source: FitnessSource): string {
  return source === 'strava' ? 'Strava' : 'Garmin'
}

const recentActivities = computed(() => distinctActivities.value.slice(0, 20))

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDistance(meters: number | null): string {
  if (meters === null) return '—'
  return (meters / 1000).toFixed(2) + ' km'
}
</script>

<template>
  <section class="space-y-8">
    <!-- Header -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">
          Fitness
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Strava and Garmin sync status, weekly training, and Garmin daily
          recovery.
        </p>
      </div>
      <div class="flex items-end gap-3">
        <label class="text-xs text-gray-600 dark:text-gray-300">
          From
          <input
            v-model="startDate"
            type="date"
            data-testid="fitness-start-date"
            class="block mt-1 form-input rounded-md text-sm"
          />
        </label>
        <label class="text-xs text-gray-600 dark:text-gray-300">
          To
          <input
            v-model="endDate"
            type="date"
            data-testid="fitness-end-date"
            class="block mt-1 form-input rounded-md text-sm"
          />
        </label>
        <button
          type="button"
          data-testid="fitness-reload"
          class="btn bg-violet-500 hover:bg-violet-600 text-white text-sm h-9"
          @click="reloadAll"
        >
          Reload
        </button>
      </div>
    </header>

    <!-- First-run hint when no sources have ever connected -->
    <div
      v-if="isFreshSetup && !loadingStatus"
      class="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-700 p-4"
      data-testid="fitness-fresh-setup"
    >
      <h2 class="font-semibold text-amber-800 dark:text-amber-200">
        No fitness data yet
      </h2>
      <p class="text-sm text-amber-800 dark:text-amber-200 mt-1">
        Connect a source by running
        <code class="font-mono">journal fitness-reauth-strava</code>
        or
        <code class="font-mono">journal fitness-reauth-garmin</code> on the
        server, then run
        <code class="font-mono">journal fitness-backfill</code> to load
        historical activity. See
        <span class="font-semibold">docs/fitness-operations.md</span> for the
        full operator runbook.
      </p>
    </div>

    <!-- Sync panels live in Settings · Fitness; deep-link them here so
         users can find them in one click from the page they're most
         likely to be looking at. -->
    <p class="text-xs text-gray-500 dark:text-gray-400">
      <RouterLink
        to="/settings#fitness"
        class="text-violet-500 hover:text-violet-600 dark:hover:text-violet-400"
        data-testid="fitness-manage-sync-link"
      >
        Manage sync → Settings · Fitness
      </RouterLink>
    </p>

    <!-- Errors (per data slice) -->
    <div
      v-if="statusError"
      class="text-sm text-rose-500"
      data-testid="fitness-status-error"
    >
      {{ statusError }}
    </div>
    <div
      v-if="activitiesError"
      class="text-sm text-rose-500"
      data-testid="fitness-activities-error"
    >
      {{ activitiesError }}
    </div>
    <div
      v-if="dailyError"
      class="text-sm text-rose-500"
      data-testid="fitness-daily-error"
    >
      {{ dailyError }}
    </div>

    <!-- Activities-per-week chart -->
    <article class="rounded-xl bg-white dark:bg-gray-800 shadow-xs p-5">
      <header class="flex items-baseline justify-between mb-3">
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Distinct workouts per week
        </h2>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {{ activities.length }} raw rows · {{ distinctActivities.length }}
          distinct
        </span>
      </header>
      <div class="h-64">
        <canvas ref="activitiesChartCanvas" data-testid="fitness-weekly-chart"
          ><div v-if="loadingActivities" role="alert">Loading…</div></canvas
        >
      </div>
    </article>

    <!-- Garmin daily wellness charts -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <article class="rounded-xl bg-white dark:bg-gray-800 shadow-xs p-5">
        <header class="mb-3">
          <h2 class="text-base font-semibold text-gray-800 dark:text-gray-100">
            Sleep score
          </h2>
          <p class="text-xs text-gray-500">
            Garmin · last {{ daily.length }} days
          </p>
        </header>
        <div class="h-48">
          <canvas ref="sleepChartCanvas" data-testid="fitness-sleep-chart" />
        </div>
      </article>
      <article class="rounded-xl bg-white dark:bg-gray-800 shadow-xs p-5">
        <header class="mb-3">
          <h2 class="text-base font-semibold text-gray-800 dark:text-gray-100">
            HRV overnight
          </h2>
          <p class="text-xs text-gray-500">Garmin · ms</p>
        </header>
        <div class="h-48">
          <canvas ref="hrvChartCanvas" data-testid="fitness-hrv-chart" />
        </div>
      </article>
      <article class="rounded-xl bg-white dark:bg-gray-800 shadow-xs p-5">
        <header class="mb-3">
          <h2 class="text-base font-semibold text-gray-800 dark:text-gray-100">
            Resting heart rate
          </h2>
          <p class="text-xs text-gray-500">Garmin · bpm</p>
        </header>
        <div class="h-48">
          <canvas ref="rhrChartCanvas" data-testid="fitness-rhr-chart" />
        </div>
      </article>
    </div>

    <!-- Recent distinct activities list -->
    <article class="rounded-xl bg-white dark:bg-gray-800 shadow-xs p-5">
      <header class="mb-3">
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Recent workouts
        </h2>
        <p class="text-xs text-gray-500">
          Cross-source dedup applied — rows from both Strava and Garmin whose
          time windows overlap by ≥75% collapse to one entry.
        </p>
      </header>
      <table class="w-full text-sm" data-testid="fitness-recent-activities">
        <thead>
          <tr class="text-left text-gray-500 dark:text-gray-400 text-xs">
            <th class="font-medium pb-2">Date</th>
            <th class="font-medium pb-2">Type</th>
            <th class="font-medium pb-2">Source</th>
            <th class="font-medium pb-2 text-right">Distance</th>
            <th class="font-medium pb-2 text-right">Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="ds in recentActivities"
            :key="ds.representative.id"
            class="border-t border-gray-100 dark:border-gray-700"
          >
            <td class="py-2 text-gray-700 dark:text-gray-200">
              {{ ds.representative.local_date }}
            </td>
            <td class="py-2 capitalize text-gray-700 dark:text-gray-200">
              {{ ds.representative.activity_type }}
            </td>
            <td class="py-2 text-gray-700 dark:text-gray-200">
              {{ sourceLabel(ds.representative.source) }}
              <span
                v-if="ds.secondary_source_ids.length"
                class="text-xs text-gray-500"
              >
                + {{ ds.secondary_source_ids.length }} mirror
              </span>
            </td>
            <td class="py-2 text-right text-gray-700 dark:text-gray-200">
              {{ formatDistance(ds.representative.distance_m) }}
            </td>
            <td class="py-2 text-right text-gray-700 dark:text-gray-200">
              {{ formatDuration(ds.representative.duration_s) }}
            </td>
          </tr>
          <tr v-if="!recentActivities.length">
            <td
              class="py-3 text-gray-500 dark:text-gray-400"
              colspan="5"
              data-testid="fitness-no-activities"
            >
              No workouts in this window.
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  </section>
</template>
