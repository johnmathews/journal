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
          { path: '', name: 'admin-overview', component: ChildComponent },
          {
            path: 'users',
            name: 'admin-users',
            component: { template: '<div/>' },
          },
          {
            path: 'runtime',
            name: 'admin-runtime',
            component: { template: '<div/>' },
          },
          {
            path: 'pricing',
            name: 'admin-pricing',
            component: { template: '<div/>' },
          },
          {
            path: 'server',
            name: 'admin-server',
            component: { template: '<div/>' },
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

  it('renders all five tabs in order with correct paths', async () => {
    const router = createTestRouter()
    router.push('/admin')
    await router.isReady()
    const wrapper = mountComponent(router)

    const links = wrapper.find('nav[aria-label="Admin tabs"]').findAll('a')
    expect(links.map((l) => l.text())).toEqual([
      'Overview',
      'Users',
      'Runtime',
      'Pricing',
      'Server',
    ])
    expect(links[0].attributes('href')).toBe('/admin')
    expect(links[1].attributes('href')).toBe('/admin/users')
    expect(links[2].attributes('href')).toBe('/admin/runtime')
    expect(links[3].attributes('href')).toBe('/admin/pricing')
    expect(links[4].attributes('href')).toBe('/admin/server')
  })

  it('highlights the Overview tab when at /admin', async () => {
    const router = createTestRouter()
    router.push('/admin')
    await router.isReady()
    const wrapper = mountComponent(router)

    const overviewLink = wrapper
      .findAll('a')
      .find((l) => l.text() === 'Overview')
    expect(overviewLink).toBeDefined()
    expect(overviewLink!.classes().join(' ')).toContain('border-violet-500')
  })

  it('highlights the Users tab when at /admin/users', async () => {
    const router = createTestRouter()
    router.push('/admin/users')
    await router.isReady()
    const wrapper = mountComponent(router)

    const usersLink = wrapper.findAll('a').find((l) => l.text() === 'Users')
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
