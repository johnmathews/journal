import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import JsonPopover from '../JsonPopover.vue'

function findPanel(): HTMLElement | null {
  return document.querySelector('[data-testid="json-popover-panel"]')
}

describe('JsonPopover', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('is closed by default', () => {
    mount(JsonPopover, {
      props: { content: { foo: 'bar' } },
      attachTo: document.body,
    })
    expect(findPanel()).toBeNull()
  })

  it('opens when the trigger is clicked', async () => {
    const wrapper = mount(JsonPopover, {
      props: { content: { foo: 'bar' } },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="json-popover-trigger"]').trigger('click')
    await flushPromises()
    expect(findPanel()).not.toBeNull()
  })

  it('renders the trigger label', () => {
    const wrapper = mount(JsonPopover, {
      props: { content: 'x', triggerLabel: 'show all' },
      attachTo: document.body,
    })
    expect(wrapper.find('[data-testid="json-popover-trigger"]').text()).toBe(
      'show all',
    )
  })

  it('renders objects as pretty JSON', async () => {
    const wrapper = mount(JsonPopover, {
      props: { content: { entry_id: 42, user_id: 1 } },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="json-popover-trigger"]').trigger('click')
    await flushPromises()
    const panel = findPanel()
    expect(panel).not.toBeNull()
    expect(panel!.textContent).toContain('"entry_id": 42')
    expect(panel!.textContent).toContain('"user_id": 1')
  })

  it('renders strings verbatim (no JSON quoting)', async () => {
    const wrapper = mount(JsonPopover, {
      props: { content: 'a really long error message about a timeout' },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="json-popover-trigger"]').trigger('click')
    await flushPromises()
    const panel = findPanel()
    expect(panel!.textContent).toContain(
      'a really long error message about a timeout',
    )
    expect(panel!.textContent!.trim()).not.toMatch(/^"/)
  })

  it('shows the title heading when provided', async () => {
    const wrapper = mount(JsonPopover, {
      props: { content: {}, title: 'Raw params' },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="json-popover-trigger"]').trigger('click')
    await flushPromises()
    expect(findPanel()!.textContent).toContain('Raw params')
  })

  it('closes on outside mousedown', async () => {
    const wrapper = mount(JsonPopover, {
      props: { content: { foo: 'bar' } },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="json-popover-trigger"]').trigger('click')
    await flushPromises()
    expect(findPanel()).not.toBeNull()
    // Simulate a mousedown on a node outside both the trigger and the panel.
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    const evt = new MouseEvent('mousedown', { bubbles: true })
    outside.dispatchEvent(evt)
    // Drop the listener-fired close-state through the event loop.
    await new Promise((r) => setTimeout(r, 0))
    await flushPromises()
    expect(findPanel()).toBeNull()
    wrapper.unmount()
  })

  it('closes on Escape', async () => {
    const wrapper = mount(JsonPopover, {
      props: { content: { foo: 'bar' } },
      attachTo: document.body,
    })
    await wrapper.find('[data-testid="json-popover-trigger"]').trigger('click')
    await flushPromises()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(findPanel()).toBeNull()
    wrapper.unmount()
  })
})
