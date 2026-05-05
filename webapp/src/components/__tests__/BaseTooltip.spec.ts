import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Tooltip from '../BaseTooltip.vue'

describe('Tooltip', () => {
  it('renders the trigger from the default slot', () => {
    const wrapper = mount(Tooltip, {
      props: { text: 'A description' },
      slots: { default: '<button data-testid="trigger">click me</button>' },
    })
    expect(wrapper.find('[data-testid="trigger"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="trigger"]').text()).toBe('click me')
  })

  it('renders the tooltip text in the popover body', () => {
    const wrapper = mount(Tooltip, {
      props: { text: 'A clear description of the thing.' },
      slots: { default: '<button>trigger</button>' },
    })
    const tooltip = wrapper.find('[role="tooltip"]')
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.text()).toContain('A clear description of the thing.')
  })

  it('wires aria-describedby on the trigger to the tooltip id', () => {
    const wrapper = mount(Tooltip, {
      props: { text: 'help' },
      slots: { default: '<button data-testid="trigger">x</button>' },
    })
    const tooltip = wrapper.find('[role="tooltip"]')
    const tooltipId = tooltip.attributes('id')
    expect(tooltipId).toBeTruthy()
    // The aria-describedby is on the wrapper span, the parent of the trigger.
    const describedBy = wrapper
      .find('[data-testid="trigger"]')
      .element.parentElement?.getAttribute('aria-describedby')
    expect(describedBy).toBe(tooltipId)
  })

  it('places the tooltip above the trigger by default', () => {
    const wrapper = mount(Tooltip, {
      props: { text: 'help' },
      slots: { default: '<button>x</button>' },
    })
    const classes = wrapper.find('[role="tooltip"]').classes().join(' ')
    expect(classes).toContain('bottom-full')
    expect(classes).not.toContain('top-full')
  })

  it('places the tooltip below the trigger when placement="bottom"', () => {
    const wrapper = mount(Tooltip, {
      props: { text: 'help', placement: 'bottom' },
      slots: { default: '<button>x</button>' },
    })
    const classes = wrapper.find('[role="tooltip"]').classes().join(' ')
    expect(classes).toContain('top-full')
    expect(classes).not.toContain('bottom-full')
  })

  it('the tooltip slot wins over the text prop when both are provided', () => {
    const wrapper = mount(Tooltip, {
      props: { text: 'plain' },
      slots: {
        default: '<button>x</button>',
        tooltip: '<strong>rich</strong>',
      },
    })
    const tooltip = wrapper.find('[role="tooltip"]')
    expect(tooltip.html()).toContain('<strong>rich</strong>')
    expect(tooltip.text()).not.toContain('plain')
  })
})
