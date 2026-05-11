/**
 * Centred 3-day moving average over a (possibly sparse) numeric series.
 *
 * For each index `i`, averages the values in `[i-1, i, i+1]`, skipping
 * nulls. At the series edges the window truncates rather than
 * producing a NaN gap, so the smoothed line spans the full range of
 * dates the daily series covers. If every value in the window is
 * null, the result for that index is null (Chart.js's `spanGaps`
 * keeps the line continuous across short gaps).
 *
 * Used by the fitness Sleep / HRV / RHR panels to render a trend
 * line over the noisy daily series. See
 * `docs/chart-style-guide.md` for the bold-MA + faded-daily pattern.
 */
export function movingAverage3(
  values: Array<number | null>,
): Array<number | null> {
  const result: Array<number | null> = []
  for (let i = 0; i < values.length; i += 1) {
    const window = [values[i - 1], values[i], values[i + 1]]
    const present = window.filter((v): v is number => typeof v === 'number')
    if (present.length === 0) {
      result.push(null)
      continue
    }
    const mean = present.reduce((a, b) => a + b, 0) / present.length
    result.push(mean)
  }
  return result
}
