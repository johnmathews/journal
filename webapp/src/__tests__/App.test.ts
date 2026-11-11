import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from '../App.vue'
import { useAuthStore } from '@/stores/auth'

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
})
