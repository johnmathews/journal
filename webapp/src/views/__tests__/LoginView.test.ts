import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../LoginView.vue'
import { useAuthStore } from '@/stores/auth'

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

import { apiFetch } from '@/api/client'
const mockApiFetch = vi.mocked(apiFetch)

function createTestRouter(initialRoute = '/login') {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: { template: '<div/>' } },
      { path: '/login', name: 'login', component: LoginView },
      {
        path: '/register',
        name: 'register',
        component: { template: '<div/>' },
      },
      {
        path: '/forgot-password',
        name: 'forgot-password',
        component: { template: '<div/>' },
      },
    ],
  })
  router.push(initialRoute)
  return router
}

function mountComponent(router: ReturnType<typeof createTestRouter>) {
  return mount(LoginView, {
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Default: registration disabled (config endpoint returns false)
    mockApiFetch.mockResolvedValue({ registration_enabled: false })
  })

  it('renders email and password fields', async () => {
    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)

    expect(wrapper.find('#login-email').exists()).toBe(true)
    expect(wrapper.find('#login-password').exists()).toBe(true)
  })

  it('renders Sign In heading', async () => {
    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)

    expect(wrapper.find('h1').text()).toBe('Sign In')
  })

  it('submits form and calls auth store login', async () => {
    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)
    const authStore = useAuthStore()

    const loginSpy = vi.spyOn(authStore, 'login').mockResolvedValue()

    await wrapper.find('#login-email').setValue('test@example.com')
    await wrapper.find('#login-password').setValue('password123')
    await wrapper.find('form').trigger('submit')

    expect(loginSpy).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    })
  })

  it('shows error when login fails', async () => {
    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)
    const authStore = useAuthStore()

    authStore.error = 'Invalid credentials'
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Invalid credentials')
  })

  it('shows register link when registration is enabled', async () => {
    mockApiFetch.mockResolvedValue({ registration_enabled: true })

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)
    await flushPromises()

    expect(wrapper.text()).toContain('Register')
    expect(wrapper.text()).toContain("Don't have an account?")
  })

  it('hides register link when registration is disabled', async () => {
    mockApiFetch.mockResolvedValue({ registration_enabled: false })

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)
    await flushPromises()

    expect(wrapper.text()).not.toContain("Don't have an account?")
  })

  it('shows session expired banner when ?expired=1 query param', async () => {
    const router = createTestRouter('/login?expired=1')
    await router.isReady()
    const wrapper = mountComponent(router)

    expect(wrapper.text()).toContain('Your session has expired')
  })

  it('does not show session expired banner without query param', async () => {
    const router = createTestRouter('/login')
    await router.isReady()
    const wrapper = mountComponent(router)

    expect(wrapper.text()).not.toContain('Your session has expired')
  })

  it('shows forgot password link', async () => {
    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)

    expect(wrapper.text()).toContain('Forgot password?')
  })

  it('disables submit button while loading', async () => {
    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)
    const authStore = useAuthStore()

    authStore.loading = true
    await wrapper.vm.$nextTick()

    const button = wrapper.find('button[type="submit"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(button.text()).toBe('Signing in...')
  })

  it('hides register link when config fetch fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Fetch failed'))

    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)
    await flushPromises()

    expect(wrapper.text()).not.toContain("Don't have an account?")
  })

  it('clears error on email input focus', async () => {
    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)
    const authStore = useAuthStore()

    authStore.error = 'Some error'
    await wrapper.vm.$nextTick()

    const clearSpy = vi.spyOn(authStore, 'clearError')
    await wrapper.find('#login-email').trigger('focus')

    expect(clearSpy).toHaveBeenCalled()
  })

  it('clears error on password input focus', async () => {
    const router = createTestRouter()
    await router.isReady()
    const wrapper = mountComponent(router)
    const authStore = useAuthStore()

    authStore.error = 'Some error'
    await wrapper.vm.$nextTick()

    const clearSpy = vi.spyOn(authStore, 'clearError')
    await wrapper.find('#login-password').trigger('focus')

    expect(clearSpy).toHaveBeenCalled()
  })
})
