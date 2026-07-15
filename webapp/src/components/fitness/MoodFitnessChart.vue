<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useStorage } from '@vueuse/core'
import { Chart, type ChartType } from 'chart.js'
import { useFitnessStore } from '@/stores/fitness'
import { getChartColors, getThemedGridColor } from '@/utils/chartjs-config'
import { adjustColorOpacity } from '@/utils/mosaic'
import { displayScore, displayPolarLabel } from '@/utils/mood-display'
import { MOOD_LINE_COLORS } from '@/components/dashboard/shared'
import type { MoodDimension } from '@/types/dashboard'
import type { DivergenceQuadrant } from '@/types/fitness'

// The mood-recovery rows carry the *raw* fatigue facet scores (0..1,
// higher = more depleted). Reuse the dashboard's display-inversion so the
// plotted line reads "up = fresh" — consistent with the left axis where a
// higher training-readiness is also "better". These minimal descriptors
// are all `displayScore` / `displayPolarLabel` need (name + score bounds +
// poles); the facets are unipolar so `displayPolarLabel` collapses to the
// inverted single label ("physically fresh" / "mentally fresh").
const PHYSICAL_DIM: MoodDimension = {
  name: 'physical_fatigue',
  positive_pole: 'physical fatigue',
  negative_pole: '',
  scale_type: 'unipolar',
  score_min: 0,
  score_max: 1,
  notes: '',
}
const MENTAL_DIM: MoodDimension = {
  name: 'mental_fatigue',
  positive_pole: 'mental fatigue',
  negative_pole: '',
  scale_type: 'unipolar',
  score_min: 0,
  score_max: 1,
  notes: '',
}

// physical_fatigue → green, mental_fatigue → amber (their slots in the
// shared mood palette, matching the dashboard mood chart). Training load
// gets a distinct sky hue so the objective series reads apart from the two
// subjective fatigue lines.
const PHYSICAL_COLOR = MOOD_LINE_COLORS[2]
const MENTAL_COLOR = MOOD_LINE_COLORS[3]
const LOAD_COLOR = '#0ea5e9'

// Left-axis metric: raw acute training load, or Garmin's training
// readiness. Persisted so the choice survives reloads.
type LoadMetric = 'load' | 'readiness'
const metric = useStorage<LoadMetric>('fitness:moodFitnessMetric', 'load')

const store = useFitnessStore()
const { moodRecovery, divergence, divergenceSummary, moodRecoveryError } =
  storeToRefs(store)

const sortedRows = computed(() =>
  [...moodRecovery.value].sort((a, b) =>
    a.local_date.localeCompare(b.local_date),
  ),
)

const hasData = computed(() => sortedRows.value.length > 0)

const labels = computed(() =>
  sortedRows.value.map((r) => {
    const d = new Date(r.local_date + 'T00:00:00Z')
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }),
)

const loadTitle = computed(() =>
  metric.value === 'load' ? 'Training load (acute)' : 'Training readiness',
)

// ── Divergence card ────────────────────────────────────────────────
//
// Only the two *interesting* quadrants surface as flagged days — the two
// congruent quadrants ("feels how the body looks") aren't actionable, so
// they only appear in the summary counts below.
const QUADRANT_COPY: Record<
  'likely_mental_fatigue' | 'hidden_physical_under_recovery',
  string
> = {
  likely_mental_fatigue:
    'Feels tired, but your body looks recovered — likely mental fatigue',
  hidden_physical_under_recovery:
    'Feels fine, but recovery signals are low — possible hidden physical under-recovery',
}

function isFlagged(
  q: DivergenceQuadrant | null,
): q is 'likely_mental_fatigue' | 'hidden_physical_under_recovery' {
  return q === 'likely_mental_fatigue' || q === 'hidden_physical_under_recovery'
}

const flaggedDays = computed(() =>
  divergence.value
    .filter((r) => isFlagged(r.quadrant))
    .sort((a, b) => b.local_date.localeCompare(a.local_date))
    .slice(0, 8),
)

interface SummaryChip {
  key: keyof NonNullable<typeof divergenceSummary.value>
  label: string
  count: number
}

const summaryChips = computed<SummaryChip[]>(() => {
  const s = divergenceSummary.value
  if (!s) return []
  return [
    {
      key: 'likely_mental_fatigue',
      label: 'Likely mental',
      count: s.likely_mental_fatigue,
    },
    {
      key: 'hidden_physical_under_recovery',
      label: 'Hidden physical',
      count: s.hidden_physical_under_recovery,
    },
    {
      key: 'congruent_fatigue',
      label: 'Congruent tired',
      count: s.congruent_fatigue,
    },
    { key: 'congruent_ok', label: 'Congruent OK', count: s.congruent_ok },
  ]
})

// ── Chart ──────────────────────────────────────────────────────────

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

