<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Chart } from 'chart.js'
import type {
  DashboardBin,
  DashboardRange,
  WritingFrequencyBin,
} from '@/types/dashboard'
import { getChartColors, buildLineChartOptions } from '@/utils/chartjs-config'
import { adjustColorOpacity } from '@/utils/mosaic'
import { filledWritingBins } from './shared'

interface Props {
  /** Raw (sparse) bins from the server — zero-filled here at render time. */
  bins: WritingFrequencyBin[]
  range: DashboardRange
  bin: DashboardBin
  /** Human-readable range phrase, e.g. "over the last 6 months". */
  rangePhrase: string
}

const props = defineProps<Props>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

const filled = computed(() =>
  filledWritingBins(props.bins, props.range, props.bin),
)

function render(): void {
  if (!canvasRef.value) return
  const colors = getChartColors()
  const violet = '#8b5cf6'

  chart?.destroy()
  chart = new Chart(canvasRef.value, {
    type: 'line',
    data: {
      labels: filled.value.map((b) => b.bin_start),
      datasets: [
        {
          label: 'Entries',
          data: filled.value.map((b) => b.entry_count),
          borderColor: violet,
          backgroundColor: adjustColorOpacity(violet, 0.15),
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: violet,
        },
      ],
    },
    options: buildLineChartOptions({ colors }),
  })
}

onMounted(render)

// `flush: 'post'` so the canvas ref is live if a v-if branch flips in
// the same tick the data lands — see MoodTrendsChart.vue for the full
// rationale.
watch(() => props.bins, render, { deep: false, flush: 'post' })

onUnmounted(() => {
  chart?.destroy()
  chart = null
})
</script>

<template>
  <header class="mb-3 flex items-start justify-between gap-2">
    <div>
      <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
        Writing frequency
      </h2>
      <p class="text-xs text-gray-600 dark:text-gray-300">
        Entries per {{ bin }} {{ rangePhrase }}.
      </p>
    </div>
  </header>
  <div class="h-64 relative">
    <canvas ref="canvasRef" data-testid="dashboard-writing-chart"></canvas>
  </div>
</template>
