/**
 * Shared Chart.js / chartjs-config mocks for the dashboard component
 * specs (split out of `DashboardView.test.ts` in W23 so each per-tile
 * spec doesn't repeat ~80 lines of mock plumbing).
 *
 * Usage in a spec:
 *
 * ```ts
 * vi.mock('chart.js', async () =>
 *   (await import('./chart-test-utils')).chartJsMockModule,
 * )
 * vi.mock('@/utils/chartjs-config', async (importOriginal) => {
 *   const actual =
 *     await importOriginal<typeof import('@/utils/chartjs-config')>()
 *   return (await import('./chart-test-utils')).withStubbedChartColors(actual)
 * })
 * import { chartConstructorSpy, destroySpy } from './chart-test-utils'
 * ```
 *
 * `vi.mock` factories cannot close over file-local variables (they are
 * hoisted), but they *can* dynamically import this module — the factory
 * and the spec then share the same spy instances via the module cache.
 */
import { vi } from 'vitest'

export const destroySpy = vi.fn()

export const chartConstructorSpy = vi
  .fn()
  .mockImplementation(() => ({ destroy: destroySpy }))

// `Chart` must be callable with `new`, so we wrap the spy in a
// `function` declaration that forwards to it. A plain
// `vi.fn().mockImplementation(...)` is not a constructor.
function ChartStub(this: unknown, ...args: unknown[]): { destroy: () => void } {
  return chartConstructorSpy(...args)
}

/**
 * Module shape for `vi.mock('chart.js', ...)`. A smoke-level stub —
 * the specs assert on constructor calls and configs, not real canvas
 * rendering. `Chart.register` and `Chart.defaults` are the static
 * surface chartjs-config.ts touches at import time, so both are
 * attached to the constructor stub.
 */
export const chartJsMockModule = {
  Chart: Object.assign(
    ChartStub as unknown as new (...args: unknown[]) => {
      destroy: () => void
    },
    {
      register: vi.fn(),
      defaults: {
        font: { family: '', weight: 500 },
        plugins: {
          tooltip: {
            borderWidth: 1,
            displayColors: false,
            mode: 'nearest',
            intersect: false,
            position: 'nearest',
            caretSize: 0,
            caretPadding: 20,
            cornerRadius: 8,
            padding: 8,
          },
        },
      },
    },
  ),
  // Every chartjs-config.ts named import needs to exist so the
  // side-effect import doesn't throw. These are all registry
  // classes — the stubs just need to be non-undefined.
  BarController: class {},
  BarElement: class {},
  CategoryScale: class {},
  DoughnutController: class {},
  ArcElement: class {},
  Filler: class {},
  Legend: class {},
  LinearScale: class {},
  LineController: class {},
  LineElement: class {},
  PointElement: class {},
  Tooltip: class {},
}

/**
 * Stub the color helpers in chartjs-config so the chart components
 * don't try to read real CSS variables in the happy-dom environment
 * (they're empty strings, which makes `adjustColorOpacity` throw).
 * `buildLineChartOptions` stays real so the line charts construct the
 * canonical options shape from the stubbed colors.
 */
export function withStubbedChartColors<T extends object>(actual: T): T {
  return {
    ...actual,
    getChartColors: () => ({
      textColor: { light: '#94a3b8', dark: '#64748b' },
      gridColor: { light: '#e2e8f0', dark: '#334155' },
      backdropColor: { light: '#fff', dark: '#1e293b' },
      tooltipTitleColor: { light: '#334155', dark: '#f1f5f9' },
      tooltipBodyColor: { light: '#64748b', dark: '#94a3b8' },
      tooltipBgColor: { light: '#fff', dark: '#334155' },
      tooltipBorderColor: { light: '#e2e8f0', dark: '#475569' },
    }),
    getThemedGridColor: () => '#e2e8f0',
    chartAreaGradient: () => 'transparent',
  }
}
