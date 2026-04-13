import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import AppHeader from '../AppHeader.vue'

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