function renderChart(): void {
  // When data drops to empty the canvas is unmounted (v-else); tear down the
  // stale Chart so it doesn't retain a detached canvas until the next render.
  if (!hasData.value) {
    chart?.destroy()
    chart = null
    return
  }
  if (!canvas.value) return
  const colors = getChartColors()
  chart?.destroy()

  const loadValues = sortedRows.value.map((r) =>
    metric.value === 'load' ? r.training_load_acute : r.training_readiness,
  )
  const physFresh = sortedRows.value.map((r) =>
    displayScore(PHYSICAL_DIM, r.physical_fatigue),
  )
  const mentFresh = sortedRows.value.map((r) =>
    displayScore(MENTAL_DIM, r.mental_fatigue),
  )

  chart = new Chart(canvas.value, {
    type: 'line' as ChartType,
    data: {
      labels: labels.value,
      datasets: [
        {
          label: loadTitle.value,
          data: loadValues,
          yAxisID: 'y',
          borderColor: LOAD_COLOR,
          backgroundColor: adjustColorOpacity(LOAD_COLOR, 0.15),
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 5,
          borderWidth: 2.5,
          spanGaps: true,
          order: 3,
        },
        {
          label: displayPolarLabel(PHYSICAL_DIM),
          data: physFresh,
          yAxisID: 'y1',
          borderColor: PHYSICAL_COLOR,
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.35,
          pointRadius: 2,
          pointHoverRadius: 4,
          borderWidth: 2,
          spanGaps: true,
          order: 1,
        },
        {
          label: displayPolarLabel(MENTAL_DIM),
          data: mentFresh,
          yAxisID: 'y1',
          borderColor: MENTAL_COLOR,
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.35,
          pointRadius: 2,
          pointHoverRadius: 4,
          borderWidth: 2,
          spanGaps: true,
          order: 2,
        },
      ],
    },
    // Dual-axis charts are a documented exemption from
    // buildLineChartOptions (scales.y1 isn't in its signature) — inline
    // the scale block. See docs/chart-style-guide.md.
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
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
          grid: { display: false },
          ticks: { color: colors.textColor.light, maxRotation: 0 },
        },
        y: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          title: {
            display: true,
            text: loadTitle.value,
            color: colors.textColor.light,
          },
          grid: { color: getThemedGridColor() },
          ticks: { color: colors.textColor.light },
        },
        y1: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 1,
          title: {
            display: true,
            text: 'Freshness (0–1)',
            color: colors.textColor.light,
          },
          grid: { drawOnChartArea: false },
          ticks: { color: colors.textColor.light },
        },
      },
    },
  })
}

// `flush: 'post'` is essential: the canvas lives inside the `v-else`
// (rendered only once `hasData` is true). On cold load the data arrives
// after mount, flipping `hasData` false→true. A default `flush: 'pre'`
// watcher fires before the DOM patch, so the canvas doesn't exist yet and
// `renderChart` silently no-ops, leaving the chart blank until an unrelated
// re-render. Post-flush runs after the canvas is patched in. (Same guard as
// MoodTrendsChart.vue.)
watch([sortedRows, metric, hasData], () => renderChart(), { flush: 'post' })

onMounted(() => renderChart())
onBeforeUnmount(() => chart?.destroy())
</script>

<template>
  <div data-testid="mood-fitness-chart">
    <header class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Training load vs. how I feel
        </h2>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Objective training load/recovery against your subjective physical
          &amp; mental freshness. Up = good on both axes.
        </p>
      </div>
      <div
        class="flex gap-1"
        role="radiogroup"
        aria-label="Left-axis metric"
        data-testid="mood-fitness-metric"
      >
        <button
          v-for="opt in ['load', 'readiness'] as LoadMetric[]"
          :key="opt"
          type="button"
          class="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors capitalize"
          :class="
            metric === opt
              ? 'bg-violet-500 text-white border-violet-500'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60'
          "
          :data-testid="`mood-fitness-metric-${opt}`"
          :aria-pressed="metric === opt"
          @click="metric = opt"
        >
          {{ opt }}
        </button>
      </div>
    </header>

    <!-- Error surfacing (mirrors FitnessView's per-slice error rows). -->
    <div
      v-if="moodRecoveryError"
      class="text-sm text-rose-500 mb-2"
      data-testid="mood-fitness-error"
    >
      {{ moodRecoveryError }}
    </div>

    <!-- Empty state: neither journal fatigue scores nor Garmin wellness in
         range. Graceful card rather than a broken/empty chart. -->
    <div
      v-if="!hasData"
      class="rounded-lg border border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/50 p-4"
      data-testid="mood-fitness-empty"
    >
      <p class="text-sm text-gray-600 dark:text-gray-300">
        Mood × recovery needs journal entries and Garmin wellness data in this
        range.
      </p>
    </div>

    <template v-else>
      <div class="h-72">
        <canvas ref="canvas" data-testid="mood-fitness-canvas" />
      </div>

      <!-- Divergence card -->
      <section class="mt-5" data-testid="mood-fitness-divergence">
        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
          Days your body and your mood disagree
        </h3>

        <ul v-if="flaggedDays.length" class="space-y-2">
          <li
            v-for="row in flaggedDays"
            :key="row.local_date"
            class="rounded-lg border p-3 text-sm"
            :class="
              row.quadrant === 'likely_mental_fatigue'
                ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700'
                : 'border-sky-300 bg-sky-50 dark:bg-sky-900/20 dark:border-sky-700'
            "
            data-testid="mood-fitness-divergence-row"
          >
            <span class="font-medium text-gray-700 dark:text-gray-200">
              {{ row.local_date }}
            </span>
            <span class="text-gray-600 dark:text-gray-300">
              — {{ QUADRANT_COPY[row.quadrant as keyof typeof QUADRANT_COPY] }}
            </span>
          </li>
        </ul>
        <p
          v-else
          class="text-sm text-gray-500 dark:text-gray-400"
          data-testid="mood-fitness-divergence-none"
        >
          No divergent days in this range — how you feel tracks how your body
          looks.
        </p>

        <!-- Summary counts across all four quadrants. -->
        <div
          v-if="summaryChips.length"
          class="flex flex-wrap gap-2 mt-3"
          data-testid="mood-fitness-summary"
        >
          <span
            v-for="chip in summaryChips"
            :key="chip.key"
            class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
            :data-testid="`mood-fitness-summary-${chip.key}`"
          >
            {{ chip.label }}: {{ chip.count }}
          </span>
        </div>
      </section>
    </template>
  </div>
</template>
