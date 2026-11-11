/**
 * Formatters for per-job throughput metrics on the Job History view.
 *
 * These render MEASURED values (actual token counts and USD spend the
 * server recorded for each job), so — unlike the "~"-prefixed estimates in
 * `cost-estimates.ts` — they carry no leading tilde. Keep the two families
 * of formatters distinct: estimates communicate uncertainty, these do not.
 */

/**
 * Format an elapsed duration given in seconds.
 *
 * - "12s" for anything under a minute (seconds floored)
 * - "1m 04s" for a minute or more, with zero-padded seconds
 * - "-" for negative or NaN input (e.g. a not-yet-started job)
 */
export function formatDurationSeconds(totalSeconds: number): string {
  if (Number.isNaN(totalSeconds) || totalSeconds < 0) return '-'
  const whole = Math.floor(totalSeconds)
  if (whole < 60) return `${whole}s`
  const minutes = Math.floor(whole / 60)
  const seconds = whole % 60
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

/**
 * Format a token count.
 *
 * - "—" (em dash) for null/undefined (server didn't record it)
 * - raw integer for counts under 1000
 * - "1.2k" (one decimal) for counts at or above 1000
 */
export function formatTokens(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

/**
 * Format a measured USD cost.
 *
 * - "—" (em dash) for null/undefined (server didn't record it)
 * - "$0.00" for exactly zero
 * - "$0.0123" (four decimals) for costs under a dollar
 * - "$1.23" (two decimals) for costs at or above a dollar
 */
export function formatUsd(cost: number | null | undefined): string {
  if (cost == null) return '—'
  if (cost === 0) return '$0.00'
  if (cost < 1) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}
