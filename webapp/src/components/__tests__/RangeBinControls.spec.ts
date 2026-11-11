import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RangeBinControls from '../RangeBinControls.vue'

describe('RangeBinControls', () => {
  it('renders all five ranges and four bin widths by default', () => {
    const wrapper = mount(RangeBinControls, {
      props: { range: 'last_3_months', bin: 'week' },
    })
    expect(wrapper.findAll('[data-testid^="rangebin-range-"]')).toHaveLength(5)
    expect(wrapper.findAll('[data-testid^="rangebin-bin-"]')).toHaveLength(4)
  })

  it('marks the active range and bin with aria-pressed=true', () => {
    const wrapper = mount(RangeBinControls, {
      props: { range: 'last_6_months', bin: 'month' },
    })
    expect(
      wrapper
        .find('[data-testid="rangebin-range-last_6_months"]')
        .attributes('aria-pressed'),
    ).toBe('true')
    expect(
      wrapper
        .find('[data-testid="rangebin-bin-month"]')
        .attributes('aria-pressed'),
    ).toBe('true')
  })

  it('emits update:range when a different range is clicked', async () => {
    const wrapper = mount(RangeBinControls, {
      props: { range: 'last_3_months', bin: 'week' },
    })
    await wrapper
      .find('[data-testid="rangebin-range-last_1_year"]')
      .trigger('click')
    expect(wrapper.emitted('update:range')).toEqual([['last_1_year']])
  })

  it('does NOT emit when the active range is re-clicked', async () => {
    const wrapper = mount(RangeBinControls, {
      props: { range: 'last_3_months', bin: 'week' },
    })
    await wrapper
      .find('[data-testid="rangebin-range-last_3_months"]')
      .trigger('click')
    expect(wrapper.emitted('update:range')).toBeUndefined()
  })

  it('emits update:bin when a different bin is clicked', async () => {
    const wrapper = mount(RangeBinControls, {
      props: { range: 'last_3_months', bin: 'week' },
    })
    await wrapper.find('[data-testid="rangebin-bin-quarter"]').trigger('click')
    expect(wrapper.emitted('update:bin')).toEqual([['quarter']])
  })

  it('projects default-slot content inside the sticky filter strip', () => {
    const wrapper = mount(RangeBinControls, {
      props: { range: 'last_3_months', bin: 'week' },
      slots: { default: '<div data-testid="extra-control">Smoothing</div>' },
    })
    const strip = wrapper.find('[data-testid="rangebin-filters"]')
    expect(strip.find('[data-testid="extra-control"]').exists()).toBe(true)
  })

  it('respects the test-id-prefix prop', () => {
    const wrapper = mount(RangeBinControls, {
      props: { range: 'last_3_months', bin: 'week', testIdPrefix: 'dashboard' },
    })
    expect(wrapper.find('[data-testid="dashboard-filters"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="dashboard-range-all"]').exists()).toBe(
      true,
    )
  })

  it('honours availableRanges / availableBins overrides', () => {
    const wrapper = mount(RangeBinControls, {
      props: {
        range: 'last_3_months',
        bin: 'week',
        availableRanges: ['last_3_months', 'all'],
        availableBins: ['week', 'month'],
      },
    })
    expect(wrapper.findAll('[data-testid^="rangebin-range-"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid^="rangebin-bin-"]')).toHaveLength(2)
  })

  it('hides a group entirely when its list is empty', () => {
    const wrapper = mount(RangeBinControls, {
      props: {
        range: 'last_3_months',
        bin: 'week',
        availableBins: [],
      },
    })
    expect(wrapper.find('[data-testid="rangebin-range"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="rangebin-bin"]').exists()).toBe(false)
  })
})
