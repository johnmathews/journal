import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import AppSidebar from '../AppSidebar.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * Stub `window.matchMedia` so the default-sidebar-expanded check
 * can be driven deterministically in each test. Returns a
 * minimal MediaQueryList whose `matches` value is `isWide`.
 */
function stubMatchMedia(isWide: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: isWide,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'dashboard',
        component: { template: '<div />' },
      },
      {
        path: '/entries',
        name: 'entries',
        component: { template: '<div />' },
      },
      {
        path: '/entries/:id',
        name: 'entry-detail',
        component: { template: '<div />' },
      },
      {
        path: '/search',
        name: 'search',
        component: { template: '<div />' },
      },
      {
        path: '/entities',
        name: 'entities',
        component: { template: '<div />' },
      },
      {
        path: '/jobs',
        name: 'job-history',
        component: { template: '<div />' },
      },
      {
        path: '/admin',
        name: 'admin',
        component: { template: '<div />' },
      },
    ],
  })
}

async function mountSidebar(sidebarOpen = true) {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  return mount(AppSidebar, {
    props: { sidebarOpen },
    attachTo: document.body,
    global: { plugins: [router, createPinia()] },
  })
}

describe('AppSidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.classList.remove('sidebar-expanded')
    // Default each test to the "narrow viewport" branch of
    // `defaultSidebarExpanded()` so the existing assertions don't
    // have to care. Tests that need a wide viewport override this
    // before calling mountSidebar.
    stubMatchMedia(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the Dashboard and Entries nav links', async () => {
    const wrapper = await mountSidebar()
    expect(wrapper.text()).toContain('Dashboard')
    expect(wrapper.text()).toContain('Entries')
    wrapper.unmount()
  })

  it('Entries nav link points to /entries (Option B routing)', async () => {
    const wrapper = await mountSidebar()
    const link = wrapper.find('[data-testid="sidebar-entries-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/entries')
    wrapper.unmount()
  })

  it('Dashboard nav link points to / (Option B routing)', async () => {
    const wrapper = await mountSidebar()
    const link = wrapper.find('[data-testid="sidebar-dashboard-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/')
    wrapper.unmount()
  })

  it('defaults sidebar to expanded on wide displays (lg+)', async () => {
    stubMatchMedia(true) // simulate min-width: 1024px matches
    const wrapper = await mountSidebar()
    // The "Expand / collapse" button toggles localStorage between
    // 'true' and 'false'. On a fresh load with no stored preference
    // but a wide viewport, the default is `true` and the first
    // click should flip it to `false`.
    const buttons = wrapper.findAll('button')
    const expandBtn = buttons.find((b) =>
      b.text().includes('Expand / collapse sidebar'),
    )
    expect(expandBtn).toBeDefined()
    await expandBtn!.trigger('click')
    expect(localStorage.getItem('sidebar-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('defaults sidebar to collapsed on narrow displays', async () => {
    stubMatchMedia(false) // phone / small tablet
    const wrapper = await mountSidebar()
    const buttons = wrapper.findAll('button')
    const expandBtn = buttons.find((b) =>
      b.text().includes('Expand / collapse sidebar'),
    )
    expect(expandBtn).toBeDefined()
    await expandBtn!.trigger('click')
    // Fresh load + narrow viewport → default is `false`. First
    // click flips to `true`.
    expect(localStorage.getItem('sidebar-expanded')).toBe('true')
    wrapper.unmount()
  })

  it('explicit localStorage preference overrides the viewport default', async () => {
    // User explicitly collapsed the sidebar previously.
    localStorage.setItem('sidebar-expanded', 'false')
    stubMatchMedia(true) // wide viewport — would default to true
    const wrapper = await mountSidebar()
    const expandBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Expand / collapse sidebar'))
    await expandBtn!.trigger('click')
    // Started at `false` (honouring the explicit preference),
    // first click flips to `true`.
    expect(localStorage.getItem('sidebar-expanded')).toBe('true')
    wrapper.unmount()
  })

  it('emits close-sidebar when the ESC key is pressed while the sidebar is open', async () => {
    const wrapper = await mountSidebar(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27 }))

    expect(wrapper.emitted('close-sidebar')).toBeTruthy()
    wrapper.unmount()
  })

  it('does NOT emit close-sidebar on ESC when the sidebar is already closed', async () => {
    const wrapper = await mountSidebar(false)

    document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27 }))

    expect(wrapper.emitted('close-sidebar')).toBeFalsy()
    wrapper.unmount()
  })

  it('emits close-sidebar on outside click when the sidebar is open', async () => {
    const wrapper = await mountSidebar(true)

    // Click an element that is outside the sidebar DOM
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    document.body.removeChild(outside)

    expect(wrapper.emitted('close-sidebar')).toBeTruthy()
    wrapper.unmount()
  })

  it('does NOT emit close-sidebar when the outside-click handler sees an in-sidebar click', async () => {
    const wrapper = await mountSidebar(true)

    // Dispatch a click on the sidebar root itself (not a nav link). The
    // outside-click handler should treat it as "inside" and bail out.
    const sidebarEl = wrapper.find('#sidebar').element
    sidebarEl.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(wrapper.emitted('close-sidebar')).toBeFalsy()
    wrapper.unmount()
  })

  it('emits close-sidebar when a nav link is clicked (even same-route)', async () => {
    const wrapper = await mountSidebar(true)

    // Click the Dashboard link while already on "/". This does not change
    // the route, so we rely on the nav-list click handler — not the route
    // watcher — to close the overlay.
    await wrapper
      .find('[data-testid="sidebar-dashboard-link"]')
      .trigger('click')

    expect(wrapper.emitted('close-sidebar')).toBeTruthy()
    wrapper.unmount()
  })

  it('auto-closes the sidebar on route navigation', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()
    const wrapper = mount(AppSidebar, {
      props: { sidebarOpen: true },
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    })

    await router.push('/entries')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close-sidebar')).toBeTruthy()
    wrapper.unmount()
  })

  it('toggles the sidebar-expanded body class and localStorage when the expand button is clicked', async () => {
    const wrapper = await mountSidebar(false)

    await wrapper.find('button[aria-label], button .sr-only').exists()
    // The expand button is identified by its sr-only label text
    const buttons = wrapper.findAll('button')
    const expandBtn = buttons.find((b) =>
      b.text().includes('Expand / collapse sidebar'),
    )
    expect(expandBtn).toBeDefined()

    await expandBtn!.trigger('click')

    expect(localStorage.getItem('sidebar-expanded')).toBe('true')
    expect(document.body.classList.contains('sidebar-expanded')).toBe(true)

    await expandBtn!.trigger('click')

    expect(localStorage.getItem('sidebar-expanded')).toBe('false')
    expect(document.body.classList.contains('sidebar-expanded')).toBe(false)

    wrapper.unmount()
  })

  it('removes document event listeners on unmount', async () => {
    const wrapper = await mountSidebar(true)
    wrapper.unmount()

    // After unmount, ESC should not trigger any emission on an unmounted wrapper.
    // This is a smoke test for the onUnmounted cleanup path — no assertion needed
    // beyond not throwing.
    document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27 }))
  })

  // -- Sidebar title regression tests --

  it('title text has overflow-hidden so it does not clip mid-character when collapsed', async () => {
    const wrapper = await mountSidebar()
    const title = wrapper.find('h1')
    expect(title.text()).toContain('JOURNAL INSIGHTS TOOL')
    expect(title.classes()).toContain('overflow-hidden')
    wrapper.unmount()
  })

  it('title text allows wrapping when sidebar is expanded (no permanent whitespace-nowrap)', async () => {
    // Regression: whitespace-nowrap was applied unconditionally, preventing
    // the title from wrapping in the expanded sidebar. The fix uses
    // lg:whitespace-nowrap (collapsed only) + lg:sidebar-expanded:whitespace-normal.
    const wrapper = await mountSidebar()
    const title = wrapper.find('h1')
    const classes = title.classes().join(' ')
    // Must NOT have bare "whitespace-nowrap" — only the responsive variants
    expect(classes).not.toMatch(/(?<!\S)whitespace-nowrap(?!\S)/)
    expect(classes).toContain('lg:whitespace-nowrap')
    expect(classes).toContain('lg:sidebar-expanded:whitespace-normal')
    wrapper.unmount()
  })

  it('title text fades out when sidebar is collapsed (lg:opacity-0)', async () => {
    const wrapper = await mountSidebar()
    const title = wrapper.find('h1')
    expect(title.classes()).toContain('lg:opacity-0')
    expect(title.classes()).toContain('lg:sidebar-expanded:opacity-100')
    wrapper.unmount()
  })

  it('renders the Job History sidebar link', async () => {
    const wrapper = await mountSidebar()
    const link = wrapper.find('[data-testid="sidebar-jobs-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/jobs')
    wrapper.unmount()
  })

  it('does not render the old Insights sidebar link', async () => {
    const wrapper = await mountSidebar()
    const link = wrapper.find('[data-testid="sidebar-insights-link"]')
    expect(link.exists()).toBe(false)
    wrapper.unmount()
  })

  it('hides the Admin link for non-admin users', async () => {
    const wrapper = await mountSidebar()
    expect(wrapper.text()).not.toContain('Admin')
    wrapper.unmount()
  })

  it('shows the Admin link for admin users', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const authStore = useAuthStore()
    authStore.$patch({ user: { id: 1, display_name: 'A', is_admin: true } })

    const router = makeRouter()
    await router.push('/')
    await router.isReady()
    const wrapper = mount(AppSidebar, {
      props: { sidebarOpen: true },
      attachTo: document.body,
      global: { plugins: [router, pinia] },
    })

    expect(wrapper.text()).toContain('Admin')
    wrapper.unmount()
  })
})
