import { afterEach } from 'vitest'

/**
 * Unit tests must never hit the network. happy-dom's fetch performs real
 * HTTP requests against the environment's default origin
 * (http://localhost:3000), so a test that forgets to mock the API layer
 * silently depends on whatever is listening there — and requests still
 * in flight at environment teardown get aborted, surfacing as unhandled
 * AbortError rejections that fail the run only when the timing is
 * unlucky (a long-standing flake).
 *
 * This stub makes the failure deterministic and attributable: any fetch
 * that reaches the network layer rejects immediately, and the test that
 * triggered it fails with the offending URLs.
 */
const leakedFetches: string[] = []

globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  leakedFetches.push(url)
  return Promise.reject(
    new Error(`Unmocked fetch in unit test: ${url} — mock the api module`),
  )
}) as typeof fetch

afterEach(() => {
  if (leakedFetches.length > 0) {
    const urls = [...new Set(leakedFetches)].join(', ')
    leakedFetches.length = 0
    throw new Error(
      `Test leaked real network calls (mock the api module or use ` +
        `mockImplementation on store spies): ${urls}`,
    )
  }
})
