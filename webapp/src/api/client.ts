const API_BASE = import.meta.env.VITE_API_URL || ''

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
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
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
