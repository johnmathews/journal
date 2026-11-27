import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/preferences', () => ({
  fetchPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}))

import { updatePreferences } from '@/api/preferences'
import AppearanceSettings from '@/components/settings/AppearanceSettings.vue'
import { ACCENTS } from '@/brand/accents'
import { useAppearanceStore } from '@/stores/appearance'

const mockUpdate = vi.mocked(updatePreferences)

describe('AppearanceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('offers every accent as a named swatch, in order', () => {
    const wrapper = mount(AppearanceSettings)
    const options = wrapper.findAll('[data-testid^="accent-option-"]')
    expect(options.map((o) => o.text())).toEqual(ACCENTS.map((a) => a.name))
    expect(wrapper.find('legend').text()).toBe('Accent colour')
  })

  it('checks the current accent', () => {
    useAppearanceStore().accent = 'blue'
    const wrapper = mount(AppearanceSettings)
    const checked = wrapper
      .findAll('input[type="radio"]')
      .filter((i) => (i.element as HTMLInputElement).checked)
    expect(checked.map((i) => i.attributes('value'))).toEqual(['blue'])
  })

  it('picking a swatch applies it, saves it and says so', async () => {
    mockUpdate.mockResolvedValue({ preferences: { accent: 'green' } })
    const wrapper = mount(AppearanceSettings)
    await wrapper
      .find('[data-testid="accent-option-green"] input')
      .trigger('change')
    await flushPromises()
    expect(mockUpdate).toHaveBeenCalledWith({ accent: 'green' })
    expect(document.documentElement.dataset.accent).toBe('green')
    expect(wrapper.find('[data-testid="appearance-status"]').text()).toBe(
      'Saved',
    )
  })

  it('says what to do when the save fails', async () => {
    mockUpdate.mockRejectedValue(new Error('offline'))
    const wrapper = mount(AppearanceSettings)
    await wrapper
      .find('[data-testid="accent-option-rose"] input')
      .trigger('change')
    await flushPromises()
    const status = wrapper.find('[data-testid="appearance-status"]')
    expect(status.text()).toContain('Couldn’t save the colour')
    expect(status.classes()).toContain('text-error-ink')
    expect(useAppearanceStore().accent).toBe('violet')
  })
})
