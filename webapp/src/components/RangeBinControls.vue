<script setup lang="ts">
import { computed } from 'vue'
import {
  DASHBOARD_RANGES,
  DASHBOARD_BINS,
  type DashboardRange,
  type DashboardBin,
} from '@/types/dashboard'

// Range + bin-width chip strip — extracted from DashboardView so the
// /fitness page can reuse the exact same affordance instead of growing
// its own subtly-different version. Stay v-model-compatible
// (`update:range`, `update:bin`) so adopting it on a new view is
// `<RangeBinControls v-model:range="r" v-model:bin="b" />`.
//
// Adopters that don't need both controls can pass an empty array via
// `availableRanges` / `availableBins` — the strip is hidden if empty
// rather than rendering an empty group.

interface Props {
  range: DashboardRange
  bin: DashboardBin
  availableRanges?: readonly DashboardRange[]
  availableBins?: readonly DashboardBin[]
  /** Optional analytics / accessibility prefix for the data-testid set.
   *  Defaults to "rangebin" so existing dashboard tests can re-target
   *  to "dashboard" explicitly if needed. */
  testIdPrefix?: string
}

const props = withDefaults(defineProps<Props>(), {
  availableRanges: () => DASHBOARD_RANGES,
  availableBins: () => DASHBOARD_BINS,
  testIdPrefix: 'rangebin',
})

const emit = defineEmits<{
  (e: 'update:range', value: DashboardRange): void
  (e: 'update:bin', value: DashboardBin): void
}>()

const ranges = computed(() => props.availableRanges)
const bins = computed(() => props.availableBins)

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

function binLabel(b: DashboardBin): string {
  return b.charAt(0).toUpperCase() + b.slice(1)
}

function selectRange(r: DashboardRange) {
  if (r === props.range) return
  emit('update:range', r)
}

function selectBin(b: DashboardBin) {
  if (b === props.bin) return
  emit('update:bin', b)
}
</script>

<template>
  <div
    class="flex flex-wrap items-end gap-6 sticky top-16 z-10 bg-white dark:bg-gray-800 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700/60 shadow-xs px-5 py-3"
    :data-testid="`${testIdPrefix}-filters`"
  >
    <div v-if="ranges.length > 0">
      <label
        class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
        >Range</label
      >
      <div
        class="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="Date range"
        :data-testid="`${testIdPrefix}-range`"
      >
        <button
          v-for="r in ranges"
          :key="r"
          type="button"
          class="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
          :class="
            range === r
              ? 'bg-violet-500 text-white border-violet-500'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60'
          "
          :data-testid="`${testIdPrefix}-range-${r}`"
          :aria-pressed="range === r"
          @click="selectRange(r)"
        >
          {{ rangeLabel(r) }}
        </button>
      </div>
    </div>
    <div v-if="bins.length > 0">
      <label
        class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
        >Bin width</label
      >
      <div
        class="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="Bin width"
        :data-testid="`${testIdPrefix}-bin`"
      >
        <button
          v-for="b in bins"
          :key="b"
          type="button"
          class="px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize"
          :class="
            bin === b
              ? 'bg-violet-500 text-white border-violet-500'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60'
          "
          :data-testid="`${testIdPrefix}-bin-${b}`"
          :aria-pressed="bin === b"
          @click="selectBin(b)"
        >
          {{ binLabel(b) }}
        </button>
      </div>
    </div>
  </div>
</template>
