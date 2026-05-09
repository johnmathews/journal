import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type Chart as ChartInstance,
  type ChartArea,
  type Plugin,
} from 'chart.js'
import { adjustColorOpacity, getCssVariable } from './mosaic'

// Register every Chart.js piece the current charts need. Chart.js
// 4 is fully tree-shakable — nothing is registered by default, so
// missing any of these at render time produces a runtime error.
// Add new registrations here (not inside individual views) so
// every chart in the app shares the same set.
Chart.register(
  ArcElement,
  BarController,
  BarElement,
  DoughnutController,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Legend,
  Tooltip,
)

Chart.defaults.font.family = '"Inter", sans-serif'
Chart.defaults.font.weight = 500
Chart.defaults.plugins.tooltip.borderWidth = 1
Chart.defaults.plugins.tooltip.displayColors = false
Chart.defaults.plugins.tooltip.mode = 'nearest'
Chart.defaults.plugins.tooltip.intersect = false
Chart.defaults.plugins.tooltip.position = 'nearest'
Chart.defaults.plugins.tooltip.caretSize = 0
Chart.defaults.plugins.tooltip.caretPadding = 20
Chart.defaults.plugins.tooltip.cornerRadius = 8
Chart.defaults.plugins.tooltip.padding = 8

// --- Tooltip hover-intent delay ---
//
// Chart.js shows tooltips immediately on hover, which feels intrusive on
// dense charts (the tooltip lands under the cursor before you've decided
// to inspect a point). This plugin requires the cursor to dwell on the
// same active element(s) for `TOOLTIP_HOVER_DELAY_MS` before the tooltip
// is allowed to render. Moving to a different point resets the timer;
// leaving the chart cancels it.
//
// Implementation: Chart.js's tooltip plugin processes pointer events in
// its own afterEvent and animates `tooltip.opacity` via Chart.js's
// animator. Mutating `opacity` directly does not stick because the
// running animation overwrites it on the next frame. Instead, while the
// dwell timer is pending, we force the active-element set to empty via
// `tooltip.setActiveElements([], ...)` — that is the supported API and
// Chart.js's own state machinery keeps the tooltip hidden across redraws.
// When the timer fires we restore the saved active elements and the
// tooltip animates in normally.

export const TOOLTIP_HOVER_DELAY_MS = 1000

type ActiveElement = { datasetIndex: number; index: number }

interface HoverDelayState {
  lastKey: string | null
  ready: boolean
  timer: ReturnType<typeof setTimeout> | null
  pendingActive: ActiveElement[]
  pendingPosition: { x: number; y: number }
}

const hoverDelayStates = new WeakMap<ChartInstance, HoverDelayState>()

function getHoverDelayState(chart: ChartInstance): HoverDelayState {
  let state = hoverDelayStates.get(chart)
  if (!state) {
    state = {
      lastKey: null,
      ready: false,
      timer: null,
      pendingActive: [],
      pendingPosition: { x: 0, y: 0 },
    }
    hoverDelayStates.set(chart, state)
  }
  return state
}

function resetHoverDelayState(state: HoverDelayState): void {
  if (state.timer) {
    clearTimeout(state.timer)
    state.timer = null
  }
  state.lastKey = null
  state.ready = false
  state.pendingActive = []
}

