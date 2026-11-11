<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Chart } from 'chart.js'
import type {
  MoodDimension,
  MoodEntityCorrelationItem,
} from '@/types/dashboard'
import {
  INSIGHTS_ENTITY_TYPES,
  type InsightsEntityType,
} from '@/types/insights'
import { getChartColors, getThemedGridColor } from '@/utils/chartjs-config'
import { displayLabel, displayScore } from '@/utils/mood-display'
import { entityTypeLabel } from './shared'

interface Props {
  items: MoodEntityCorrelationItem[]
  overallAvg: number
  /** The currently selected mood dimension name. */
  dimension: string
  entityType: InsightsEntityType
  /** All configured dimensions — drives the selector chips and the
   *  display-inversion lookup for the active dimension. */
  dimensions: MoodDimension[]
  loading: boolean
  hasLoaded: boolean
  error: string | null
  /** Human-readable range phrase, e.g. "over the last 6 months". */
  rangePhrase: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'change-dimension', dimension: string): void
  (e: 'change-type', type: InsightsEntityType): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

// Horizontal bar chart with a custom `afterDraw` overlay plugin —
// outside `buildLineChartOptions` scope (the style guide's bar-chart
// exemption), so options stay inline.
function render(): void {
  if (!canvasRef.value) return
  chart?.destroy()

  const items = props.items
  if (items.length === 0) {
    chart = null
    return
  }

  const colors = getChartColors()
  // Look up the active dimension so display-inverted ones (frustration → calm)
  // render with `1 - score` and a flipped above/below-average colouring.
  const activeDim = props.dimensions.find((d) => d.name === props.dimension)
  const toDisplay = (s: number): number =>
    activeDim ? (displayScore(activeDim, s) ?? s) : s
  const overallAvg = toDisplay(props.overallAvg)
  const itemScores = items.map((it) => toDisplay(it.avg_score))

  const barColors = itemScores.map((s) =>
    s >= overallAvg ? '#22c55e' : '#ef4444',
  )

  chart = new Chart(canvasRef.value, {
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
          grid: { color: getThemedGridColor() },
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
        afterDraw(chartInstance) {
          const xScale = chartInstance.scales.x
          if (!xScale) return
          const xPixel = xScale.getPixelForValue(overallAvg)
          const ctx = chartInstance.ctx
          const { top, bottom } = chartInstance.chartArea
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

onMounted(render)

// `flush: 'post'` so the canvas ref is live after the v-if branches
// flip (empty → content) — see MoodTrendsChart.vue for the full
// rationale.
watch(() => props.items, render, { deep: false, flush: 'post' })

onUnmounted(() => {
  chart?.destroy()
  chart = null
})
</script>

<template>
  <header class="mb-3 flex items-start justify-between gap-2">
    <div>
      <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
        Mood by Entity
      </h2>
      <p class="text-xs text-gray-600 dark:text-gray-300">
        Average mood score per entity {{ rangePhrase }}. Dashed line shows
        overall average.
      </p>
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
          v-for="d in dimensions"
          :key="d.name"
          type="button"
          class="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
          :class="
            dimension === d.name
              ? 'bg-violet-500 text-white border-violet-500'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60'
          "
          :data-testid="`dashboard-mood-correlation-dim-${d.name}`"
          :aria-pressed="dimension === d.name"
          @click="emit('change-dimension', d.name)"
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
            entityType === t
              ? 'bg-violet-500 text-white border-violet-500'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60'
          "
          :data-testid="`dashboard-mood-correlation-type-${t}`"
          :aria-pressed="entityType === t"
          @click="emit('change-type', t)"
        >
          {{ entityTypeLabel(t) }}
        </button>
      </div>
    </div>
  </div>

  <div
    v-if="loading && !hasLoaded"
    class="py-12 text-center text-gray-600 dark:text-gray-300 text-sm"
    data-testid="dashboard-mood-correlation-loading"
  >
    Loading mood correlation…
  </div>

  <div
    v-else-if="error"
    class="mb-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
    data-testid="dashboard-mood-correlation-error"
  >
    {{ error }}
  </div>

  <div
    v-else-if="items.length === 0"
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
      ref="canvasRef"
      data-testid="dashboard-mood-correlation-chart"
    ></canvas>
  </div>
</template>
