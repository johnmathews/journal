<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useStorage } from '@vueuse/core'
import { Chart, type ChartType } from 'chart.js'
import { useFitnessStore } from '@/stores/fitness'
import { useJobsStore } from '@/stores/jobs'
import { isTerminal } from '@/types/job'
import {
  getChartColors,
  getThemedGridColor,
  buildLineChartOptions,
} from '@/utils/chartjs-config'
import { adjustColorOpacity } from '@/utils/mosaic'
import RangeBinControls from '@/components/RangeBinControls.vue'
import TileGrid from '@/components/TileGrid.vue'
import { movingAverage } from '@/utils/moving-average'
import {
  FITNESS_TILES,
  fitnessWidthToGridColumn,
  nextFitnessWidthLabel,
  type FitnessActivityType,
  type FitnessSource,
  type FitnessTileId,
} from '@/types/fitness'

const store = useFitnessStore()
const jobsStore = useJobsStore()
const {
  activities,
  daily,
  loadingActivities,
  loadingStatus,
  activitiesError,
  dailyError,
  statusError,
  range,
  bin,
  dateWindow,
  distinctActivities,
  isFreshSetup,
} = storeToRefs(store)

// Track the window the user is viewing for the weekly chart's bucket
// bounds — kept as `startDate`/`endDate` refs so the chart bucketing
// (which predates the range picker) keeps working unchanged. They
// follow the store's dateWindow.
const startDate = computed(() => dateWindow.value.start)
const endDate = computed(() => dateWindow.value.end)

async function reloadAll() {
  const { start, end } = dateWindow.value
  await Promise.all([
    store.loadSyncStatus(),
    store.loadActivities(start, end),
    store.loadDaily(start, end),
  ])
}

// --- Distinct-activity series for the activities-per-week chart ---

const ACTIVITY_TYPE_ORDER: FitnessActivityType[] = [
  'run',
  'ride',
  'swim',
  'walk',
  'hike',
  // `row` slots between cardio (hike) and strength so the cardio block
  // reads as a continuous run. Added 2026-06-04 alongside the server's
  // canonical-type promotion (migration 0029).
  'row',
  'strength',
  'other',
]

const ACTIVITY_TYPE_COLOR: Record<FitnessActivityType, string> = {
  run: '#8b5cf6', // violet
  ride: '#0ea5e9', // sky
  swim: '#06b6d4', // cyan
  walk: '#10b981', // emerald
  hike: '#84cc16', // lime
  // Teal between cyan (swim) and emerald (walk) — water-sport adjacency
  // for the rowing series.
  row: '#0891b2',
  strength: '#f59e0b', // amber
  other: '#94a3b8', // slate
}

// Toggle between counting workouts and summing their duration in the
// "Workouts per week" tile. Local to this tile (the daily-wellness
// charts have their own smoothing control); defaults to counts.
type WeeklyMetric = 'count' | 'duration'
const weeklyMetric = ref<WeeklyMetric>('count')

function emptyTypeTotals(): Record<FitnessActivityType, number> {
  return {
    run: 0,
    ride: 0,
    swim: 0,
    walk: 0,
    hike: 0,
    row: 0,
    strength: 0,
    other: 0,
  }
}

interface WeeklyBucket {
  weekStart: string // ISO date — Monday
  // Distinct-activity count per type.
  byType: Record<FitnessActivityType, number>
  // Summed `duration_s` per type, so the tile can render hours as well
  // as counts without re-bucketing.
  durationByType: Record<FitnessActivityType, number>
}

