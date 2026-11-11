import type { DashboardBin } from '@/types/dashboard'

/**
 * Format an ISO date (`YYYY-MM-DD`) as a chart x-axis label at the
 * granularity of `bin`.
 *
 * Shared by the dashboard writing/word-count charts and the fitness
 * daily charts so every line chart in the app renders dates the same
 * readable way — `21 Apr`, not `2026-04-20`. Before this helper the
 * dashboard emitted raw ISO `bin_start` strings while the fitness chart
 * used `toLocaleDateString`, so the two looked different side by side.
 *
 * Parsed and rendered in UTC: a date-only value has no time-of-day to
 * localise, and pinning the timezone keeps the label deterministic (and
 * identical between the two charts) regardless of the viewer's — the
 * previous local-time parse in the fitness chart could render the day
 * before for viewers west of UTC. The locale is left to the browser
 * (`undefined`), so en-GB shows `21 Apr` and en-US `Apr 21`; both charts
 * agree because they call this one helper.
 *
 * `week` (the default, and the daily-fitness granularity) shows day +
 * short month; coarser bins drop the day so labels stay meaningful:
 * `month` → `Apr 2026`, `quarter` → `Q2 2026`, `year` → `2026`. A blind
 * day+month format would render every yearly bin as `1 Jan`.
 */
export function formatBinLabel(
  isoDate: string,
  bin: DashboardBin = 'week',
): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  switch (bin) {
    case 'year':
      return String(d.getUTCFullYear())
    case 'quarter':
      return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
    case 'month':
      return d.toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    case 'week':
    default:
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
  }
}
