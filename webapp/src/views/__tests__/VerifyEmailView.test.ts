import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import VerifyEmailView from '../VerifyEmailView.vue'

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

vi.mock('@/stores/auth', () => {
  const mockStore = {
    $reset: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    emailVerified: false,
    user: null as Record<string, unknown> | null,
  }
  return {
    useAuthStore: vi.fn(() => mockStore),
    __mockStore: mockStore,
  }
})

import { apiFetch, ApiRequestError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuthStore = (useAuthStore as any)()
const mockApiFetch = vi.mocked(apiFetch)

function createTestRouter(initialRoute = '/verify-email?token=verify123') {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/login', name: 'login', component: { template: '<div/>' } },
      {
        path: '/verify-email',
        name: 'verify-email',
        component: VerifyEmailView,
      },
    ],
  })
  router.push(initialRoute)
  return router
}

function mountComponent(router: ReturnType<typeof createTestRouter>) {
  return mount(VerifyEmailView, {
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('VerifyEmailView', () => {
  const mockUser = {
    id: 1,
    email: 'test@example.com',
    display_name: 'Test User',
    is_admin: false,
    is_active: true,
    email_verified: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockAuthStore.initialize.mockResolvedValue(undefined)
    mockAuthStore.user = null
  })

  it('calls verify-email API via GET with token as query param', async () => {
    mockApiFetch
      .mockResolvedValueOnce(undefined) // verify-email
      .mockResolvedValueOnce({ user: mockUser }) // /api/auth/me

    const router = createTestRouter()
    await router.isReady()
    mountComponent(router)
    await flushPromises()

    // Regression: previously sent POST with token in body — server only accepts GET
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/auth/verify-email?token=verify123',
    )
    // Must NOT be called with POST method
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('encodes special characters in token', async () => {
    mockApiFetch
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ user: mockUser })

    const router = createTestRouter('/verify-email?token=abc+def/ghi')
    await router.isReady()
    mountComponent(router)
    await flushPromises()

    const call = mockApiFetch.mock.calls[0][0]
    expect(call).toContain('token=')
    // Token should be URI-encoded
    expect(call).not.toContain(' ')
  })

  it('refreshes auth user in store after successful verification', async () => {
    mockApiFetch
      .mockResolvedValueOnce(undefined) // verify-email
      .mockResolvedValueOnce({ user: mockUser }) // /api/auth/me

    const router = createTestRouter()
    await router.isReady()
    mountComponent(router)
    await flushPromises()

    // After verification, the component fetches /api/auth/me and updates
    // authStore.user directly (without $reset) to avoid App.vue flicker.
    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/me')
    expect(mockAuthStore.user).toEqual(mockUser)
    // Must NOT call $reset — that sets initialized=false and triggers
    // App.vue's full-page loading spinner, causing a visual flicker.
    expect(mockAuthStore.$reset).not.toHaveBeenCalled()
  })

  it('does not refresh auth store on verification failure', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiRequestError(400, 'invalid_token', 'Invalid token'),
    )

    const router = createTestRouter()
    await router.isReady()
    mountComponent(router)
    await flushPromises()

    // Only the verify-email call should have been made, not /api/auth/me
    expect(mockApiFetch).toHaveBeenCalledTimes(1)
    expect(mockAuthStore.user).toBeNull()
  })

  it('shows success message on successful verification', async () => {
    mockApiFetch
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ user: mockUser })

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)
    await flushPromises()

    expect(wrapper.text()).toContain('Email Verified')
    expect(wrapper.text()).toContain(
      'Your email address has been verified successfully',
    )
  })

  it('shows Go to Dashboard link on success', async () => {
    mockApiFetch
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ user: mockUser })

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)
    await flushPromises()

    expect(wrapper.text()).toContain('Go to Dashboard')
  })

  it('shows error when token is missing', async () => {
    const router = createTestRouter('/verify-email')
    await router.isReady()
    const wrapper = mountComponent(router)
    await flushPromises()

    expect(wrapper.text()).toContain('Verification Failed')
    expect(wrapper.text()).toContain(
      'No verification token found. Please check the link from your email.',
    )
    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('shows error from ApiRequestError on failure', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiRequestError(400, 'token_expired', 'Token has expired'),
    )

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)
    await flushPromises()

    expect(wrapper.text()).toContain('Verification Failed')
    expect(wrapper.text()).toContain('Token has expired')
  })

  it('shows generic error for non-ApiRequestError', async () => {
    mockApiFetch.mockRejectedValue(new TypeError('Network error'))

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)
    await flushPromises()

    expect(wrapper.text()).toContain('Verification Failed')
    expect(wrapper.text()).toContain(
      'Email verification failed. The link may have expired.',
    )
  })

  it('shows loading state initially', async () => {
    // Never resolve to keep in loading state
    mockApiFetch.mockReturnValue(new Promise(() => {}))

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)
    // Don't flush promises — we want the loading state
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Verifying your email...')
  })

  it('shows Go to Sign In link on error', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiRequestError(400, 'invalid', 'Invalid token'),
    )

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)
    await flushPromises()

    expect(wrapper.text()).toContain('Go to Sign In')
  })
})
