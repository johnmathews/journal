/**
 * Centred moving average over a (possibly sparse) numeric series.
 *
 * For each index `i`, averages the values in the window
 * `[i - half, i + half]` where `half = (window - 1) / 2`, skipping
 * nulls. At the series edges the window truncates rather than
 * producing a NaN gap, so the smoothed line spans the full range of
 * dates the daily series covers. If every value in the window is
 * null, the result for that index is null (Chart.js's `spanGaps`
 * keeps the line continuous across short gaps).
 *
 * `window` is expected to be an odd positive integer (3 / 5 / 7 on the
 * fitness page) so the window is symmetric around `i`; even windows
 * still work but lean one extra slot toward the end of the series.
 *
 * Used by the fitness Sleep / HRV / RHR panels to render a trend
 * line over the noisy daily series. See
 * `docs/chart-style-guide.md` for the bold-MA + faded-daily pattern.
 */
export function movingAverage(
  values: Array<number | null>,
  window: number,
): Array<number | null> {
  const half = Math.floor((window - 1) / 2)
  const result: Array<number | null> = []
  for (let i = 0; i < values.length; i += 1) {
    let sum = 0
    let count = 0
    for (let j = i - half; j <= i + half; j += 1) {
      const v = values[j]
      if (typeof v === 'number') {
        sum += v
        count += 1
      }
    }
    result.push(count === 0 ? null : sum / count)
  }
  return result
}

/**
 * Centred 3-day moving average. Thin wrapper over {@link movingAverage}
 * preserved so existing callers/tests keep working unchanged.
 */
export function movingAverage3(
  values: Array<number | null>,
): Array<number | null> {
  return movingAverage(values, 3)
}
