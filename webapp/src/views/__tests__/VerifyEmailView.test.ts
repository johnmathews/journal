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
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockAuthStore.initialize.mockResolvedValue(undefined)
  })

  it('calls verify-email API via GET with token as query param', async () => {
    mockApiFetch.mockResolvedValue(undefined)

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
    mockApiFetch.mockResolvedValue(undefined)

    const router = createTestRouter('/verify-email?token=abc+def/ghi')
    await router.isReady()
    mountComponent(router)
    await flushPromises()

    const call = mockApiFetch.mock.calls[0][0]
    expect(call).toContain('token=')
    // Token should be URI-encoded
    expect(call).not.toContain(' ')
  })

  it('refreshes auth store after successful verification', async () => {
    mockApiFetch.mockResolvedValue(undefined)

    const router = createTestRouter()
    await router.isReady()
    mountComponent(router)
    await flushPromises()

    // Regression: previously the auth store was never refreshed, so
    // email_verified stayed false and user kept seeing "Please verify your email"
    expect(mockAuthStore.$reset).toHaveBeenCalled()
    expect(mockAuthStore.initialize).toHaveBeenCalled()
    // $reset must be called before initialize
    const resetOrder = mockAuthStore.$reset.mock.invocationCallOrder[0]
    const initOrder = mockAuthStore.initialize.mock.invocationCallOrder[0]
    expect(resetOrder).toBeLessThan(initOrder)
  })

  it('does not refresh auth store on verification failure', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiRequestError(400, 'invalid_token', 'Invalid token'),
    )

    const router = createTestRouter()
    await router.isReady()
    mountComponent(router)
    await flushPromises()

    expect(mockAuthStore.$reset).not.toHaveBeenCalled()
    expect(mockAuthStore.initialize).not.toHaveBeenCalled()
  })

  it('shows success message on successful verification', async () => {
    mockApiFetch.mockResolvedValue(undefined)

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
    mockApiFetch.mockResolvedValue(undefined)

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
