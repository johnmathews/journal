import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../auth'
import type { AuthUser } from '../auth'

vi.mock('@/api/client', () => ({
  apiFetch: vi.fn(),
  ApiRequestError: class ApiRequestError extends Error {
    constructor(
      public status: number,
      public errorCode: string,
      message: string,
    ) {
      super(message)
      this.name = 'ApiRequestError'
    }
  },
}))

import { apiFetch, ApiRequestError } from '@/api/client'
const mockApiFetch = vi.mocked(apiFetch)

const fakeUser: AuthUser = {
  id: 1,
  email: 'test@example.com',
  display_name: 'Test User',
  is_admin: false,
  is_active: true,
  email_verified: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const adminUser: AuthUser = {
  ...fakeUser,
  id: 2,
  is_admin: true,
  display_name: 'Admin',
}

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // --- initialize ---

  it('initialize calls GET /api/auth/me and sets user on success', async () => {
    mockApiFetch.mockResolvedValue(fakeUser)

    const store = useAuthStore()
    await store.initialize()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/me')
    expect(store.user).toEqual(fakeUser)
    expect(store.initialized).toBe(true)
  })

  it('initialize sets user to null on failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('Unauthorized'))

    const store = useAuthStore()
    await store.initialize()

    expect(store.user).toBeNull()
    expect(store.initialized).toBe(true)
  })

  it('initialize is a no-op if already initialized', async () => {
    mockApiFetch.mockResolvedValue(fakeUser)

    const store = useAuthStore()
    await store.initialize()
    mockApiFetch.mockClear()
    await store.initialize()

    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  // --- login ---

  it('login calls POST /api/auth/login and sets user on success', async () => {
    mockApiFetch.mockResolvedValue(fakeUser)

    const store = useAuthStore()
    await store.login({ email: 'test@example.com', password: 'secret' })

    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'secret' }),
    })
    expect(store.user).toEqual(fakeUser)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('login sets error from ApiRequestError on failure', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiRequestError(401, 'invalid_credentials', 'Bad credentials'),
    )

    const store = useAuthStore()
    await expect(
      store.login({ email: 'test@example.com', password: 'wrong' }),
    ).rejects.toThrow()

    expect(store.error).toBe('Bad credentials')
    expect(store.user).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('login sets generic error for non-ApiRequestError', async () => {
    mockApiFetch.mockRejectedValue(new TypeError('Network failure'))

    const store = useAuthStore()
    await expect(
      store.login({ email: 'test@example.com', password: 'p' }),
    ).rejects.toThrow()

    expect(store.error).toBe('Login failed. Please try again.')
    expect(store.loading).toBe(false)
  })

  // --- logout ---

  it('logout calls POST /api/auth/logout and clears user', async () => {
    mockApiFetch.mockResolvedValueOnce(fakeUser)

    const store = useAuthStore()
    // First, set user via initialize
    await store.initialize()
    expect(store.user).toEqual(fakeUser)

    mockApiFetch.mockResolvedValueOnce(undefined)
    await store.logout()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
    })
    expect(store.user).toBeNull()
  })

  it('logout clears user even if server call fails', async () => {
    mockApiFetch.mockResolvedValueOnce(fakeUser)

    const store = useAuthStore()
    await store.initialize()

    mockApiFetch.mockRejectedValueOnce(new Error('Server error'))
    await store.logout()

    expect(store.user).toBeNull()
  })

  // --- register ---

  it('register calls POST /api/auth/register and sets user', async () => {
    mockApiFetch.mockResolvedValue(fakeUser)

    const store = useAuthStore()
    await store.register({
      email: 'new@example.com',
      password: 'strongpassword',
      display_name: 'New User',
    })

    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'new@example.com',
        password: 'strongpassword',
        display_name: 'New User',
      }),
    })
    expect(store.user).toEqual(fakeUser)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('register sets error from ApiRequestError on failure', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiRequestError(409, 'email_taken', 'Email already registered'),
    )

    const store = useAuthStore()
    await expect(
      store.register({
        email: 'dup@example.com',
        password: 'password',
        display_name: 'Dup',
      }),
    ).rejects.toThrow()

    expect(store.error).toBe('Email already registered')
    expect(store.loading).toBe(false)
  })

  it('register sets generic error for non-ApiRequestError', async () => {
    mockApiFetch.mockRejectedValue(new TypeError('Network failure'))

    const store = useAuthStore()
    await expect(
      store.register({
        email: 'a@b.com',
        password: 'p',
        display_name: 'N',
      }),
    ).rejects.toThrow()

    expect(store.error).toBe('Registration failed. Please try again.')
    expect(store.loading).toBe(false)
  })

  // --- computed properties ---

  it('isAuthenticated returns true when user is set', async () => {
    mockApiFetch.mockResolvedValue(fakeUser)

    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)

    await store.initialize()
    expect(store.isAuthenticated).toBe(true)
  })

  it('isAdmin returns true when user is admin', async () => {
    mockApiFetch.mockResolvedValue(adminUser)

    const store = useAuthStore()
    await store.initialize()

    expect(store.isAdmin).toBe(true)
  })

  it('isAdmin returns false when user is not admin', async () => {
    mockApiFetch.mockResolvedValue(fakeUser)

    const store = useAuthStore()
    await store.initialize()

    expect(store.isAdmin).toBe(false)
  })

  it('isAdmin returns false when user is null', () => {
    const store = useAuthStore()
    expect(store.isAdmin).toBe(false)
  })

  it('displayName returns display_name of the user', async () => {
    mockApiFetch.mockResolvedValue(fakeUser)

    const store = useAuthStore()
    await store.initialize()

    expect(store.displayName).toBe('Test User')
  })

  it('displayName returns empty string when user is null', () => {
    const store = useAuthStore()
    expect(store.displayName).toBe('')
  })

  it('emailVerified returns true when user email is verified', async () => {
    mockApiFetch.mockResolvedValue(fakeUser)

    const store = useAuthStore()
    await store.initialize()

    expect(store.emailVerified).toBe(true)
  })

  it('emailVerified returns false when user is null', () => {
    const store = useAuthStore()
    expect(store.emailVerified).toBe(false)
  })

  // --- clearError ---

  it('clearError resets error to null', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiRequestError(401, 'err', 'Some error'),
    )

    const store = useAuthStore()
    try {
      await store.login({ email: 'a@b.com', password: 'x' })
    } catch {
      // expected
    }
    expect(store.error).toBe('Some error')

    store.clearError()
    expect(store.error).toBeNull()
  })

  // --- $reset ---

  it('$reset restores initial state', async () => {
    mockApiFetch.mockResolvedValue(fakeUser)

    const store = useAuthStore()
    await store.initialize()
    expect(store.user).toEqual(fakeUser)
    expect(store.initialized).toBe(true)

    store.$reset()

    expect(store.user).toBeNull()
    expect(store.initialized).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })
})
