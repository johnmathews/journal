<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Chart } from 'chart.js'
import type {
  DashboardBin,
  DashboardRange,
  MoodDimension,
  MoodTrendBin,
} from '@/types/dashboard'
import type { MoodDrilldownEntry } from '@/types/insights'
import { fillPeriods } from '@/utils/bins'
import { getChartColors, getThemedGridColor } from '@/utils/chartjs-config'
import { adjustColorOpacity } from '@/utils/mosaic'
import {
  displayLabel,
  displayPolarLabel,
  displayScore,
  isDisplayInverted,
} from '@/utils/mood-display'
import { groupDimensions } from '@/utils/mood-groups'
import { rangeToDates } from '@/stores/dashboard'
import BaseTooltip from '@/components/BaseTooltip.vue'
import { MOOD_LINE_COLORS } from './shared'

interface Props {
  dimensions: MoodDimension[]
  bins: MoodTrendBin[]
  /**
   * The store's selection set. Empty set means "show all" — the
   * actual visibility decision comes through `isDimensionVisible`
   * so the store stays the single owner of that contract; the Set
   * itself is what the re-render watcher keys on (the store assigns
   * a new Set on every toggle).
   */
  selectedDimensions: Set<string>
  isDimensionVisible: (name: string) => boolean
  groupSelectionState: (
    memberNames: readonly string[],
  ) => 'all' | 'some' | 'none'
  range: DashboardRange
  bin: DashboardBin
  /** Human-readable range phrase, e.g. "over the last 6 months". */
  rangePhrase: string
  loading: boolean
  hasLoaded: boolean
  error: string | null
  drillPeriod: string | null
  drillDimension: string | null
  drillEntries: MoodDrilldownEntry[]
  drillLoading: boolean
  drillError: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'toggle-dimension', name: string): void
  (e: 'toggle-group', memberNames: readonly string[]): void
  (e: 'drill-down', period: string, dimension: string): void
  (e: 'clear-drill-down'): void
  (e: 'open-entry', entryId: number): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null
let renderedOnce = false

const hasMoodData = computed(() => props.bins.length > 0)

/**
 * Mood dimensions bucketed into the four conceptual groups (affect axes /
 * psychological needs / active negative affect / stance) per the toml's
 * leading comment. Each row in the chart's toggle UI renders one entry from
 * this list. Iterating preserves the toml's ordering, which the chart relies
 * on for line colour assignment.
 */
const groupedMoodDimensions = computed(() => groupDimensions(props.dimensions))

/**
 * Stable index for each dimension across the flat (un-grouped) toml order.
 * The chart's line colours are assigned by this index so the colour
 * associated with `joy_sadness` doesn't depend on which group it ended up
 * rendered in. Built once per `dimensions` change.
 */
const moodDimensionIndex = computed<Map<string, number>>(() => {
  const m = new Map<string, number>()
  props.dimensions.forEach((d, i) => m.set(d.name, i))
  return m
})

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

/** Display label for the drill-down panel header — uses the active
 *  dimension's `displayLabel` so frustration drill-downs read as "calm". */
const drillDimensionLabel = computed<string>(() => {
  const name = props.drillDimension
  if (!name) return ''
  const d = props.dimensions.find((m) => m.name === name)
  return d ? displayLabel(d) : name
})

/** Inverts an individual entry score for display when the drilled-into
 *  dimension is display-inverted; passes through otherwise. */
function drillEntryDisplayScore(score: number): number {
  const name = props.drillDimension
  if (!name) return score
  const d = props.dimensions.find((m) => m.name === name)
  if (!d) return score
  return displayScore(d, score) ?? score
}

/**
 * Neutral midpoint of the currently-drilled dimension's *display* range.
 * Bipolar dimensions are centred on 0; unipolar dimensions run 0..score_max
 * with no true negative pole, so their neutral point is score_max / 2 (0.5).
 * Colouring a unipolar entry green/red against 0 is a bug — every value is
 * ≥ 0, so it always reads green. Falls back to 0 when the dimension is
 * unknown.
 */
function drillDimensionMidpoint(): number {
  const name = props.drillDimension
  if (!name) return 0
  const d = props.dimensions.find((m) => m.name === name)
  if (!d) return 0
  return d.scale_type === 'unipolar' ? d.score_max / 2 : 0
}

/**
 * Whether a (already inversion-applied) displayed score reads as "good" for
 * the drilled dimension — i.e. at or above the neutral midpoint. Inversion
 * is handled upstream by `drillEntryDisplayScore`, so a high displayed value
 * for physical_fatigue correctly means "less depleted".
 */
function drillEntryIsGood(displayed: number): boolean {
  return displayed >= drillDimensionMidpoint()
}

