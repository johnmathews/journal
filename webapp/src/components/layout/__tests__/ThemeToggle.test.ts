import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ThemeToggle from '../ThemeToggle.vue'

describe('ThemeToggle', () => {
  beforeEach(() => {
    // useDark() persists to localStorage and mutates <html>; reset between tests
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('renders a hidden checkbox and a clickable label', () => {
    const wrapper = mount(ThemeToggle)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true)
    expect(wrapper.find('label').exists()).toBe(true)
  })

  it('adds the dark class to <html> when the user switches to dark mode', async () => {
    const wrapper = mount(ThemeToggle)
    const checkbox = wrapper.find('input[type="checkbox"]')

    await checkbox.setValue(true)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes the dark class when the user switches back to light mode', async () => {
    document.documentElement.classList.add('dark')
    const wrapper = mount(ThemeToggle)
    const checkbox = wrapper.find('input[type="checkbox"]')

    await checkbox.setValue(false)

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