export const tooltipHoverDelayPlugin: Plugin = {
  id: 'tooltipHoverDelay',
  afterEvent(chart, args) {
    const event = args.event
    const state = getHoverDelayState(chart)
    const tooltip = chart.tooltip
    if (!tooltip) return

    if (event.type === 'mouseout') {
      resetHoverDelayState(state)
      return
    }

    if (event.type !== 'mousemove') return

    const active = tooltip.getActiveElements()
    if (!active || active.length === 0) {
      resetHoverDelayState(state)
      return
    }

    const key = active.map((a) => `${a.datasetIndex}:${a.index}`).join(',')

    if (key !== state.lastKey) {
      // New active point — start (or restart) the dwell timer and stash
      // the elements/position so we can restore them when the timer fires.
      state.lastKey = key
      state.ready = false
      state.pendingActive = active.map((a) => ({
        datasetIndex: a.datasetIndex,
        index: a.index,
      }))
      const ev = event as { x?: number; y?: number }
      state.pendingPosition = { x: ev.x ?? 0, y: ev.y ?? 0 }
      if (state.timer) clearTimeout(state.timer)
      state.timer = setTimeout(() => {
        state.timer = null
        state.ready = true
        try {
          tooltip.setActiveElements(state.pendingActive, state.pendingPosition)
          chart.update('none')
        } catch {
          // chart was destroyed mid-delay — nothing to update
        }
      }, TOOLTIP_HOVER_DELAY_MS)
    }

    if (!state.ready) {
      // Force the tooltip back to "no active element" so it stays hidden
      // across redraws. Chart.js will re-promote elements on the next
      // mousemove if the timer hasn't elapsed; the `key !== lastKey` guard
      // above prevents the dwell timer from being reset by these no-op
      // re-promotions.
      tooltip.setActiveElements([], { x: 0, y: 0 })
      args.changed = true
    }
  },
  beforeDestroy(chart) {
    const state = hoverDelayStates.get(chart)
    if (state) {
      resetHoverDelayState(state)
      hoverDelayStates.delete(chart)
    }
  },
}

Chart.register(tooltipHoverDelayPlugin)

export interface ColorStop {
  stop: number
  color: string
}

export function chartAreaGradient(
  ctx: CanvasRenderingContext2D | null,
  chartArea: ChartArea | null,
  colorStops: ColorStop[] | null,
): CanvasGradient | string {
  if (!ctx || !chartArea || !colorStops || colorStops.length === 0) {
    return 'transparent'
  }
  const gradient = ctx.createLinearGradient(
    0,
    chartArea.bottom,
    0,
    chartArea.top,
  )
  for (const { stop, color } of colorStops) {
    gradient.addColorStop(stop, color)
  }
  return gradient
}

export interface ChartColorPair {
  light: string
  dark: string
}

export interface ChartColors {
  textColor: ChartColorPair
  gridColor: ChartColorPair
  backdropColor: ChartColorPair
  tooltipTitleColor: ChartColorPair
  tooltipBodyColor: ChartColorPair
  tooltipBgColor: ChartColorPair
  tooltipBorderColor: ChartColorPair
}

export function getChartColors(): ChartColors {
  return {
    textColor: {
      light: getCssVariable('--color-gray-400'),
      dark: getCssVariable('--color-gray-500'),
    },
    gridColor: {
      light: getCssVariable('--color-gray-100'),
      dark: adjustColorOpacity(getCssVariable('--color-gray-700'), 0.6),
    },
    backdropColor: {
      light: getCssVariable('--color-white'),
      dark: getCssVariable('--color-gray-800'),
    },
    tooltipTitleColor: {
      light: getCssVariable('--color-gray-800'),
      dark: getCssVariable('--color-gray-100'),
    },
    tooltipBodyColor: {
      light: getCssVariable('--color-gray-500'),
      dark: getCssVariable('--color-gray-400'),
    },
    tooltipBgColor: {
      light: getCssVariable('--color-white'),
      dark: getCssVariable('--color-gray-700'),
    },
    tooltipBorderColor: {
      light: getCssVariable('--color-gray-200'),
      dark: getCssVariable('--color-gray-600'),
    },
  }
}

/**
 * Returns a grid-line color tuned for the active theme. Reads
 * `<html class="dark">` at call time so charts that re-render after a
 * theme toggle (e.g. via a data refresh) pick up the right value.
 *
 * Why a helper instead of `colors.gridColor.light`: the existing chart
 * code historically used `gridColor.light` regardless of theme, which
 * looks fine on dark backgrounds (light line on dark) but renders as a
 * barely-visible whisper on white. This helper picks the variant whose
 * contrast actually works against the current background.
 */
export function getThemedGridColor(): string {
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
  return isDark
    ? getCssVariable('--color-gray-100')
    : getCssVariable('--color-gray-300')
}
