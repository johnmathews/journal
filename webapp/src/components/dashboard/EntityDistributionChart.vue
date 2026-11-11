<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Chart } from 'chart.js'
import {
  INSIGHTS_ENTITY_TYPES,
  type EntityDistributionItem,
  type InsightsEntityType,
} from '@/types/insights'
import { getChartColors } from '@/utils/chartjs-config'
import { DOUGHNUT_COLORS, entityTypeLabel } from './shared'

interface Props {
  items: EntityDistributionItem[]
  entityType: InsightsEntityType
  loading: boolean
  hasLoaded: boolean
  error: string | null
  /** Human-readable range phrase, e.g. "over the last 6 months". */
  rangePhrase: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'change-type', type: InsightsEntityType): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

// Entity legend expand/collapse — show top 8 by default.
const LEGEND_COLLAPSED_COUNT = 8
const legendExpanded = ref(false)

const visibleItems = computed(() => {
  if (legendExpanded.value) return props.items
  return props.items.slice(0, LEGEND_COLLAPSED_COUNT)
})

const hiddenCount = computed(() => props.items.length - LEGEND_COLLAPSED_COUNT)

// Doughnut chart — `buildLineChartOptions` doesn't apply (line charts
// only per docs/chart-style-guide.md), so options stay inline.
function render(): void {
  if (!canvasRef.value) return
  chart?.destroy()

  const items = props.items
  if (items.length === 0) {
    chart = null
    return
  }

  const colors = getChartColors()
  const bgColors = items.map(
    (_, i) => DOUGHNUT_COLORS[i % DOUGHNUT_COLORS.length],
  )

  chart = new Chart(canvasRef.value, {
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

onMounted(render)

// `flush: 'post'` so the canvas ref is live after the v-if branches
// flip (empty → content) — see MoodTrendsChart.vue for the full
// rationale. A fresh item list also collapses the legend again.
watch(
  () => props.items,
  () => {
    legendExpanded.value = false
    render()
  },
  { deep: false, flush: 'post' },
)

onUnmounted(() => {
  chart?.destroy()
  chart = null
})
</script>

<template>
  <header class="mb-3 flex items-start justify-between gap-2">
    <div>
      <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
        What I Write About
      </h2>
      <p class="text-xs text-gray-600 dark:text-gray-300">
        Entity mention frequency by type {{ rangePhrase }}.
      </p>
    </div>
  </header>

  <!-- Entity type tabs -->
  <div class="flex flex-wrap gap-2 mb-4" data-testid="dashboard-entity-tabs">
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
      :data-testid="`dashboard-entity-tab-${t}`"
      :aria-pressed="entityType === t"
      @click="emit('change-type', t)"
    >
      {{ entityTypeLabel(t) }}
    </button>
  </div>

  <div
    v-if="loading && !hasLoaded"
    class="py-12 text-center text-gray-600 dark:text-gray-300 text-sm"
    data-testid="dashboard-entity-loading"
  >
    Loading entity data…
  </div>

  <div
    v-else-if="error"
    class="mb-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
    data-testid="dashboard-entity-error"
  >
    {{ error }}
  </div>

  <div
    v-else-if="items.length === 0"
    class="py-8 text-center text-gray-600 dark:text-gray-300 text-sm"
    data-testid="dashboard-entity-empty"
  >
    No {{ entityType }} entities found in this range.
  </div>

  <div
    v-else
    class="flex flex-col md:flex-row gap-6"
    data-testid="dashboard-entity-content"
  >
    <div class="h-64 w-64 flex-shrink-0 mx-auto md:mx-0">
      <canvas ref="canvasRef" data-testid="dashboard-entity-chart"></canvas>
    </div>
    <div class="min-w-0 overflow-x-auto">
      <table class="text-sm" data-testid="dashboard-entity-legend">
        <tbody>
          <tr
            v-for="(item, i) in visibleItems"
            :key="item.canonical_name"
            class="text-gray-700 dark:text-gray-200"
          >
            <td class="py-0.5 pr-2">
              <span
                class="inline-block w-3 h-3 rounded-sm"
                :style="{
                  backgroundColor: DOUGHNUT_COLORS[i % DOUGHNUT_COLORS.length],
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
        v-if="hiddenCount > 0"
        type="button"
        class="mt-2 text-xs text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300 font-medium"
        data-testid="dashboard-entity-legend-toggle"
        @click="legendExpanded = !legendExpanded"
      >
        {{ legendExpanded ? 'Show fewer' : `Show ${hiddenCount} more` }}
      </button>
    </div>
  </div>
</template>
