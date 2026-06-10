<script setup lang="ts">
import { computed } from 'vue'
import type { CalendarDay } from '@/types/dashboard'

/**
 * Calendar heatmap tile body. Pure CSS-grid rendering — no Chart.js
 * instance to own. The visible date window (and the fetch keyed on
 * it) stays in `DashboardView.vue` because it is derived from the
 * tile's measured width via the view's `TileGrid` ref.
 */
interface Props {
  days: CalendarDay[]
  loading: boolean
  hasLoaded: boolean
  error: string | null
  /** The window the grid should span (already width-expanded by the view). */
  dateRange: { from: string | null; to: string | null }
}

const props = defineProps<Props>()

/** Human-readable span of the visible heatmap, e.g. "14 months". */
const spanLabel = computed<string>(() => {
  const { from, to } = props.dateRange
  if (!from || !to) return ''
  const ms =
    new Date(to + 'T00:00:00').getTime() -
    new Date(from + 'T00:00:00').getTime()
  const days = Math.round(ms / (24 * 60 * 60 * 1000))
  if (days >= 365 * 2) {
    const y = Math.round(days / 365)
    return `${y} years`
  }
  if (days >= 60) {
    const m = Math.round(days / 30.44)
    return `${m} months`
  }
  const w = Math.max(1, Math.round(days / 7))
  return w === 1 ? '1 week' : `${w} weeks`
})

interface HeatmapCell {
  date: string
  entry_count: number
  total_words: number
  dayOfWeek: number // 0=Mon … 6=Sun
  weekIndex: number
}

interface HeatmapMonth {
  label: string
  colStart: number
}

const calendarGrid = computed(() => {
  const days = props.days
  if (days.length === 0)
    return {
      cells: [] as HeatmapCell[],
      weeks: 0,
      months: [] as HeatmapMonth[],
    }

  // Build a lookup of date -> day data
  const lookup = new Map<string, CalendarDay>()
  for (const d of days) {
    lookup.set(d.date, d)
  }

  // Use the supplied date range for grid boundaries — it already
  // accounts for container width expansion and selected-range minimum.
  const { from: heatFrom, to: heatTo } = props.dateRange
  const sortedDates = days.map((d) => d.date).sort()
  const startDate = heatFrom
    ? new Date(heatFrom + 'T00:00:00')
    : new Date(sortedDates[0] + 'T00:00:00')
  const endDate = heatTo
    ? new Date(heatTo + 'T00:00:00')
    : new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00')

  // Align start to the Monday of its week
  const startDay = startDate.getDay() // 0=Sun, 1=Mon, ...
  const mondayOffset = startDay === 0 ? 6 : startDay - 1
  startDate.setDate(startDate.getDate() - mondayOffset)

  const cells: HeatmapCell[] = []
  const months: HeatmapMonth[] = []
  let weekIndex = 0
  let lastMonth = -1
  const cur = new Date(startDate)

  while (cur <= endDate) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    const jsDay = cur.getDay() // 0=Sun
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1 // 0=Mon … 6=Sun

    // Track month labels
    if (cur.getMonth() !== lastMonth) {
      months.push({
        label: cur.toLocaleDateString('en-US', { month: 'short' }),
        colStart: weekIndex,
      })
      lastMonth = cur.getMonth()
    }

    const data = lookup.get(iso)
    cells.push({
      date: iso,
      entry_count: data?.entry_count ?? 0,
      total_words: data?.total_words ?? 0,
      dayOfWeek,
      weekIndex,
    })

    // Advance day
    cur.setDate(cur.getDate() + 1)
    // New week when we hit Monday
    const nextJsDay = cur.getDay()
    const nextDow = nextJsDay === 0 ? 6 : nextJsDay - 1
    if (nextDow === 0 && cur <= endDate) {
      weekIndex++
    }
  }

  return { cells, weeks: weekIndex + 1, months }
})

// Quantile thresholds for word-count heatmap coloring.
// Uses 25th/50th/75th percentiles of non-zero days so that
// outlier heavy-writing days stand out clearly.
const heatmapThresholds = computed(() => {
  const wordCounts = calendarGrid.value.cells
    .map((c) => c.total_words)
    .filter((w) => w > 0)
    .sort((a, b) => a - b)
  if (wordCounts.length === 0) return { p25: 1, p50: 2, p75: 3 }
  const pct = (p: number) =>
    wordCounts[
      Math.min(Math.floor(p * wordCounts.length), wordCounts.length - 1)
    ]
  return { p25: pct(0.25), p50: pct(0.5), p75: pct(0.75) }
})

