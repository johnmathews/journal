const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * Read the API bearer token from the build-time env. Called per-request
 * rather than captured as a module-level constant so Vitest's
 * `vi.stubEnv('VITE_JOURNAL_API_TOKEN', ...)` can change the value at
 * runtime without the test having to re-import the module. In
 * production the value is inlined by Vite at build time, so this is
 * effectively free.
 *
 * The token is required by journal-server on every /api/* and /mcp
 * request. In dev the Vite proxy forwards the header unchanged to
 * localhost:8400. In prod the built bundle must be served with this
 * value injected via `VITE_JOURNAL_API_TOKEN=...` at build time.
 */
function getApiToken(): string {
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
