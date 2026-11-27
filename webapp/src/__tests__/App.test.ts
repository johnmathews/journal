import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from '../App.vue'
import { useAuthStore } from '@/stores/auth'
import { useAppearanceStore } from '@/stores/appearance'

// Mock the DefaultLayout to avoid pulling in complex children
vi.mock('@/layouts/DefaultLayout.vue', () => ({
  default: {
    template: '<div data-testid="default-layout"><slot /></div>',
  },
}))

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

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      {
        path: '/',
        name: 'dashboard',
        component: { template: '<div data-testid="dashboard">Dashboard</div>' },
      },
      {
        path: '/login',
        name: 'login',
        component: { template: '<div data-testid="login">Login</div>' },
        meta: { public: true },
      },
    ],
  })
}

describe('App', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows loading spinner when auth is not initialized', async () => {
    const router = createTestRouter()
    router.push('/')
    await router.isReady()

    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), router],
      },
    })

    // Auth store is not initialized yet by default
    expect(wrapper.text()).toContain('Loading...')
  })

  it('renders public route without DefaultLayout when initialized', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const authStore = useAuthStore()
    authStore.initialized = true

    const router = createTestRouter()
    router.push('/login')
    await router.isReady()

    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    await flushPromises()

    // Public route should NOT be wrapped in DefaultLayout
    expect(wrapper.find('[data-testid="default-layout"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="login"]').exists()).toBe(true)
  })

  it('renders authenticated route inside DefaultLayout when initialized', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const authStore = useAuthStore()
    authStore.initialized = true

    const router = createTestRouter()
    router.push('/')
    await router.isReady()

    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="default-layout"]').exists()).toBe(true)
  })

  it('loads the accent colour on sign-in and resets it on sign-out', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const authStore = useAuthStore()
    authStore.initialized = true
    const appearance = useAppearanceStore()
    const load = vi.spyOn(appearance, 'load').mockResolvedValue()
    const reset = vi.spyOn(appearance, 'reset')

    const router = createTestRouter()
    router.push('/login')
    await router.isReady()
    mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()
    // Signed out from the start: nothing to load, and back to the default.
    expect(load).not.toHaveBeenCalled()
    expect(reset).toHaveBeenCalledTimes(1)

    authStore.user = { id: 7 } as typeof authStore.user
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(1)

    authStore.user = null
    await flushPromises()
    expect(reset).toHaveBeenCalledTimes(2)
  })

  describe('a cached accent on a shared browser', () => {
    beforeEach(() => {
      // What index.html's pre-paint script did for the previous user.
      localStorage.setItem('accent', 'graphite')
      document.documentElement.dataset.accent = 'graphite'
    })
    afterEach(() => {
      localStorage.clear()
      delete document.documentElement.dataset.accent
    })

    it('goes back to violet when the session turns out to have expired', async () => {
      const pinia = createPinia()
      setActivePinia(pinia)
      const authStore = useAuthStore()
      const router = createTestRouter()
      router.push('/login')
      await router.isReady()
      mount(App, { global: { plugins: [pinia, router] } })
      await flushPromises()

      // /api/auth/me answered 401: the auth check ends with nobody signed in.
      authStore.initialized = true
      await flushPromises()

      expect(document.documentElement.dataset.accent).toBe('violet')
      expect(localStorage.getItem('accent')).toBeNull()
    })

    it("keeps a returning user's accent while their session is checked", async () => {
      const pinia = createPinia()
      setActivePinia(pinia)
      const authStore = useAuthStore()
      const appearance = useAppearanceStore()
      const load = vi.spyOn(appearance, 'load').mockResolvedValue()
      const reset = vi.spyOn(appearance, 'reset')
      const router = createTestRouter()
      router.push('/')
      await router.isReady()
      mount(App, { global: { plugins: [pinia, router] } })
      await flushPromises()
      // Before the auth check answers, the cached colour stays: no violet flash.
      expect(reset).not.toHaveBeenCalled()
      expect(document.documentElement.dataset.accent).toBe('graphite')

      authStore.user = { id: 7 } as typeof authStore.user
      authStore.initialized = true
      await flushPromises()
      expect(load).toHaveBeenCalledTimes(1)
      expect(reset).not.toHaveBeenCalled()
      expect(document.documentElement.dataset.accent).toBe('graphite')
    })
  })
})
