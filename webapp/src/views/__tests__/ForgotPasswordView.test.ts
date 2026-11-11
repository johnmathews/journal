import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ForgotPasswordView from '../ForgotPasswordView.vue'

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

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div/>' } },
    { path: '/login', name: 'login', component: { template: '<div/>' } },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: ForgotPasswordView,
    },
  ],
})

function mountComponent() {
  return mount(ForgotPasswordView, {
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('ForgotPasswordView', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    router.push('/forgot-password')
    await router.isReady()
  })

  it('renders the heading', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('h1').text()).toBe('Reset Password')
  })

  it('renders email field', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('#forgot-email').exists()).toBe(true)
  })

  it('submits form and calls forgot-password API', async () => {
    mockApiFetch.mockResolvedValue(undefined)

    const wrapper = mountComponent()
    await wrapper.find('#forgot-email').setValue('test@example.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }),
    })
  })

  it('shows success message after submitting', async () => {
    mockApiFetch.mockResolvedValue(undefined)

    const wrapper = mountComponent()
    await wrapper.find('#forgot-email').setValue('test@example.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Check your email')
    expect(wrapper.text()).toContain('test@example.com')
  })

  it('shows error from ApiRequestError on failure', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiRequestError(429, 'rate_limit', 'Too many requests'),
    )

    const wrapper = mountComponent()
    await wrapper.find('#forgot-email').setValue('test@example.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Too many requests')
  })

  it('shows generic error for non-ApiRequestError', async () => {
    mockApiFetch.mockRejectedValue(new TypeError('Network error'))

    const wrapper = mountComponent()
    await wrapper.find('#forgot-email').setValue('test@example.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Something went wrong. Please try again.')
  })

  it('shows back to sign in link', () => {
    const wrapper = mountComponent()
    expect(wrapper.text()).toContain('Back to sign in')
  })

  it('disables submit button while loading', async () => {
    // Never resolve to keep it in loading state
    mockApiFetch.mockReturnValue(new Promise(() => {}))

    const wrapper = mountComponent()
    await wrapper.find('#forgot-email').setValue('test@example.com')
    await wrapper.find('form').trigger('submit')
    await wrapper.vm.$nextTick()

    const button = wrapper.find('button[type="submit"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(button.text()).toBe('Sending...')
  })

  it('clears error on email input focus', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiRequestError(429, 'rate_limit', 'Too many requests'),
    )

    const wrapper = mountComponent()
    await wrapper.find('#forgot-email').setValue('test@example.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Too many requests')

    await wrapper.find('#forgot-email').trigger('focus')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('Too many requests')
  })
})
