import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import DefaultLayout from '../DefaultLayout.vue'

// AppHeader's AppNotifications child calls jobsStore.hydrateActiveJobs()
// on mount, which would issue real listJobs fetches. Mock the api layer.
vi.mock('@/api/jobs', () => ({
  listJobs: vi.fn().mockResolvedValue({ items: [] }),
  getJob: vi.fn(),
  triggerMoodBackfill: vi.fn(),
}))

// FitnessAuthBanner hydrates the fitness sync status on mount.
vi.mock('@/api/fitness', () => ({
  fetchSyncStatus: vi.fn().mockResolvedValue({ strava: null, garmin: null }),
  fetchActivities: vi.fn(),
  fetchDaily: vi.fn(),
  triggerSync: vi.fn(),
  fetchIntegrity: vi.fn(),
  triggerBackfill: vi.fn(),
}))

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'entries', component: { template: '<div />' } },
    ],
  })
}

describe('DefaultLayout', () => {
  it('renders sidebar, header, and slot content together', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()

    const wrapper = mount(DefaultLayout, {
      slots: {
        default: '<p data-testid="child">child content</p>',
      },
      global: { plugins: [createPinia(), router] },
    })

    // Sidebar renders the Entries nav link
    expect(wrapper.text()).toContain('Entries')
    // Header renders the hamburger + theme toggle
    expect(
      wrapper.find('header button[aria-controls="sidebar"]').exists(),
    ).toBe(true)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true)
    // Slot content is rendered inside main
    expect(wrapper.find('[data-testid="child"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="child"]').text()).toBe('child content')
  })

  it('toggles sidebarOpen when the header hamburger emits toggle-sidebar', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()

    const wrapper = mount(DefaultLayout, {
      global: { plugins: [createPinia(), router] },
    })

    // Both Sidebar (close button) and Header (hamburger) have
    // aria-controls="sidebar"; scope the selector to the header.
    const hamburger = wrapper.find('header button[aria-controls="sidebar"]')
    expect(hamburger.attributes('aria-expanded')).toBe('false')

    await hamburger.trigger('click')
    expect(hamburger.attributes('aria-expanded')).toBe('true')

    await hamburger.trigger('click')
    expect(hamburger.attributes('aria-expanded')).toBe('false')
  })

  it('closes the sidebar when the child Sidebar emits close-sidebar', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()

    const wrapper = mount(DefaultLayout, {
      attachTo: document.body,
      global: { plugins: [createPinia(), router] },
    })

    // Open the sidebar via the hamburger in the header
    const hamburger = wrapper.find('header button[aria-controls="sidebar"]')
    await hamburger.trigger('click')
    expect(hamburger.attributes('aria-expanded')).toBe('true')

    // Now press ESC on the document — the Sidebar's key handler will
    // emit close-sidebar, which DefaultLayout's @close-sidebar handler
    // should flip sidebarOpen back to false.
    document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27 }))
    await wrapper.vm.$nextTick()

    expect(hamburger.attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })
})
