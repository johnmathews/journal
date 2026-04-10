import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Chart } from 'chart.js'
import { chartAreaGradient, getChartColors } from '../chartjs-config'

describe('chartjs-config module', () => {
  it('registers Chart.js default tooltip configuration at import time', () => {
    // The module sets these globally when imported. If it ever becomes
    // tree-shaken or lazy-loaded, these assertions catch the regression.
    expect(Chart.defaults.font.family).toBe('"Inter", sans-serif')
    expect(Chart.defaults.font.weight).toBe(500)
    expect(Chart.defaults.plugins.tooltip.borderWidth).toBe(1)
    expect(Chart.defaults.plugins.tooltip.displayColors).toBe(false)
    expect(Chart.defaults.plugins.tooltip.mode).toBe('nearest')
    expect(Chart.defaults.plugins.tooltip.intersect).toBe(false)
    expect(Chart.defaults.plugins.tooltip.caretSize).toBe(0)
    expect(Chart.defaults.plugins.tooltip.caretPadding).toBe(20)
    expect(Chart.defaults.plugins.tooltip.cornerRadius).toBe(8)
    expect(Chart.defaults.plugins.tooltip.padding).toBe(8)
  })
})

describe('chartAreaGradient', () => {
  const makeCtx = () => {
    const addColorStop = vi.fn()
    const gradient = { addColorStop }
    const createLinearGradient = vi.fn().mockReturnValue(gradient)
    return {
      ctx: { createLinearGradient } as unknown as CanvasRenderingContext2D,
      addColorStop,
      createLinearGradient,
      gradient,
    }
  }

  it('returns "transparent" when ctx is null', () => {
    expect(
      chartAreaGradient(
        null,
        { top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100 },
        [{ stop: 0, color: '#000' }],
      ),
    ).toBe('transparent')
  })

  it('returns "transparent" when chartArea is null', () => {
    const { ctx } = makeCtx()
    expect(chartAreaGradient(ctx, null, [{ stop: 0, color: '#000' }])).toBe(
      'transparent',
    )
  })

  it('returns "transparent" when colorStops is null', () => {
    const { ctx } = makeCtx()
    expect(
      chartAreaGradient(
        ctx,
        { top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100 },
        null,
      ),
    ).toBe('transparent')
  })

  it('returns "transparent" when colorStops is an empty array', () => {
    const { ctx } = makeCtx()
    expect(
      chartAreaGradient(
        ctx,
        { top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100 },
        [],
      ),
    ).toBe('transparent')
  })

  it('creates a vertical linear gradient from bottom to top of the chart area', () => {
    const { ctx, createLinearGradient, gradient } = makeCtx()
    const result = chartAreaGradient(
      ctx,
      { top: 10, bottom: 200, left: 0, right: 100, width: 100, height: 190 },
      [
        { stop: 0, color: 'rgba(0,0,0,0)' },
        { stop: 1, color: 'rgba(255,0,0,1)' },
      ],
    )

    expect(createLinearGradient).toHaveBeenCalledWith(0, 200, 0, 10)
    expect(result).toBe(gradient)
  })

  it('applies every colorStop to the returned gradient in order', () => {
    const { ctx, addColorStop } = makeCtx()
    chartAreaGradient(
      ctx,
      { top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100 },
      [
        { stop: 0, color: '#000' },
        { stop: 0.5, color: '#888' },
        { stop: 1, color: '#fff' },
      ],
    )

    expect(addColorStop).toHaveBeenCalledTimes(3)
    expect(addColorStop).toHaveBeenNthCalledWith(1, 0, '#000')
    expect(addColorStop).toHaveBeenNthCalledWith(2, 0.5, '#888')
    expect(addColorStop).toHaveBeenNthCalledWith(3, 1, '#fff')
  })
})

describe('getChartColors', () => {
  beforeEach(() => {
    // Clear leftover CSS variables from earlier tests, then seed the one
    // variable getChartColors cannot do without: adjustColorOpacity throws
    // on an empty string, so gridColor.dark (derived from --color-gray-700)
    // needs a valid hex value.
    document.documentElement.style.cssText = ''
    document.documentElement.style.setProperty('--color-gray-700', '#374151')
  })

  it('returns an object with the expected color-pair keys', () => {
    const colors = getChartColors()

    expect(colors).toHaveProperty('textColor.light')
    expect(colors).toHaveProperty('textColor.dark')
    expect(colors).toHaveProperty('gridColor.light')
    expect(colors).toHaveProperty('gridColor.dark')
    expect(colors).toHaveProperty('backdropColor.light')
    expect(colors).toHaveProperty('backdropColor.dark')
    expect(colors).toHaveProperty('tooltipTitleColor.light')
    expect(colors).toHaveProperty('tooltipTitleColor.dark')
    expect(colors).toHaveProperty('tooltipBodyColor.light')
    expect(colors).toHaveProperty('tooltipBodyColor.dark')
    expect(colors).toHaveProperty('tooltipBgColor.light')
    expect(colors).toHaveProperty('tooltipBgColor.dark')
    expect(colors).toHaveProperty('tooltipBorderColor.light')
    expect(colors).toHaveProperty('tooltipBorderColor.dark')
  })

  it('reads values from :root CSS custom properties when they are set', () => {
    document.documentElement.style.setProperty('--color-gray-400', '#abcdef')
    document.documentElement.style.setProperty('--color-gray-100', '#123456')

    const colors = getChartColors()

    expect(colors.textColor.light).toBe('#abcdef')
    expect(colors.gridColor.light).toBe('#123456')
  })

  it('applies adjustColorOpacity to the gridColor dark variant (derived from --color-gray-700)', () => {
    document.documentElement.style.setProperty('--color-gray-700', '#112233')

    const colors = getChartColors()

    // adjustColorOpacity for a hex color produces rgba(...)
    expect(colors.gridColor.dark).toBe('rgba(17, 34, 51, 0.6)')
  })
})
