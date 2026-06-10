<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Chart } from 'chart.js'
import type {
  DashboardBin,
  DashboardRange,
  EntityTrendBin,
} from '@/types/dashboard'
import {
  INSIGHTS_ENTITY_TYPES,
  type InsightsEntityType,
} from '@/types/insights'
import { fillPeriods } from '@/utils/bins'
import { getChartColors, getThemedGridColor } from '@/utils/chartjs-config'
import { adjustColorOpacity } from '@/utils/mosaic'
import { rangeToDates } from '@/stores/dashboard'
import { MOOD_LINE_COLORS, entityTypeLabel } from './shared'

interface Props {
  entities: string[]
  bins: EntityTrendBin[]
  hiddenEntities: Set<string>
  entityType: InsightsEntityType
  range: DashboardRange
  bin: DashboardBin
  loading: boolean
  hasLoaded: boolean
  error: string | null
  /** Human-readable range phrase, e.g. "over the last 6 months". */
  rangePhrase: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'change-type', type: InsightsEntityType): void
  (e: 'toggle-entity', name: string): void
  (e: 'show-all'): void
  (e: 'hide-all'): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

const allHidden = computed(
  () =>
    props.entities.length > 0 &&
    props.hiddenEntities.size === props.entities.length,
)

function entityColorFor(entity: string): string {
  const idx = props.entities.indexOf(entity)
  const safeIdx = idx >= 0 ? idx : 0
  return MOOD_LINE_COLORS[safeIdx % MOOD_LINE_COLORS.length]
}

// Stacked bar chart — `buildLineChartOptions` doesn't apply (the
// style guide's bar-chart exemption): scales need `stacked: true`
// plus the tooltip `filter`/`itemSort` pairing documented below.
function render(): void {
  if (!canvasRef.value) return
  chart?.destroy()

  const entities = props.entities
  const trendBins = props.bins
  if (entities.length === 0 || trendBins.length === 0) {
    chart = null
    return
  }

  const colors = getChartColors()
  const visibleEntities = entities.filter((e) => !props.hiddenEntities.has(e))
  if (visibleEntities.length === 0) {
    chart = null
    return
  }

  // Pivot: collect unique periods, build one series per visible entity.
  // Zero-fill to a contiguous axis (server omits empty periods) so
  // mention gaps render as empty bar slots rather than collapsing.
  const periodSet = new Set<string>()
  for (const b of trendBins) periodSet.add(b.period)
  const { from, to } = rangeToDates(props.range)
  const periods = fillPeriods(Array.from(periodSet), from, to, props.bin)

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

  chart = new Chart(canvasRef.value, {
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
          // Reverse default order so the tooltip lists segments
          // top-to-bottom matching the visual stack (highest
          // datasetIndex is drawn on top of the bar).
          itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
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

onMounted(render)

// `flush: 'post'` so the canvas ref is live after the v-if branches
// flip (all-hidden ↔ chart) — see MoodTrendsChart.vue for the full
// rationale.
watch([() => props.bins, () => props.hiddenEntities], () => render(), {
  deep: false,
  flush: 'post',
})

onUnmounted(() => {
  chart?.destroy()
  chart = null
})
</script>

<template>
  <header class="mb-3 flex items-start justify-between gap-2">
    <div>
      <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
        Topic Trends
      </h2>
      <p class="text-xs text-gray-600 dark:text-gray-300">
        Entity mentions {{ rangePhrase }}, grouped per {{ bin }}.
      </p>
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
        entityType === t
          ? 'bg-violet-500 text-white border-violet-500'
          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60'
      "
      :data-testid="`dashboard-entity-trends-tab-${t}`"
      :aria-pressed="entityType === t"
      @click="emit('change-type', t)"
    >
      {{ entityTypeLabel(t) }}
    </button>
  </div>

  <div
    v-if="loading && !hasLoaded"
    class="py-12 text-center text-gray-600 dark:text-gray-300 text-sm"
    data-testid="dashboard-entity-trends-loading"
  >
    Loading entity trends…
  </div>

  <div
    v-else-if="error"
    class="mb-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
    data-testid="dashboard-entity-trends-error"
  >
    {{ error }}
  </div>

  <div
    v-else-if="entities.length === 0"
    class="py-8 text-center text-gray-600 dark:text-gray-300 text-sm"
    data-testid="dashboard-entity-trends-empty"
  >
    No {{ entityType }} entity trends found in this range.
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
        v-for="entity in entities"
        :key="entity"
        type="button"
        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
        :class="
          hiddenEntities.has(entity)
            ? 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 opacity-40'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700/60'
        "
        :data-testid="`dashboard-entity-trends-toggle-${entity}`"
        :aria-pressed="!hiddenEntities.has(entity)"
        @click="emit('toggle-entity', entity)"
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
          :disabled="hiddenEntities.size === 0"
          data-testid="dashboard-entity-trends-show-all"
          @click="emit('show-all')"
        >
          All
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          class="px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700/40 disabled:opacity-30 disabled:cursor-default"
          :disabled="allHidden"
          data-testid="dashboard-entity-trends-hide-all"
          @click="emit('hide-all')"
        >
          None
        </button>
      </span>
    </div>

    <div
      v-if="allHidden"
      class="py-8 text-center text-gray-600 dark:text-gray-300 text-sm"
      data-testid="dashboard-entity-trends-all-hidden"
    >
      All entities hidden.
      <button
        type="button"
        class="ml-1 text-violet-600 dark:text-violet-400 hover:underline"
        data-testid="dashboard-entity-trends-all-hidden-show-all"
        @click="emit('show-all')"
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
        ref="canvasRef"
        data-testid="dashboard-entity-trends-chart"
      ></canvas>
    </div>
  </template>
</template>
