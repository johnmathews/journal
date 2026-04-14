import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ResetPasswordView from '../ResetPasswordView.vue'

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

function createTestRouter(initialRoute = '/reset-password?token=abc123') {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/login', name: 'login', component: { template: '<div/>' } },
      {
        path: '/reset-password',
        name: 'reset-password',
        component: ResetPasswordView,
      },
    ],
  })
  router.push(initialRoute)
  return router
}

function mountComponent(router: ReturnType<typeof createTestRouter>) {
  return mount(ResetPasswordView, {
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('ResetPasswordView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders the heading', async () => {
    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)

    expect(wrapper.find('h1').text()).toBe('Set New Password')
  })

  it('renders password and confirm password fields', async () => {
    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)

    expect(wrapper.find('#reset-password').exists()).toBe(true)
    expect(wrapper.find('#reset-confirm').exists()).toBe(true)
  })

  it('shows no-token warning when token is missing', async () => {
    const router = createTestRouter('/reset-password')
    await router.isReady()
    const wrapper = mountComponent(router)

    expect(wrapper.text()).toContain('No reset token found')
  })

  it('disables submit button when token is missing', async () => {
    const router = createTestRouter('/reset-password')
    await router.isReady()
    const wrapper = mountComponent(router)

    const button = wrapper.find('button[type="submit"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows password mismatch warning', async () => {
    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)

    await wrapper.find('#reset-password').setValue('password1')
    await wrapper.find('#reset-confirm').setValue('password2')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Passwords do not match')
  })

  it('submits form and calls reset-password API', async () => {
    mockApiFetch.mockResolvedValue(undefined)

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)

    await wrapper.find('#reset-password').setValue('newpassword')
    await wrapper.find('#reset-confirm').setValue('newpassword')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'abc123', password: 'newpassword' }),
    })
  })

  it('shows success message after resetting', async () => {
    mockApiFetch.mockResolvedValue(undefined)

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)

    await wrapper.find('#reset-password').setValue('newpassword')
    await wrapper.find('#reset-confirm').setValue('newpassword')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Password updated')
    expect(wrapper.text()).toContain('Sign in with your new password')
  })

  it('shows error when passwords do not match on submit', async () => {
    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)

    await wrapper.find('#reset-password').setValue('password1')
    await wrapper.find('#reset-confirm').setValue('password2')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // The handleSubmit function sets error to "Passwords do not match."
    expect(wrapper.text()).toContain('Passwords do not match')
    // Should NOT have called the API
    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('shows error when token is missing on submit', async () => {
    const router = createTestRouter('/reset-password')
    await router.isReady()
    const wrapper = mountComponent(router)

    await wrapper.find('#reset-password').setValue('newpassword')
    await wrapper.find('#reset-confirm').setValue('newpassword')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Invalid or missing reset token')
    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('shows error from ApiRequestError on failure', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiRequestError(400, 'token_expired', 'Reset token has expired'),
    )

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)

    await wrapper.find('#reset-password').setValue('newpassword')
    await wrapper.find('#reset-confirm').setValue('newpassword')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Reset token has expired')
  })

  it('shows generic error for non-ApiRequestError', async () => {
    mockApiFetch.mockRejectedValue(new TypeError('Network error'))

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)

    await wrapper.find('#reset-password').setValue('newpassword')
    await wrapper.find('#reset-confirm').setValue('newpassword')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Something went wrong. Please try again.')
  })

  it('shows back to sign in link', async () => {
    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)

    expect(wrapper.text()).toContain('Back to sign in')
  })

  it('clears error on password input focus', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiRequestError(400, 'bad', 'Some error'),
    )

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)

    await wrapper.find('#reset-password').setValue('newpassword')
    await wrapper.find('#reset-confirm').setValue('newpassword')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Some error')

    await wrapper.find('#reset-password').trigger('focus')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('Some error')
  })

  it('clears error on confirm password input focus', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiRequestError(400, 'bad', 'Some error'),
    )

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)

    await wrapper.find('#reset-password').setValue('newpassword')
    await wrapper.find('#reset-confirm').setValue('newpassword')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Some error')

    await wrapper.find('#reset-confirm').trigger('focus')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('Some error')
  })
})