function heatmapColor(words: number): string {
  if (words === 0) return '' // handled by class
  const { p25, p50, p75 } = heatmapThresholds.value
  if (words <= p25) return 'bg-violet-200 dark:bg-violet-300/40'
  if (words <= p50) return 'bg-violet-400 dark:bg-violet-400/60'
  if (words <= p75) return 'bg-violet-500 dark:bg-violet-500/70'
  return 'bg-violet-700 dark:bg-violet-400'
}

function heatmapTooltip(cell: HeatmapCell): string {
  const d = new Date(cell.date + 'T00:00:00')
  const formatted = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${formatted}: ${cell.total_words.toLocaleString()} words (${cell.entry_count} ${cell.entry_count === 1 ? 'entry' : 'entries'})`
}

const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']
</script>

<template>
  <header class="mb-3 flex items-start justify-between gap-2">
    <div>
      <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
        Writing Consistency
      </h2>
      <p class="text-xs text-gray-600 dark:text-gray-300">
        Daily word count{{ spanLabel ? ` over the last ${spanLabel}` : '' }}.
      </p>
    </div>
  </header>

  <div
    v-if="loading && !hasLoaded"
    class="py-12 text-center text-gray-600 dark:text-gray-300 text-sm"
    data-testid="dashboard-calendar-loading"
  >
    Loading calendar data…
  </div>

  <div
    v-else-if="error"
    class="mb-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
    data-testid="dashboard-calendar-error"
  >
    {{ error }}
  </div>

  <div
    v-else-if="days.length === 0"
    class="py-8 text-center text-gray-600 dark:text-gray-300 text-sm"
    data-testid="dashboard-calendar-empty"
  >
    No calendar data available for this range.
  </div>

  <div v-else class="overflow-hidden" data-testid="dashboard-calendar-content">
    <!-- Month labels -->
    <div
      class="relative flex text-[11px] text-gray-600 dark:text-gray-300 mb-1"
      :style="{ paddingLeft: '32px' }"
    >
      <div
        v-for="(m, mi) in calendarGrid.months"
        :key="mi"
        class="whitespace-nowrap"
        :style="{
          position: 'absolute',
          left: `${32 + m.colStart * 21}px`,
        }"
      >
        {{ m.label }}
      </div>
    </div>

    <div class="flex gap-0 mt-4" data-testid="dashboard-calendar-grid">
      <!-- Day-of-week labels -->
      <div
        class="flex flex-col gap-[3px] mr-1.5 text-[11px] text-gray-600 dark:text-gray-300"
      >
        <div
          v-for="(lbl, li) in WEEKDAY_LABELS"
          :key="li"
          class="h-[18px] flex items-center justify-end pr-1"
          :style="{ width: '28px' }"
        >
          {{ lbl }}
        </div>
      </div>

      <!-- Week columns -->
      <div class="flex gap-[3px]">
        <div
          v-for="w in calendarGrid.weeks"
          :key="w"
          class="flex flex-col gap-[3px]"
        >
          <template v-for="dow in 7" :key="`${w}-${dow}`">
            <div
              v-if="
                calendarGrid.cells.find(
                  (c) => c.weekIndex === w - 1 && c.dayOfWeek === dow - 1,
                )
              "
              class="w-[18px] h-[18px] rounded-sm"
              :class="[
                heatmapColor(
                  calendarGrid.cells.find(
                    (c) => c.weekIndex === w - 1 && c.dayOfWeek === dow - 1,
                  )!.total_words,
                ),
                calendarGrid.cells.find(
                  (c) => c.weekIndex === w - 1 && c.dayOfWeek === dow - 1,
                )!.total_words === 0
                  ? 'bg-gray-100 dark:bg-gray-700'
                  : '',
              ]"
              :title="
                heatmapTooltip(
                  calendarGrid.cells.find(
                    (c) => c.weekIndex === w - 1 && c.dayOfWeek === dow - 1,
                  )!,
                )
              "
              :data-testid="`dashboard-calendar-cell-${calendarGrid.cells.find((c) => c.weekIndex === w - 1 && c.dayOfWeek === dow - 1)!.date}`"
            ></div>
            <div v-else class="w-[18px] h-[18px]"></div>
          </template>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div
      class="flex items-center gap-2 mt-3 text-[11px] text-gray-600 dark:text-gray-300"
      data-testid="dashboard-calendar-legend"
    >
      <span>Fewer words</span>
      <div
        class="w-[18px] h-[18px] rounded-sm bg-gray-100 dark:bg-gray-700"
      ></div>
      <div
        class="w-[18px] h-[18px] rounded-sm bg-violet-200 dark:bg-violet-300/40"
      ></div>
      <div
        class="w-[18px] h-[18px] rounded-sm bg-violet-400 dark:bg-violet-400/60"
      ></div>
      <div
        class="w-[18px] h-[18px] rounded-sm bg-violet-600 dark:bg-violet-500/80"
      ></div>
      <span>More words</span>
    </div>
  </div>
</template>
