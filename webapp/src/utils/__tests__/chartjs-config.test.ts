import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Chart } from 'chart.js'
import {
  chartAreaGradient,
  getChartColors,
  getThemedGridColor,
  TOOLTIP_HOVER_DELAY_MS,
  tooltipHoverDelayPlugin,
} from '../chartjs-config'

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

describe('getThemedGridColor', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.style.cssText = ''
    document.documentElement.style.setProperty('--color-gray-100', '#f3f4f6')
    document.documentElement.style.setProperty('--color-gray-300', '#d1d5db')
  })

  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('returns the lighter gray-100 variant when <html> has the "dark" class', () => {
    document.documentElement.classList.add('dark')
    expect(getThemedGridColor()).toBe('#f3f4f6')
  })

  it('returns the darker gray-300 variant when <html> is in light mode', () => {
    expect(getThemedGridColor()).toBe('#d1d5db')
  })
})

describe('tooltipHoverDelayPlugin', () => {
  type ActiveEl = { datasetIndex: number; index: number }

  function makeFakeChart(activeElements: ActiveEl[] = []) {
    const setActiveElements = vi.fn()
    const update = vi.fn()
    const tooltip = {
      getActiveElements: () => activeElements,
      setActiveElements,
      opacity: 1,
    }
    return {
      chart: { tooltip, update } as unknown as Parameters<
        NonNullable<typeof tooltipHoverDelayPlugin.afterEvent>
      >[0],
      tooltip,
      setActiveElements,
      update,
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exposes a 1000ms delay constant', () => {
    expect(TOOLTIP_HOVER_DELAY_MS).toBe(1000)
  })

  it('hides the tooltip immediately on a fresh hover and reveals it after the dwell timer fires', () => {
    const { chart, setActiveElements, update } = makeFakeChart([
      { datasetIndex: 0, index: 3 },
    ])

    tooltipHoverDelayPlugin.afterEvent!(
      chart,
      {
        event: { type: 'mousemove', x: 100, y: 50 },
        replay: false,
        cancelable: true,
        inChartArea: true,
      } as unknown as Parameters<
        NonNullable<typeof tooltipHoverDelayPlugin.afterEvent>
      >[1],
      {},
    )

    // First call: tooltip is suppressed via setActiveElements([], ...).
    expect(setActiveElements).toHaveBeenCalledWith([], { x: 0, y: 0 })

    // Before the timer elapses, no restore call has been made.
    setActiveElements.mockClear()
    vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS - 1)
    expect(setActiveElements).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()

    // After the dwell timer fires, the saved active elements are restored
    // and the chart is asked to re-render without animation.
    vi.advanceTimersByTime(2)
    expect(setActiveElements).toHaveBeenCalledWith(
      [{ datasetIndex: 0, index: 3 }],
      { x: 100, y: 50 },
    )
    expect(update).toHaveBeenCalledWith('none')
  })

  it('clears the dwell timer on mouseout so the tooltip never appears unbidden', () => {
    const { chart, setActiveElements, update } = makeFakeChart([
      { datasetIndex: 1, index: 5 },
    ])

    tooltipHoverDelayPlugin.afterEvent!(
      chart,
      {
        event: { type: 'mousemove', x: 10, y: 20 },
        replay: false,
        cancelable: true,
        inChartArea: true,
      } as unknown as Parameters<
        NonNullable<typeof tooltipHoverDelayPlugin.afterEvent>
      >[1],
      {},
    )
    setActiveElements.mockClear()

    // Cursor leaves the chart before the dwell completes.
    tooltipHoverDelayPlugin.afterEvent!(
      chart,
      {
        event: { type: 'mouseout' },
        replay: false,
        cancelable: true,
        inChartArea: false,
      } as unknown as Parameters<
        NonNullable<typeof tooltipHoverDelayPlugin.afterEvent>
      >[1],
      {},
    )

    vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS + 100)

    // Timer was cancelled — neither restore nor update fires.
    expect(setActiveElements).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('restarts the dwell timer when the cursor moves to a different active element', () => {
    const fake = makeFakeChart([{ datasetIndex: 0, index: 1 }])

    tooltipHoverDelayPlugin.afterEvent!(
      fake.chart,
      {
        event: { type: 'mousemove', x: 1, y: 1 },
        replay: false,
        cancelable: true,
        inChartArea: true,
      } as unknown as Parameters<
        NonNullable<typeof tooltipHoverDelayPlugin.afterEvent>
      >[1],
      {},
    )

    // Halfway through the first dwell, cursor moves to a new point.
    vi.advanceTimersByTime(500)
    ;(
      fake.tooltip as unknown as { getActiveElements: () => ActiveEl[] }
    ).getActiveElements = () => [{ datasetIndex: 0, index: 7 }]

    tooltipHoverDelayPlugin.afterEvent!(
      fake.chart,
      {
        event: { type: 'mousemove', x: 2, y: 2 },
        replay: false,
        cancelable: true,
        inChartArea: true,
      } as unknown as Parameters<
        NonNullable<typeof tooltipHoverDelayPlugin.afterEvent>
      >[1],
      {},
    )
    fake.setActiveElements.mockClear()
    fake.update.mockClear()

    // The original timer should have been cleared; only the *new* one
    // (started at t=500ms) fires the restore at t=1500ms.
    vi.advanceTimersByTime(999)
    expect(fake.update).not.toHaveBeenCalled()

    vi.advanceTimersByTime(2)
    expect(fake.setActiveElements).toHaveBeenCalledWith(
      [{ datasetIndex: 0, index: 7 }],
      { x: 2, y: 2 },
    )
    expect(fake.update).toHaveBeenCalledWith('none')
  })

  it('is a no-op when the chart has no tooltip (defensive guard)', () => {
    const chart = { update: vi.fn() } as unknown as Parameters<
      NonNullable<typeof tooltipHoverDelayPlugin.afterEvent>
    >[0]

    expect(() =>
      tooltipHoverDelayPlugin.afterEvent!(
        chart,
        {
          event: { type: 'mousemove', x: 0, y: 0 },
          replay: false,
          cancelable: true,
          inChartArea: true,
        } as unknown as Parameters<
          NonNullable<typeof tooltipHoverDelayPlugin.afterEvent>
        >[1],
        {},
      ),
    ).not.toThrow()
  })

  it('resets state when mousemove finds no active element (cursor between points)', () => {
    const fake = makeFakeChart([])

    tooltipHoverDelayPlugin.afterEvent!(
      fake.chart,
      {
        event: { type: 'mousemove', x: 1, y: 1 },
        replay: false,
        cancelable: true,
        inChartArea: true,
      } as unknown as Parameters<
        NonNullable<typeof tooltipHoverDelayPlugin.afterEvent>
      >[1],
      {},
    )

    vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS + 100)
    // No timer was scheduled, so neither restore nor update fires.
    expect(fake.setActiveElements).not.toHaveBeenCalled()
    expect(fake.update).not.toHaveBeenCalled()
  })

  it('does not restart the dwell timer while the cursor stays on the same point', () => {
    const fake = makeFakeChart([{ datasetIndex: 0, index: 1 }])

    tooltipHoverDelayPlugin.afterEvent!(
      fake.chart,
      {
        event: { type: 'mousemove', x: 1, y: 1 },
        replay: false,
        cancelable: true,
        inChartArea: true,
      } as unknown as Parameters<
        NonNullable<typeof tooltipHoverDelayPlugin.afterEvent>
      >[1],
      {},
    )

    // Same point, but a follow-up mousemove fires (mouse drifts within the
    // same nearest-point zone). The dwell timer should NOT be reset.
    vi.advanceTimersByTime(800)
    tooltipHoverDelayPlugin.afterEvent!(
      fake.chart,
      {
        event: { type: 'mousemove', x: 2, y: 2 },
        replay: false,
        cancelable: true,
        inChartArea: true,
      } as unknown as Parameters<
        NonNullable<typeof tooltipHoverDelayPlugin.afterEvent>
      >[1],
      {},
    )

    // Original timer fires at t=1000ms, only 200ms after the drift.
    vi.advanceTimersByTime(201)
    expect(fake.update).toHaveBeenCalledWith('none')
  })

  it('beforeDestroy clears any pending dwell timer', () => {
    const fake = makeFakeChart([{ datasetIndex: 0, index: 4 }])

    tooltipHoverDelayPlugin.afterEvent!(
      fake.chart,
      {
        event: { type: 'mousemove', x: 1, y: 1 },
        replay: false,
        cancelable: true,
        inChartArea: true,
      } as unknown as Parameters<
        NonNullable<typeof tooltipHoverDelayPlugin.afterEvent>
      >[1],
      {},
    )
    fake.setActiveElements.mockClear()

    tooltipHoverDelayPlugin.beforeDestroy!(
      fake.chart,
      {} as Parameters<
        NonNullable<typeof tooltipHoverDelayPlugin.beforeDestroy>
      >[1],
      {},
    )

    vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS + 100)
    // Timer was cleared on destroy — no restore call.
    expect(fake.setActiveElements).not.toHaveBeenCalled()
    expect(fake.update).not.toHaveBeenCalled()
  })

  it('beforeDestroy on a chart with no recorded state is a safe no-op', () => {
    const fake = makeFakeChart()
    expect(() =>
      tooltipHoverDelayPlugin.beforeDestroy!(
        fake.chart,
        {} as Parameters<
          NonNullable<typeof tooltipHoverDelayPlugin.beforeDestroy>
        >[1],
        {},
      ),
    ).not.toThrow()
  })

  it('swallows errors from setActiveElements when the chart is destroyed mid-delay', () => {
    const fake = makeFakeChart([{ datasetIndex: 0, index: 2 }])

    tooltipHoverDelayPlugin.afterEvent!(
      fake.chart,
      {
        event: { type: 'mousemove', x: 1, y: 1 },
        replay: false,
        cancelable: true,
        inChartArea: true,
      } as unknown as Parameters<
        NonNullable<typeof tooltipHoverDelayPlugin.afterEvent>
      >[1],
      {},
    )

    // Simulate the chart being torn down: setActiveElements throws when
    // called on a destroyed tooltip in real Chart.js. The plugin must not
    // surface that error.
    fake.setActiveElements.mockImplementationOnce(() => {
      throw new Error('chart destroyed')
    })

    expect(() =>
      vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS + 1),
    ).not.toThrow()
  })
})
