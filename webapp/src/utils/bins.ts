/**
 * Zero-fill helpers for the dashboard's time-binned charts.
 *
 * The server's `GROUP BY` only returns bins that contain at least one
 * row, so a journal with a two-month gap renders as adjacent points on
 * the x-axis — visually indistinguishable from continuous writing.
 * These helpers expand a sparse bin list into a contiguous grid over
 * `[from, to]` so gaps occupy real axis space, matching the pattern
 * established by `FitnessView.vue::bucketByWeek` (one bucket per week,
 * including empty ones).
 *
 * Edge rules:
 * - `from === null` (range "all") anchors the grid at the earliest
 *   period present in the input; with no input either, the result is
 *   empty (there is nothing to anchor an "all time" axis to).
 * - `to === null` defaults to today (UTC), so the trailing edge of a
 *   "last N months" range shows zero bins up to the present.
 * - Both endpoints are aligned *down* to their period start before the
 *   grid is generated: weeks to Monday (ISO weeks — same convention as
 *   the server's `bin_start` and `bucketByWeek`), months to the 1st,
 *   quarters to Jan/Apr/Jul/Oct 1st, years to Jan 1st.
 * - Input periods are never dropped: the grid is extended to cover
 *   periods outside `[from, to]`, and off-grid periods (if the
 *   server's alignment ever disagrees with ours) are unioned in.
 *
 * All date arithmetic is UTC, consistent with
 * `stores/dashboard.ts::rangeToDates` (which produces `from`/`to` via
 * `toISOString`).
 */

import type { DashboardBin, WritingFrequencyBin } from '@/types/dashboard'

/** Parse an ISO `YYYY-MM-DD` string as UTC midnight. */
function parseUtc(iso: string): Date {
  return new Date(iso + 'T00:00:00Z')
}

/** ISO `YYYY-MM-DD` for a UTC Date. */
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Align a UTC Date down to the start of its containing period. */
function alignDown(d: Date, bin: DashboardBin): Date {
  const r = new Date(d)
  switch (bin) {
    case 'week': {
      // 0=Sun..6=Sat → days since Monday. Same Monday-alignment as
      // FitnessView.vue::bucketByWeek.
      const diffToMonday = (r.getUTCDay() + 6) % 7
      r.setUTCDate(r.getUTCDate() - diffToMonday)
      break
    }
    case 'month':
      r.setUTCDate(1)
      break
    case 'quarter':
      r.setUTCMonth(Math.floor(r.getUTCMonth() / 3) * 3, 1)
      break
    case 'year':
      r.setUTCMonth(0, 1)
      break
  }
  return r
}

/** Advance a UTC Date by one period, in place. */
function step(d: Date, bin: DashboardBin): void {
  switch (bin) {
    case 'week':
      d.setUTCDate(d.getUTCDate() + 7)
      break
    case 'month':
      d.setUTCMonth(d.getUTCMonth() + 1)
      break
    case 'quarter':
      d.setUTCMonth(d.getUTCMonth() + 3)
      break
    case 'year':
      d.setUTCFullYear(d.getUTCFullYear() + 1)
      break
  }
}

/** Start-of-period ISO date for an ISO date string (exported for tests). */
export function alignToPeriodStart(iso: string, bin: DashboardBin): string {
  return toIso(alignDown(parseUtc(iso), bin))
}

/**
 * Expand a sparse list of period-start strings into a sorted,
 * contiguous grid covering `[from, to]` (see module docs for the
 * null-endpoint and clamping rules). Used directly by charts that
 * key series points by period (mood trends, entity trends).
 */
export function fillPeriods(
  periods: readonly string[],
  from: string | null,
  to: string | null,
  bin: DashboardBin,
): string[] {
  const sorted = [...periods].sort()
  const anchor = from ?? sorted[0]
  if (anchor === undefined) return []

  const end = alignDown(parseUtc(to ?? toIso(new Date())), bin)
  const cursor = alignDown(parseUtc(anchor), bin)

  // Never drop server data: widen the grid to cover periods that fall
  // outside the requested window.
  if (sorted.length > 0) {
    const earliest = alignDown(parseUtc(sorted[0]), bin)
    if (earliest.getTime() < cursor.getTime())
      cursor.setTime(earliest.getTime())
    const latest = alignDown(parseUtc(sorted[sorted.length - 1]), bin)
    if (latest.getTime() > end.getTime()) end.setTime(latest.getTime())
  }

  const grid = new Set<string>(sorted)
  while (cursor.getTime() <= end.getTime()) {
    grid.add(toIso(cursor))
    step(cursor, bin)
  }
  return Array.from(grid).sort()
}

/**
 * Zero-fill a sparse writing-frequency series: returns one bin per
 * period over `[from, to]`, with `entry_count`/`total_words` of 0
 * where the server returned nothing. Input order doesn't matter; the
 * result is sorted by `bin_start`. The input array is not mutated.
 */
export function fillBins(
  bins: readonly WritingFrequencyBin[],
  from: string | null,
  to: string | null,
  bin: DashboardBin,
): WritingFrequencyBin[] {
  const byStart = new Map<string, WritingFrequencyBin>()
  for (const b of bins) byStart.set(b.bin_start, b)
  const periods = fillPeriods(
    bins.map((b) => b.bin_start),
    from,
    to,
    bin,
  )
  return periods.map(
    (p) => byStart.get(p) ?? { bin_start: p, entry_count: 0, total_words: 0 },
  )
}
