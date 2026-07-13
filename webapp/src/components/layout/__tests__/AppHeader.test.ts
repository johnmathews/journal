import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import AppHeader from '../AppHeader.vue'

// AppNotifications (a child) calls jobsStore.hydrateActiveJobs() on
// mount, which would issue real listJobs fetches. Mock the api layer.
vi.mock('@/api/jobs', () => ({
  listJobs: vi.fn().mockResolvedValue({ items: [] }),
  getJob: vi.fn(),
  triggerMoodBackfill: vi.fn(),
}))

describe('AppHeader', () => {
  it('renders the hamburger button and the theme toggle', () => {
    const wrapper = mount(AppHeader, {
      props: { sidebarOpen: false },
      global: { plugins: [createPinia()] },
    })

    expect(wrapper.find('button[aria-controls="sidebar"]').exists()).toBe(true)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true)
  })

  it('emits toggle-sidebar when the hamburger is clicked', async () => {
    const wrapper = mount(AppHeader, {
      props: { sidebarOpen: false },
      global: { plugins: [createPinia()] },
    })

    await wrapper.find('button[aria-controls="sidebar"]').trigger('click')

    expect(wrapper.emitted('toggle-sidebar')).toBeTruthy()
    expect(wrapper.emitted('toggle-sidebar')).toHaveLength(1)
  })

  it('reflects sidebarOpen in the hamburger aria-expanded attribute', () => {
    const closed = mount(AppHeader, {
      props: { sidebarOpen: false },
      global: { plugins: [createPinia()] },
    })
    expect(
      closed
        .find('button[aria-controls="sidebar"]')
        .attributes('aria-expanded'),
    ).toBe('false')

    const open = mount(AppHeader, {
      props: { sidebarOpen: true },
      global: { plugins: [createPinia()] },
    })
    expect(
      open.find('button[aria-controls="sidebar"]').attributes('aria-expanded'),
    ).toBe('true')
  })
})
