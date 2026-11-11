<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useDashboardStore, rangeToDates } from '@/stores/dashboard'
import {
  DASHBOARD_TILES,
  type DashboardBin,
  type DashboardRange,
  type DashboardTileDef,
  type DashboardTileId,
} from '@/types/dashboard'
import type { InsightsEntityType } from '@/types/insights'
import RangeBinControls from '@/components/RangeBinControls.vue'
import TileGrid from '@/components/TileGrid.vue'
import CalendarHeatmap from '@/components/dashboard/CalendarHeatmap.vue'
import EntityDistributionChart from '@/components/dashboard/EntityDistributionChart.vue'
import EntityTrendsChart from '@/components/dashboard/EntityTrendsChart.vue'
import MoodCorrelationChart from '@/components/dashboard/MoodCorrelationChart.vue'
import MoodTrendsChart from '@/components/dashboard/MoodTrendsChart.vue'
import WordCountChart from '@/components/dashboard/WordCountChart.vue'
import WritingFrequencyChart from '@/components/dashboard/WritingFrequencyChart.vue'

const store = useDashboardStore()
const router = useRouter()

function navigateToEntry(entryId: number): void {
  router.push({ name: 'entry-detail', params: { id: String(entryId) } })
}

/** Human-readable range phrase for chart descriptions, e.g. "over the last 6 months". */
const rangePhrase = computed<string>(() => {
  const r = store.range
  if (r === 'last_1_month') return 'over the last month'
  if (r === 'last_3_months') return 'over the last 3 months'
  if (r === 'last_6_months') return 'over the last 6 months'
  if (r === 'last_1_year') return 'over the last year'
  return 'across all time'
})

const MIN_ENTRIES_FOR_CHARTS = 5

const showCharts = computed(
  () => store.totalEntriesInRange >= MIN_ENTRIES_FOR_CHARTS,
)

/**
 * Per-tile definitions for the page's `<TileGrid>`. Conditional tiles
 * (mood-trends, mood-entity-correlation) carry an `available` flag
 * driven by the store's `moodScoringEnabled` getter so they vanish
 * entirely when scoring is off — including their entry in the saved
 * tile order. The grid component honours `available: false` by
 * skipping the tile during render.
 */
const dashboardTiles = computed<
  ReadonlyArray<DashboardTileDef & { available: boolean }>
>(() =>
  DASHBOARD_TILES.map((t) => ({
    ...t,
    available: t.requiresMoodScoring ? store.moodScoringEnabled : true,
  })),
)

function spanForTile(id: DashboardTileId): string {
  return store.getTileSpan(id) === 2 ? '1 / -1' : 'span 1'
}

function widthTitleFor(id: DashboardTileId): string {
  // The cycle goes half ↔ full; the button title names where the
  // next click will land.
  return store.getTileSpan(id) === 1 ? 'Full width' : 'Half width'
}

// Reference to the rendered TileGrid so we can reach the calendar
// tile's <section> element for width measurement (the heatmap sizes
// itself to the available tile width).
const tileGridRef = ref<{
  sectionEls: Partial<Record<DashboardTileId, HTMLElement>>
} | null>(null)

// --- Calendar heatmap date window ---

const calendarContainerRef = computed<HTMLElement | null>(
  () => tileGridRef.value?.sectionEls['calendar-heatmap'] ?? null,
)
const { width: calendarContainerWidth } = useElementSize(calendarContainerRef)

/** Pixel constants for the heatmap grid layout. */
const HEATMAP_CELL_SIZE = 18
const HEATMAP_GAP = 3
const HEATMAP_COL_WIDTH = HEATMAP_CELL_SIZE + HEATMAP_GAP // 21px
const HEATMAP_DAY_LABEL_WIDTH = 32 // left-side day-of-week labels

/**
 * The date range the calendar heatmap should display and fetch.
 * Expands backward from today to fill the available tile width,
 * with the selected range as a minimum bound.
 */
