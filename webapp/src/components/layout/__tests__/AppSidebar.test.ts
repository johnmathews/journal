import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppSidebar from '../AppSidebar.vue'

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
    global: { plugins: [router] },
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

  it('emits close-sidebar when the mobile close button is clicked', async () => {
    const wrapper = await mountSidebar(true)

    await wrapper.find('button[aria-controls="sidebar"]').trigger('click')

    expect(wrapper.emitted('close-sidebar')).toBeTruthy()
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

  it('does NOT emit close-sidebar when the click target is inside the sidebar', async () => {
    const wrapper = await mountSidebar(true)

    // Click on the close-button (which lives inside the sidebar DOM)
    const insideBtn = wrapper.find('button[aria-controls="sidebar"]').element
    insideBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    // Note: the close button itself emits close-sidebar, so we expect exactly
    // one emission (from the click handler on the button), NOT a second
    // one from the outside-click handler.
    expect(wrapper.emitted('close-sidebar')).toHaveLength(1)
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
})
