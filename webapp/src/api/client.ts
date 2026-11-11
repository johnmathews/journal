const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * Handler invoked when a non-auth endpoint returns 401, indicating the
 * session has expired. Registered by main.ts to avoid circular imports
 * between the API client and the auth store / router.
 */
type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler = () => {}

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler
}

export class ApiRequestError extends Error {
  /**
   * Full parsed JSON response body, when available. Useful when the
   * server's error response carries structured data the caller needs
   * to react to — e.g. the 409 from add-alias returns the existing
   * entity's id and name so the webapp can offer a merge.
   */
  public body: Record<string, unknown> | null
  constructor(
    public status: number,
    public errorCode: string,
    message: string,
    body: Record<string, unknown> | null = null,
  ) {
    super(message)
    this.name = 'ApiRequestError'
    this.body = body
  }
}

/**
 * Auth endpoints where a 401 is an expected response (bad credentials)
 * rather than an expired session. We must not trigger the global
 * unauthorized handler for these.
 */
const AUTH_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/me']

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`
  // Build headers explicitly. Caller-supplied headers override defaults,
  // which lets individual callers change Content-Type for multipart
  // uploads if ever needed.
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData
      ? {}
      : { 'Content-Type': 'application/json' }),
    ...((options.headers as Record<string, string>) ?? {}),
  }
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    // Global 401 handling: if a non-auth endpoint returns 401 the
    // session has expired — clear user state and redirect to login.
    if (response.status === 401 && !AUTH_PATHS.includes(path)) {
      onUnauthorized()
    }

    let errorCode = 'unknown'
    let message = `HTTP ${response.status}`
    let parsedBody: Record<string, unknown> | null = null
    try {
      const body = await response.json()
      parsedBody = body as Record<string, unknown>
      errorCode = body.error || errorCode
      message = body.message || body.error || message
    } catch {
      // ignore parse errors
    }
    throw new ApiRequestError(response.status, errorCode, message, parsedBody)
  }

  // Handle 204 No Content (e.g. logout)
  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}