const heatmapDateRange = computed<{ from: string | null; to: string | null }>(
  () => {
    const now = new Date()
    const to = now.toISOString().slice(0, 10)
    const { from: rangeFrom } = rangeToDates(store.range)

    const cw = calendarContainerWidth.value
    if (cw <= 0) {
      // Container not measured yet — use the selected range as fallback
      return { from: rangeFrom, to: rangeFrom ? to : null }
    }

    const maxWeeks = Math.floor(
      (cw - HEATMAP_DAY_LABEL_WIDTH) / HEATMAP_COL_WIDTH,
    )
    const expandedStart = new Date(now)
    expandedStart.setDate(expandedStart.getDate() - maxWeeks * 7)

    // For "all time" or when the expanded range already covers the
    // selected range, use the expanded start. Otherwise use whichever
    // goes further back.
    let finalStart = expandedStart
    if (rangeFrom) {
      const rangeStart = new Date(rangeFrom + 'T00:00:00')
      if (rangeStart < expandedStart) finalStart = rangeStart
    }

    return { from: finalStart.toISOString().slice(0, 10), to }
  },
)

// Re-fetch calendar data when the visible date range changes (range
// selector change or container resize crossing a 21px boundary).
watch(
  () => `${heatmapDateRange.value.from}|${heatmapDateRange.value.to}`,
  () => {
    const { from, to } = heatmapDateRange.value
    store.loadCalendarHeatmap({ from, to })
  },
)

// --- Lifecycle ---

onMounted(async () => {
  await Promise.all([
    store.loadWritingStats(),
    store.loadMoodDimensions(),
    store.loadLayout(),
  ])
  const { from: heatFrom, to: heatTo } = heatmapDateRange.value
  const promises: Promise<void>[] = [
    store.loadEntityDistribution(),
    store.loadCalendarHeatmap({ from: heatFrom, to: heatTo }),
    store.loadEntityTrends(),
  ]
  if (store.moodScoringEnabled) {
    promises.push(store.loadMoodTrends())
    promises.push(store.loadMoodEntityCorrelation())
  }
  await Promise.all(promises)
})

// --- Event handlers ---

async function onRangeChange(r: DashboardRange): Promise<void> {
  store.clearDrillDown()
  const promises: Promise<void>[] = [
    store.loadWritingStats({ range: r }),
    store.loadEntityDistribution(),
    store.loadEntityTrends(),
  ]
  if (store.moodScoringEnabled) {
    promises.push(store.loadMoodTrends({ range: r }))
    promises.push(store.loadMoodEntityCorrelation())
  }
  await Promise.all(promises)
}

async function onBinChange(b: DashboardBin): Promise<void> {
  store.clearDrillDown()
  const promises: Promise<void>[] = [
    store.loadWritingStats({ bin: b }),
    store.loadEntityTrends(),
  ]
  if (store.moodScoringEnabled) {
    promises.push(store.loadMoodTrends({ bin: b }))
  }
  await Promise.all(promises)
}

async function onEntityTypeChange(type: InsightsEntityType): Promise<void> {
  await store.loadEntityDistribution(type)
}

async function onEntityTrendsTypeChange(
  type: InsightsEntityType,
): Promise<void> {
  await store.loadEntityTrends(type)
}

async function onMoodCorrelationDimensionChange(
  dimension: string,
): Promise<void> {
  await store.loadMoodEntityCorrelation(dimension)
}

