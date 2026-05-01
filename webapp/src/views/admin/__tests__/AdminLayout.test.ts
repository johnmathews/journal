import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import AdminLayout from '../AdminLayout.vue'

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

const ChildComponent = {
  template: '<div data-testid="child">Child content</div>',
}

function createTestRouter() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      {
        path: '/admin',
        component: AdminLayout,
        children: [
          {
            path: '',
            name: 'admin-dashboard',
            component: ChildComponent,
          },
        ],
      },
    ],
  })
  return router
}

function mountComponent(router: ReturnType<typeof createTestRouter>) {
  return mount(AdminLayout, {
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('AdminLayout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders Administration heading', async () => {
    const router = createTestRouter()
    router.push('/admin')
    await router.isReady()
    const wrapper = mountComponent(router)

    expect(wrapper.find('h1').text()).toBe('Administration')
  })

  it('renders tab navigation', async () => {
    const router = createTestRouter()
    router.push('/admin')
    await router.isReady()
    const wrapper = mountComponent(router)

    const nav = wrapper.find('nav[aria-label="Admin tabs"]')
    expect(nav.exists()).toBe(true)
  })

  it('renders Users tab link', async () => {
    const router = createTestRouter()
    router.push('/admin')
    await router.isReady()
    const wrapper = mountComponent(router)

    const links = wrapper.findAll('a')
    const usersLink = links.find((l) => l.text() === 'Users')
    expect(usersLink).toBeDefined()
  })

  it('renders Server tab link pointing to /admin/server', async () => {
    const router = createTestRouter()
    router.push('/admin')
    await router.isReady()
    const wrapper = mountComponent(router)

    const serverLink = wrapper.findAll('a').find((l) => l.text() === 'Server')
    expect(serverLink).toBeDefined()
    expect(serverLink!.attributes('href')).toBe('/admin/server')
  })

  it('highlights active tab with violet styling', async () => {
    const router = createTestRouter()
    router.push('/admin')
    await router.isReady()
    const wrapper = mountComponent(router)

    const usersLink = wrapper.findAll('a').find((l) => l.text() === 'Users')
    expect(usersLink).toBeDefined()
    expect(usersLink!.classes().join(' ')).toContain('border-violet-500')
  })

  it('contains a RouterView slot for child routes', async () => {
    const router = createTestRouter()
    router.push('/admin')
    await router.isReady()
    const wrapper = mountComponent(router)
    // The RouterView is present and renders child content
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="child"]').exists()).toBe(true)
  })
})
