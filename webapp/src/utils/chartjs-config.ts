import {
  ArcElement,
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
  type ChartArea,
} from 'chart.js'
import { adjustColorOpacity, getCssVariable } from './mosaic'

// Register every Chart.js piece the current charts need. Chart.js
// 4 is fully tree-shakable — nothing is registered by default, so
// missing any of these at render time produces a runtime error.
// Add new registrations here (not inside individual views) so
// every chart in the app shares the same set.
Chart.register(
  ArcElement,
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
