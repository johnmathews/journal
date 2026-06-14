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
// 'index' (not 'nearest') so a tooltip lists every series at the hovered
// x-position rather than only the closest point. Data has meaning in
// context — seeing all dimensions at one date is the point of these charts.
// Single-dataset charts (doughnut distribution, correlation bars) are
// unaffected since 'index' and 'nearest' coincide when there's one item per x.
Chart.defaults.plugins.tooltip.mode = 'index'
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
 *
 * Dark mode uses `--color-gray-700` rather than a near-white tint:
 * gray-100 on the dark card background read as harsh bright-white
 * gridlines that overpowered the data. gray-700 keeps them legible but
 * subtle. Light mode keeps gray-300 (a soft line on white).
 */
export function getThemedGridColor(): string {
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
  return isDark
    ? getCssVariable('--color-gray-700')
    : getCssVariable('--color-gray-300')
}

/**
 * Build the canonical line-chart options block. Centralises the
 * hover/legend/tooltip/scale shape every line chart in the app
 * should look and feel the same — fitness charts now use it; the
 * dashboard's writing and word-count line charts use it; new charts
 * should adopt it instead of hand-rolling another inline options
 * object.
 *
 * Bespoke needs (bar charts, dual-axis, click-to-drill-down) keep
 * inline options; this builder only covers the line-chart common
 * case. See `docs/chart-style-guide.md` for the recipe.
 *
 * `interaction.mode = 'index'` + `intersect: false` is the same
 * pairing the dashboard's entityTrends chart uses; it makes the
 * tooltip resolve to "all series at this x" rather than the nearest
 * point, which the user expected after seeing the dashboard.
 */
export interface LineChartOptionsArgs {
  colors: ChartColors
  /** Show or hide the built-in Chart.js legend (chip strip below
   *  the chart). Default `false` because most line charts in this
   *  app use external chips for series toggling. */
  showLegend?: boolean
  /** Y-axis: start at zero. Default `true`. Pass `false` for
   *  metrics where the interesting range floats above zero
   *  (resting HR, HRV, sleep score). */
  beginAtZero?: boolean
  /** Y-axis tick precision. Default `0` (integer ticks). */
  yTickPrecision?: number
}

export function buildLineChartOptions(args: LineChartOptionsArgs) {
  const {
    colors,
    showLegend = false,
    beginAtZero = true,
    yTickPrecision = 0,
  } = args
  return {
    responsive: true,
    maintainAspectRatio: false,
    // Resolve hover to "all series at this x" so multi-series charts
    // show a vertical-crosshair tooltip rather than the single
    // nearest point. Matches the dashboard's entity-trends behaviour.
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: showLegend, position: 'bottom' as const },
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
        ticks: {
          color: colors.textColor.light,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
        },
      },
      y: {
        beginAtZero,
        grid: { color: getThemedGridColor() },
        ticks: { color: colors.textColor.light, precision: yTickPrecision },
      },
    },
  }
}