async function onMoodCorrelationTypeChange(
  type: InsightsEntityType,
): Promise<void> {
  await store.loadMoodEntityCorrelation(undefined, type)
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
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          :class="
            store.editingLayout
              ? 'bg-violet-500 text-white border-violet-500'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600'
          "
          data-testid="dashboard-edit-layout-toggle"
          @click="store.editingLayout = !store.editingLayout"
        >
          {{ store.editingLayout ? 'Done editing' : 'Edit layout' }}
        </button>
      </div>
    </div>

    <!-- Filter bar (sticky so it stays visible while scrolling) -->
    <RangeBinControls
      class="mb-6"
      test-id-prefix="dashboard"
      :range="store.range"
      :bin="store.bin"
      @update:range="onRangeChange"
      @update:bin="onBinChange"
    />

    <!-- Loading / error / empty / charts -->
    <div
      v-if="store.loading && !store.hasLoaded"
      class="py-16 text-center text-gray-600 dark:text-gray-300"
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
      class="py-16 text-center text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs"
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
      <p class="text-xs mt-2 text-gray-600 dark:text-gray-300">
        Try widening the range or ingesting more entries.
      </p>
    </div>

    <div v-else>
      <TileGrid
        ref="tileGridRef"
        :tiles="dashboardTiles"
        :tile-order="store.tileOrder"
        :hidden-tiles="store.hiddenTiles"
        :editing="store.editingLayout"
        grid-class="grid grid-cols-1 xl:grid-cols-2 gap-6"
        :get-span="spanForTile"
        :get-width-title="widthTitleFor"
        test-id-prefix="dashboard"
        @move="(id, dir) => store.moveTile(id, dir)"
        @hide="(id) => store.hideTile(id)"
        @show="(id) => store.showTile(id)"
        @cycle-width="(id) => store.cycleTileWidth(id)"
        @reset="store.resetLayout()"
      >
        <template #tile-calendar-heatmap>
          <CalendarHeatmap
            :days="store.calendarDays"
            :loading="store.calendarLoading"
            :has-loaded="store.calendarHasLoaded"
            :error="store.calendarError"
            :date-range="heatmapDateRange"
          />
        </template>
        <template #tile-entity-distribution>
          <EntityDistributionChart
            :items="store.entityDistribution"
            :entity-type="store.entityType"
            :loading="store.entityLoading"
            :has-loaded="store.entityHasLoaded"
            :error="store.entityError"
            :range-phrase="rangePhrase"
            @change-type="onEntityTypeChange"
          />
        </template>
        <template #tile-writing-frequency>
          <WritingFrequencyChart
            :bins="store.bins"
            :range="store.range"
            :bin="store.bin"
            :range-phrase="rangePhrase"
          />
        </template>
        <template #tile-word-count>
          <WordCountChart
            :bins="store.bins"
            :range="store.range"
            :bin="store.bin"
            :range-phrase="rangePhrase"
          />
        </template>
        <template #tile-mood-trends>
          <MoodTrendsChart
            :dimensions="store.moodDimensions"
            :bins="store.moodBins"
            :selected-dimensions="store.selectedMoodDimensions"
            :is-dimension-visible="store.isMoodDimensionVisible"
            :group-selection-state="store.moodGroupSelectionState"
            :range="store.range"
            :bin="store.bin"
            :range-phrase="rangePhrase"
            :loading="store.moodLoading"
            :has-loaded="store.moodHasLoaded"
            :error="store.moodError"
            :drill-period="store.drillPeriod"
            :drill-dimension="store.drillDimension"
            :drill-entries="store.drillEntries"
            :drill-loading="store.drillLoading"
            :drill-error="store.drillError"
            @toggle-dimension="store.toggleMoodDimension"
            @toggle-group="store.toggleMoodGroup"
            @drill-down="(p, d) => store.loadDrillDown(p, d)"
            @clear-drill-down="store.clearDrillDown()"
            @open-entry="navigateToEntry"
          />
        </template>
        <template #tile-topic-trends>
          <EntityTrendsChart
            :entities="store.entityTrendEntities"
            :bins="store.entityTrends"
            :hidden-entities="store.hiddenEntityTrends"
            :entity-type="store.entityTrendsType"
            :range="store.range"
            :bin="store.bin"
            :range-phrase="rangePhrase"
            :loading="store.entityTrendsLoading"
            :has-loaded="store.entityTrendsHasLoaded"
            :error="store.entityTrendsError"
            @change-type="onEntityTrendsTypeChange"
            @toggle-entity="store.toggleEntityTrend"
            @show-all="store.showAllEntityTrends()"
            @hide-all="store.hideAllEntityTrends()"
          />
        </template>
        <template #tile-mood-entity-correlation>
          <MoodCorrelationChart
            :items="store.moodCorrelationItems"
            :overall-avg="store.moodCorrelationOverallAvg"
            :dimension="store.moodCorrelationDimension"
            :entity-type="store.moodCorrelationType"
            :dimensions="store.moodDimensions"
            :loading="store.moodCorrelationLoading"
            :has-loaded="store.moodCorrelationHasLoaded"
            :error="store.moodCorrelationError"
            :range-phrase="rangePhrase"
            @change-dimension="onMoodCorrelationDimensionChange"
            @change-type="onMoodCorrelationTypeChange"
          />
        </template>
      </TileGrid>
      <!-- end dashboard tiles grid -->
    </div>
  </div>
</template>
