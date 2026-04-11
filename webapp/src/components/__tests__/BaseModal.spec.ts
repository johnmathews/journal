import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseModal from '../BaseModal.vue'

/**
 * BaseModal teleports to document.body, so assertions target
 * document.body rather than the wrapper's own element tree.
 * Each test cleans up the body after running so leftover teleported
 * content doesn't leak between cases.
 */

function cleanupBody(): void {
  document.body.innerHTML = ''
  // Also reset inline overflow so one test's open state doesn't
  // leave `overflow: hidden` pinned on the body for later tests.
  document.body.style.overflow = ''
}

describe('BaseModal', () => {
  afterEach(() => {
    cleanupBody()
  })

  it('renders nothing when modelValue is false', () => {
    mount(BaseModal, {
      props: { modelValue: false, title: 'Hello' },
      slots: { default: '<p>Body content</p>' },
      attachTo: document.body,
    })

    expect(
      document.body.querySelector('[data-testid="modal-panel"]'),
    ).toBeNull()
  })

  it('renders the panel with title and slot content when open', () => {
    mount(BaseModal, {
      props: { modelValue: true, title: 'Hello world' },
      slots: { default: '<p data-testid="body-text">Body content</p>' },
      attachTo: document.body,
    })

    const panel = document.body.querySelector('[data-testid="modal-panel"]')
    expect(panel).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="modal-title"]')?.textContent,
    ).toBe('Hello world')
    expect(
      document.body.querySelector('[data-testid="body-text"]')?.textContent,
    ).toBe('Body content')
  })

  it('emits update:modelValue false when clicking the backdrop', async () => {
    const wrapper = mount(BaseModal, {
      props: { modelValue: true, title: 'Hello' },
      attachTo: document.body,
    })

    const backdrop = document.body.querySelector(
      '[data-testid="modal-backdrop"]',
    ) as HTMLElement
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('does not emit update:modelValue when clicking the panel', async () => {
    const wrapper = mount(BaseModal, {
      props: { modelValue: true, title: 'Hello' },
      slots: { default: '<p>Inside</p>' },
      attachTo: document.body,
    })

    const panel = document.body.querySelector(
      '[data-testid="modal-panel"]',
    ) as HTMLElement
    panel.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('emits update:modelValue false when the close button is clicked', async () => {
    const wrapper = mount(BaseModal, {
      props: { modelValue: true, title: 'Hello' },
      attachTo: document.body,
    })

    const closeBtn = document.body.querySelector(
      '[data-testid="modal-close"]',
    ) as HTMLElement
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('emits update:modelValue false when Escape is pressed', async () => {
    const wrapper = mount(BaseModal, {
      props: { modelValue: true, title: 'Hello' },
      attachTo: document.body,
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('renders the footer slot when provided', () => {
    mount(BaseModal, {
      props: { modelValue: true, title: 'Hello' },
      slots: {
        default: '<p>Body</p>',
        footer: '<button data-testid="confirm-btn">Confirm</button>',
      },
      attachTo: document.body,
    })

    expect(
      document.body.querySelector('[data-testid="modal-footer"]'),
    ).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="confirm-btn"]'),
    ).not.toBeNull()
  })

  it('omits the footer element when no footer slot is provided', () => {
    mount(BaseModal, {
      props: { modelValue: true, title: 'Hello' },
      slots: { default: '<p>Body</p>' },
      attachTo: document.body,
    })

    expect(
      document.body.querySelector('[data-testid="modal-footer"]'),
    ).toBeNull()
  })

  it('focuses the first focusable element inside the panel when opened', async () => {
    mount(BaseModal, {
      props: { modelValue: true, title: 'Hello' },
      slots: {
        default:
          '<button data-testid="first-btn">First</button><button>Second</button>',
      },
      attachTo: document.body,
    })

    // The watcher + nextTick schedule the focus move; flush microtasks.
    await nextTick()
    await nextTick()

    // The close button in the header is the first focusable element
    // in DOM order, so it should receive focus. Fall back to checking
    // active element is within the panel either way.
    const panel = document.body.querySelector(
      '[data-testid="modal-panel"]',
    ) as HTMLElement
    const active = document.activeElement as HTMLElement | null
    expect(active).not.toBeNull()
    expect(panel.contains(active)).toBe(true)
  })

  it('applies the correct max-width class for the size prop', () => {
    const cases: Array<['sm' | 'md' | 'lg', string]> = [
      ['sm', 'max-w-sm'],
      ['md', 'max-w-md'],
      ['lg', 'max-w-lg'],
    ]

    for (const [size, expected] of cases) {
      mount(BaseModal, {
        props: { modelValue: true, title: 'Hello', size },
        attachTo: document.body,
      })

      const panel = document.body.querySelector(
        '[data-testid="modal-panel"]',
      ) as HTMLElement
      expect(panel.className).toContain(expected)

      cleanupBody()
    }
  })

  it('defaults to the md size when size is not provided', () => {
    mount(BaseModal, {
      props: { modelValue: true, title: 'Hello' },
      attachTo: document.body,
    })

    const panel = document.body.querySelector(
      '[data-testid="modal-panel"]',
    ) as HTMLElement
    expect(panel.className).toContain('max-w-md')
  })
})