function pivotMoodBins(): {
  periods: string[]
  series: Record<string, (number | null)[]>
  minSeries: Record<string, (number | null)[]>
  maxSeries: Record<string, (number | null)[]>
  countSeries: Record<string, number[]>
} {
  const byPeriod: Map<
    string,
    Map<
      string,
      { avg: number; min: number | null; max: number | null; count: number }
    >
  > = new Map()
  for (const b of props.bins) {
    let periodRow = byPeriod.get(b.period)
    if (!periodRow) {
      periodRow = new Map()
      byPeriod.set(b.period, periodRow)
    }
    periodRow.set(b.dimension, {
      avg: b.avg_score,
      min: b.score_min,
      max: b.score_max,
      count: b.entry_count,
    })
  }
  // Contiguous period axis (server omits empty periods). Periods with
  // no scored entries pivot to `null`, and `spanGaps: false` on the
  // datasets breaks the lines there — a real gap, not interpolation.
  const { from, to } = rangeToDates(props.range)
  const periods = fillPeriods(Array.from(byPeriod.keys()), from, to, props.bin)
  const series: Record<string, (number | null)[]> = {}
  const minSeries: Record<string, (number | null)[]> = {}
  const maxSeries: Record<string, (number | null)[]> = {}
  // Parallel to `series`: how many entries fed each plotted average. Drives
  // the per-point radius and the tooltip's "N entries" line so a 1-entry
  // bucket reads as the small, low-confidence sample it is.
  const countSeries: Record<string, number[]> = {}
  for (const d of props.dimensions) {
    series[d.name] = periods.map((p) =>
      displayScore(d, byPeriod.get(p)?.get(d.name)?.avg ?? null),
    )
    countSeries[d.name] = periods.map(
      (p) => byPeriod.get(p)?.get(d.name)?.count ?? 0,
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
  return { periods, series, minSeries, maxSeries, countSeries }
}

// The mood chart keeps inline Chart.js options rather than
// `buildLineChartOptions`: its click-to-drill-down `onClick` handler
// needs to live close to the dataset definitions, which the style
// guide lists as an explicit exemption (docs/chart-style-guide.md,
// "When NOT to use buildLineChartOptions").
function render(): void {
  if (!canvasRef.value) return
  chart?.destroy()

  if (!hasMoodData.value) {
    chart = null
    return
  }

  const colors = getChartColors()
  const { periods, series, minSeries, maxSeries, countSeries } = pivotMoodBins()

  const allDimensions = props.dimensions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const datasets: any[] = []

  for (const d of allDimensions) {
    if (!props.isDimensionVisible(d.name)) continue
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

    // Average line (the main visible line). Point radius scales with the
    // number of entries behind each average so sparse, low-confidence
    // buckets (e.g. a 1-entry week) render as small dots and dense buckets
    // as fuller ones. `Math.min(2 + count, 7)` caps growth so busy weeks
    // don't blot out the line.
    const counts = countSeries[d.name] ?? []
    datasets.push({
      label: d.name,
      data: series[d.name] ?? [],
      borderColor: color,
      backgroundColor: adjustColorOpacity(color, 0.12),
      fill: false,
      tension: 0.3,
      pointRadius: (ctx: { dataIndex: number }) =>
        Math.min(2 + (counts[ctx.dataIndex] ?? 0), 7),
      pointHoverRadius: 5,
      pointBackgroundColor: color,
      spanGaps: false,
    })
  }

  chart = new Chart(canvasRef.value, {
    type: 'line',
    data: { labels: periods, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: renderedOnce ? false : undefined,
      onClick: (_event, elements, chartInstance) => {
        if (elements.length === 0) return
        const el = elements[0]
        const dsLabel = chartInstance.data.datasets[el.datasetIndex]
          .label as string
        if (dsLabel.endsWith('_min') || dsLabel.endsWith('_max')) return
        const period = chartInstance.data.labels?.[el.index] as string
        if (!period || !dsLabel) return
        if (props.drillPeriod === period && props.drillDimension === dsLabel) {
          emit('clear-drill-down')
        } else {
          emit('drill-down', period, dsLabel)
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
          callbacks: {
            // Append the sample size to each point's tooltip line so a
            // hovered average always says how many entries it averages
            // (e.g. "joy_sadness: +0.40 · 1 entry").
            label: (item) => {
              const label = item.dataset.label || ''
              const counts = countSeries[label] ?? []
              const count = counts[item.dataIndex] ?? 0
              const y = item.parsed.y
              const scoreStr = typeof y === 'number' ? formatScore(y) : '—'
              const noun = count === 1 ? 'entry' : 'entries'
              return `${label}: ${scoreStr} · ${count} ${noun}`
            },
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
          grid: { color: getThemedGridColor() },
          ticks: { color: colors.textColor.light, stepSize: 0.5 },
        },
      },
    },
  })
  renderedOnce = true
}

onMounted(render)

// `flush: 'post'` is essential here: when the v-if/v-else branches in
// the mood-trends card flip (e.g. loading → loaded, or — historically —
// the all-hidden empty state → chart), Vue mounts/unmounts the canvas
// element. The default `flush: 'pre'` would fire this watcher *before*
// Vue patches the DOM, so `canvasRef.value` would still be `null`
// and `render` would silently no-op. Running post-flush guarantees the
// canvas ref is live when we draw.
watch([() => props.bins, () => props.selectedDimensions], () => render(), {
  deep: false,
  flush: 'post',
})

onUnmounted(() => {
  chart?.destroy()
  chart = null
})
</script>

<template>
  <header class="mb-3 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
        Mood Trends
      </h2>
      <p class="text-xs text-gray-600 dark:text-gray-300">
        Average score per {{ bin }} {{ rangePhrase }}, with min/max variance
        bands — the band's lower reach is the single worst entry in each bucket,
        so an acute dip (e.g. a hard post-run evening) stays visible even when
        the {{ bin }}'s average dilutes it. Click a data point to see
        contributing entries.
      </p>
    </div>
    <div class="flex items-center gap-2"></div>
  </header>

  <!-- Dimension toggles, grouped per mood-dimensions.toml comment -->
  <div
    v-if="dimensions.length"
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
      <BaseTooltip v-if="g.group.label" :text="g.group.description">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[0.65rem] font-semibold uppercase tracking-wide border transition-colors text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-700/40"
          :data-testid="`dashboard-mood-group-${g.group.id}`"
          :aria-pressed="
            groupSelectionState(g.group.members) === 'all'
              ? 'true'
              : groupSelectionState(g.group.members) === 'some'
                ? 'mixed'
                : 'false'
          "
          @click="emit('toggle-group', g.group.members)"
        >
          <span
            class="inline-block w-2.5 h-2.5 rounded-full border border-gray-400 dark:border-gray-500"
            :class="{
              'bg-violet-500 border-violet-500':
                groupSelectionState(g.group.members) === 'all',
              'bg-gradient-to-r from-violet-500 from-50% to-transparent to-50% border-violet-500':
                groupSelectionState(g.group.members) === 'some',
            }"
            aria-hidden="true"
          ></span>
          {{ g.group.label }}
        </button>
      </BaseTooltip>
      <button
        v-for="d in g.members"
        :key="d.name"
        type="button"
        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
        :class="
          isDimensionVisible(d.name)
            ? 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700/60'
            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 opacity-40'
        "
        :data-testid="`dashboard-mood-toggle-${d.name}`"
        :aria-pressed="isDimensionVisible(d.name)"
        @click="emit('toggle-dimension', d.name)"
      >
        <span
          class="inline-block w-2 h-2 rounded-full"
          :style="{
            backgroundColor:
              MOOD_LINE_COLORS[
                (moodDimensionIndex.get(d.name) ?? 0) % MOOD_LINE_COLORS.length
              ],
          }"
          aria-hidden="true"
        ></span>
        {{ displayPolarLabel(d) }}
        <span
          class="text-gray-600 dark:text-gray-300 font-mono text-[0.65rem]"
          >{{ d.scale_type === 'bipolar' ? '±1' : '0..1' }}</span
        >
      </button>
    </div>
  </div>

  <div
    v-if="loading && !hasLoaded"
    class="py-12 text-center text-gray-600 dark:text-gray-300 text-sm"
    data-testid="dashboard-mood-loading"
  >
    Loading mood data…
  </div>

  <div
    v-else-if="error"
    class="mb-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
    data-testid="dashboard-mood-error"
  >
    {{ error }}
  </div>

  <div
    v-else-if="!hasMoodData"
    class="py-8 text-center text-gray-600 dark:text-gray-300 text-sm"
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
    <canvas ref="canvasRef" data-testid="dashboard-mood-chart"></canvas>
  </div>

  <!-- Drill-down panel -->
  <div
    v-if="drillPeriod"
    class="mt-4 border-t border-gray-200 dark:border-gray-700/60 pt-4"
    data-testid="dashboard-drilldown"
  >
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
        {{ drillDimensionLabel }} — {{ formatDate(drillPeriod) }}
      </h3>
      <button
        type="button"
        class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        data-testid="dashboard-drilldown-close"
        @click="emit('clear-drill-down')"
      >
        Close
      </button>
    </div>

    <div
      v-if="drillLoading"
      class="py-4 text-center text-gray-600 dark:text-gray-300 text-sm"
    >
      Loading entries…
    </div>

    <div
      v-else-if="drillError"
      class="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
    >
      {{ drillError }}
    </div>

    <div
      v-else-if="drillEntries.length === 0"
      class="py-4 text-center text-gray-600 dark:text-gray-300 text-sm"
    >
      No scored entries for this period.
    </div>

    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm" data-testid="dashboard-drilldown-table">
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
            v-for="entry in drillEntries"
            :key="entry.entry_id"
            class="border-b border-gray-100 dark:border-gray-700/40 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
            @click="emit('open-entry', entry.entry_id)"
          >
            <td
              class="py-2 pr-4 whitespace-nowrap text-gray-700 dark:text-gray-200"
            >
              {{ formatDate(entry.entry_date) }}
            </td>
            <td
              class="py-2 pr-4 whitespace-nowrap font-mono text-xs"
              :class="
                drillEntryIsGood(drillEntryDisplayScore(entry.score))
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
        <code class="font-mono">journal backfill-mood --force</code> to populate
        rationales for all entries.
      </p>
    </div>
  </div>
</template>
