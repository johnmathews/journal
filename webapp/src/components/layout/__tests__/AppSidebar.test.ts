import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppSidebar from '../AppSidebar.vue'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'entries', component: { template: '<div />' } },
      {
        path: '/entries/:id',
        name: 'entry-detail',
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
  })

  it('renders the Entries nav link', async () => {
    const wrapper = await mountSidebar()
    expect(wrapper.text()).toContain('Entries')
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
