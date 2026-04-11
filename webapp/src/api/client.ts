const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * Read the API bearer token.
 *
 * Two sources, in priority order:
 *
 *  1. `window.__JOURNAL_CONFIG__.apiToken` — the runtime value, written
 *     to `/config.js` at container startup by `docker/40-journal-config.sh`
 *     from the `JOURNAL_API_TOKEN` env var. This is the production path:
 *     the token lives only in the host's `.env`, never in the ghcr.io
 *     image, and rotates with a `docker compose up -d` (no rebuild).
 *
 *  2. `import.meta.env.VITE_JOURNAL_API_TOKEN` — the build-time value,
 *     inlined by Vite. Used in dev (set via `.env.local`) and in unit
 *     tests (via `vi.stubEnv`). Also used as a fallback in prod if the
 *     runtime injection stub was never replaced — which would be a
 *     deployment mistake, and the fallback is empty in that case, so
 *     the server will reject requests with 401 and the mistake is loud.
 *
 * Called per-request rather than captured as a module-level constant
 * so `vi.stubEnv` takes effect for every test without re-importing
 * the module.
 */
function getApiToken(): string {
  const runtime = window.__JOURNAL_CONFIG__?.apiToken
  if (runtime) return runtime
  return import.meta.env.VITE_JOURNAL_API_TOKEN || ''
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public errorCode: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`
  const token = getApiToken()
  // Build headers explicitly so the Authorization header is present
  // whenever a token is configured. Caller-supplied headers override
  // defaults, which lets individual callers change Content-Type for
  // multipart uploads or replace Authorization if ever needed.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  }
  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let errorCode = 'unknown'
    let message = `HTTP ${response.status}`
    try {
      const body = await response.json()
      errorCode = body.error || errorCode
      message = body.message || message
    } catch {
      // ignore parse errors
    }
    throw new ApiRequestError(response.status, errorCode, message)
  }

  return response.json()
}