/**
 * Bucket distinct workouts into ISO weeks (Monday start). Returns
 * one bucket per week in [startDate, endDate], even empty ones, so
 * Chart.js doesn't compress visually identical gaps. Each bucket
 * tracks both the distinct-activity count and the summed duration
 * (seconds) per activity type.
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
      byType: emptyTypeTotals(),
      durationByType: emptyTypeTotals(),
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
    buckets[idx].durationByType[a.activity_type] += a.duration_s
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

// --- Smoothing window for the daily-wellness trend lines ---
//
// The Sleep / HRV / RHR panels overlay a centred moving average on the
// noisy daily series. The window is user-selectable (3 / 5 / 7 days)
// and persisted so it survives reloads. Default 3 keeps the historical
// behaviour. See docs/chart-style-guide.md.
type MaWindow = 3 | 5 | 7
const MA_WINDOWS: readonly MaWindow[] = [3, 5, 7]
const maWindow = useStorage<MaWindow>('fitness:maWindow', 3)

// --- Chart canvases and instances ---

const activitiesChartCanvas = ref<HTMLCanvasElement | null>(null)
const sleepChartCanvas = ref<HTMLCanvasElement | null>(null)
const hrvChartCanvas = ref<HTMLCanvasElement | null>(null)
const rhrChartCanvas = ref<HTMLCanvasElement | null>(null)

let activitiesChart: Chart | null = null
let sleepChart: Chart | null = null
let hrvChart: Chart | null = null
let rhrChart: Chart | null = null

/** Human-readable duration from a fractional number of hours. */
function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function renderActivitiesChart(): void {
  if (!activitiesChartCanvas.value) return
  const colors = getChartColors()
  activitiesChart?.destroy()
  const byDuration = weeklyMetric.value === 'duration'
  const datasets = ACTIVITY_TYPE_ORDER.map((type) => ({
    label: type.charAt(0).toUpperCase() + type.slice(1),
    data: weeklyBuckets.value.map((b) =>
      // Count mode: distinct activities. Duration mode: summed hours
      // (seconds / 3600) so the y-axis reads in a human unit.
      byDuration ? b.durationByType[type] / 3600 : b.byType[type],
    ),
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
      // Match the dashboard's stacked-bar tooltip behaviour: resolve
      // hover to the x-bucket so the tooltip lists every series at
      // that week, not just the nearest segment.
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'bottom' },
        tooltip: {
          filter: (item) => (item.parsed?.y ?? 0) > 0,
          itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
          callbacks: byDuration
            ? {
                label: (item) => {
                  const hours = item.parsed?.y ?? 0
                  return `${item.dataset.label}: ${formatHours(hours)}`
                },
              }
            : undefined,
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
          title: byDuration
            ? { display: true, text: 'Hours', color: colors.textColor.light }
            : undefined,
          grid: { color: getThemedGridColor() },
          ticks: {
            color: colors.textColor.light,
            // Count mode shows whole activities; duration shows hours
            // where a fractional axis is fine.
            precision: byDuration ? 1 : 0,
          },
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
  color: string,
): Chart | null {
  if (!canvas) return null
  const colors = getChartColors()
  // Sleep / HRV / RHR are noisy day-to-day but trend cleanly when
  // smoothed. Show the centred moving average as the bold primary line
  // and fade the raw daily series so the user sees both the trend and
  // the underlying data without one obscuring the other. The window is
  // user-selectable (3/5/7). See docs/chart-style-guide.md.
  const smoothed = movingAverage(series.values, maWindow.value)
  return new Chart(canvas, {
    type: 'line' as ChartType,
    data: {
      labels: series.labels,
      datasets: [
        {
          label: `${maWindow.value}-day avg`,
          data: smoothed,
          borderColor: color,
          backgroundColor: adjustColorOpacity(color, 0.18),
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointBackgroundColor: color,
          spanGaps: true,
          borderWidth: 2.5,
          order: 1,
        },
        {
          label: 'Daily',
          data: series.values,
          borderColor: adjustColorOpacity(color, 0.35),
          backgroundColor: 'transparent',
          fill: false,
          tension: 0,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: adjustColorOpacity(color, 0.35),
          spanGaps: true,
          borderWidth: 1,
          order: 2,
        },
      ],
    },
    options: buildLineChartOptions({ colors, beginAtZero: false }),
  })
}

function renderSleepChart(): void {
  sleepChart?.destroy()
  sleepChart = renderLineChart(
    sleepChartCanvas.value,
    dailySeries('sleep_score'),
    '#6366f1',
  )
}

function renderHrvChart(): void {
  hrvChart?.destroy()
  hrvChart = renderLineChart(
    hrvChartCanvas.value,
    dailySeries('hrv_overnight_ms'),
    '#10b981',
  )
}

function renderRhrChart(): void {
  rhrChart?.destroy()
  rhrChart = renderLineChart(
    rhrChartCanvas.value,
    dailySeries('resting_hr_bpm'),
    '#f43f5e',
  )
}

watch(
  () => activities.value,
  () => renderActivitiesChart(),
)
// Re-render the weekly chart when the user flips Count ↔ Duration.
watch(weeklyMetric, () => renderActivitiesChart())
watch(
  () => daily.value,
  () => {
    renderSleepChart()
    renderHrvChart()
    renderRhrChart()
  },
)
// Re-render the daily-wellness charts when the smoothing window changes.
watch(maWindow, () => {
  renderSleepChart()
  renderHrvChart()
  renderRhrChart()
})

// `reloadAll` populates `activities` and `daily`, which the watchers
// above pick up and translate into chart renders. No explicit render
// calls here — that would double-render every chart on mount.
//
// `loadLayout` round-trips the saved `fitness_layout` from the user's
// preferences blob (T4). Fire-and-forget — it runs in parallel with
// the data reload because the chart canvases are wrapped in TileGrid
// slots that render with defaults until the load settles.
onMounted(() => {
  void store.loadLayout()
  void reloadAll()
})

// ── On-page sync buttons (Item 3) ──────────────────────────────────
//
// Sync Garmin / Sync Strava submit a sync job via the store and then
// "spin until done": the button shows a spinner while the submit is in
// flight AND while the tracked job runs, watched via the jobs store
// (same pattern as StorylineDetailView.regenerate). On terminal
// success we reload all data so the charts/tables refresh immediately;
// on submit or job failure we surface a brief inline error with a
// deep-link to Settings · Fitness for the details.

// True while a sync for the source is either submitting or its job is
// still running. Drives the per-button spinner.
const syncBusy = ref<Record<FitnessSource, boolean>>({
  strava: false,
  garmin: false,
})
// Brief inline error per source (submit failure or terminal job failure).
const syncJobError = ref<Record<FitnessSource, string | null>>({
  strava: null,
  garmin: null,
})
// Active job watchers, so we can stop them on resolve/unmount.
const syncWatchers: Record<FitnessSource, (() => void) | null> = {
  strava: null,
  garmin: null,
}

function stopSyncWatcher(source: FitnessSource): void {
  syncWatchers[source]?.()
  syncWatchers[source] = null
}

async function onSyncSource(source: FitnessSource): Promise<void> {
  if (syncBusy.value[source]) return
  syncBusy.value[source] = true
  syncJobError.value[source] = null
  stopSyncWatcher(source)

  const jobId = await store.startSync(source)
  if (!jobId) {
    // Submission failed — store.syncError carries the reason.
    syncJobError.value[source] =
      store.syncError[source] ?? 'Failed to queue sync'
    syncBusy.value[source] = false
    return
  }

  // Watch the tracked job until it reaches a terminal state.
  syncWatchers[source] = watch(
    () => jobsStore.getJobById(jobId),
    (job) => {
      if (job && isTerminal(job.status)) {
        stopSyncWatcher(source)
        syncBusy.value[source] = false
        if (job.status === 'succeeded') {
          void reloadAll()
        } else {
          syncJobError.value[source] =
            job.error_message ?? 'Sync failed — see Settings · Fitness.'
        }
      }
    },
  )
}

onBeforeUnmount(() => {
  activitiesChart?.destroy()
  sleepChart?.destroy()
  hrvChart?.destroy()
  rhrChart?.destroy()
  stopSyncWatcher('strava')
  stopSyncWatcher('garmin')
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

// ── Tile layout wiring (T3) ────────────────────────────────────────
//
// `/fitness` runs on a 6-column TileGrid. Width defaults match D5 in
// `server/docs/fitness-tile-layout-plan.md`: weekly-distinct + recent-
// workouts are full, sleep/hrv/rhr are thirds. The store owns
// `tileOrder` / `hiddenTiles` / `tileWidths` / `editingLayout`; this
// view wires the TileGrid events back to the store.

function spanForFitnessTile(id: FitnessTileId): string {
  return fitnessWidthToGridColumn(store.getTileWidth(id))
}

function widthTitleForFitnessTile(id: FitnessTileId): string {
  return nextFitnessWidthLabel(store.getTileWidth(id))
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
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors h-9"
          :class="
            store.editingLayout
              ? 'bg-violet-500 text-white border-violet-500'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600'
          "
          data-testid="fitness-edit-layout-toggle"
          @click="store.editingLayout = !store.editingLayout"
        >
          {{ store.editingLayout ? 'Done editing' : 'Edit layout' }}
        </button>
        <button
          v-for="source in ['garmin', 'strava'] as FitnessSource[]"
          :key="source"
          type="button"
          class="btn bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-sm h-9 disabled:opacity-60"
          :disabled="syncBusy[source]"
          :data-testid="`fitness-sync-${source}`"
          @click="onSyncSource(source)"
        >
          <svg
            v-if="syncBusy[source]"
            class="animate-spin w-4 h-4 mr-1.5 -ml-0.5 text-violet-500"
            :data-testid="`fitness-sync-${source}-spinner`"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Sync {{ sourceLabel(source) }}
        </button>
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

    <!-- Per-source sync error: submit failed, or the job ended failed.
         Deep-links to Settings · Fitness for the run history. -->
    <div v-if="syncJobError.garmin || syncJobError.strava" class="space-y-1">
      <p
        v-for="source in ['garmin', 'strava'] as FitnessSource[]"
        v-show="syncJobError[source]"
        :key="source"
        class="text-sm text-rose-500"
        :data-testid="`fitness-sync-${source}-error`"
      >
        {{ sourceLabel(source) }} sync failed: {{ syncJobError[source] }}
        <RouterLink
          to="/settings#fitness"
          class="underline hover:text-rose-600"
          :data-testid="`fitness-sync-${source}-error-link`"
        >
          Settings · Fitness
        </RouterLink>
      </p>
    </div>

    <div class="flex flex-wrap items-end gap-4">
      <RangeBinControls
        test-id-prefix="fitness"
        :range="range"
        :bin="bin"
        @update:range="store.setRange($event)"
        @update:bin="store.setBin($event)"
      />
      <!-- Global smoothing selector for the Sleep / HRV / RHR trend
           lines. Styled to match the RangeBinControls chip strip. -->
      <div
        class="flex items-end gap-2 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800 shadow-xs px-5 py-3"
      >
        <div>
          <label
            class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
            >Smoothing</label
          >
          <div
            class="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="Moving-average window"
            data-testid="fitness-ma-window"
          >
            <button
              v-for="w in MA_WINDOWS"
              :key="w"
              type="button"
              class="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
              :class="
                maWindow === w
                  ? 'bg-violet-500 text-white border-violet-500'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60'
              "
              :data-testid="`fitness-ma-window-${w}`"
              :aria-pressed="maWindow === w"
              @click="maWindow = w"
            >
              {{ w }}-day
            </button>
          </div>
        </div>
      </div>
    </div>

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

    <TileGrid
      :tiles="FITNESS_TILES"
      :tile-order="store.tileOrder"
      :hidden-tiles="store.hiddenTiles"
      :editing="store.editingLayout"
      grid-class="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4"
      :get-span="spanForFitnessTile"
      :get-width-title="widthTitleForFitnessTile"
      test-id-prefix="fitness"
      @move="(id, dir) => store.moveTile(id, dir)"
      @hide="(id) => store.hideTile(id)"
      @show="(id) => store.showTile(id)"
      @cycle-width="(id) => store.cycleTileWidth(id)"
      @reset="store.resetLayout()"
    >
      <template #tile-weekly-distinct>
        <header
          class="flex flex-wrap items-baseline justify-between gap-2 mb-3"
        >
          <div>
            <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
              Workouts per week
            </h2>
          </div>
          <div class="flex items-center gap-3">
            <!-- Count ↔ Duration toggle for this tile's stacked bars. -->
            <div
              class="flex gap-1"
              role="radiogroup"
              aria-label="Weekly metric"
              data-testid="fitness-weekly-metric"
            >
              <button
                v-for="opt in ['count', 'duration'] as WeeklyMetric[]"
                :key="opt"
                type="button"
                class="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors capitalize"
                :class="
                  weeklyMetric === opt
                    ? 'bg-violet-500 text-white border-violet-500'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60'
                "
                :data-testid="`fitness-weekly-metric-${opt}`"
                :aria-pressed="weeklyMetric === opt"
                @click="weeklyMetric = opt"
              >
                {{ opt }}
              </button>
            </div>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {{ activities.length }} raw rows · {{ distinctActivities.length }}
              distinct
            </span>
          </div>
        </header>
        <div class="h-64">
          <canvas ref="activitiesChartCanvas" data-testid="fitness-weekly-chart"
            ><div v-if="loadingActivities" role="alert">Loading…</div></canvas
          >
        </div>
      </template>

      <template #tile-sleep>
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
      </template>

      <template #tile-hrv>
        <header class="mb-3">
          <h2 class="text-base font-semibold text-gray-800 dark:text-gray-100">
            HRV overnight
          </h2>
          <p class="text-xs text-gray-500">Garmin · ms</p>
        </header>
        <div class="h-48">
          <canvas ref="hrvChartCanvas" data-testid="fitness-hrv-chart" />
        </div>
      </template>

      <template #tile-rhr>
        <header class="mb-3">
          <h2 class="text-base font-semibold text-gray-800 dark:text-gray-100">
            Resting heart rate
          </h2>
          <p class="text-xs text-gray-500">Garmin · bpm</p>
        </header>
        <div class="h-48">
          <canvas ref="rhrChartCanvas" data-testid="fitness-rhr-chart" />
        </div>
      </template>

      <template #tile-recent-workouts>
        <header class="mb-3">
          <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Recent workouts
          </h2>
          <p class="text-xs text-gray-500">
            Cross-source dedup applied — rows from both Strava and Garmin whose
            time windows overlap by ≥75% collapse to one entry.
          </p>
        </header>
        <div class="overflow-x-auto">
          <table
            class="w-full min-w-[40rem] text-sm"
            data-testid="fitness-recent-activities"
          >
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
        </div>
      </template>
    </TileGrid>
  </section>
</template>
