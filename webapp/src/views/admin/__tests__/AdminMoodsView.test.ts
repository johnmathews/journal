import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AdminMoodsView from '../AdminMoodsView.vue'
import type { MoodDimension } from '@/types/dashboard'

vi.mock('@/api/dashboard', () => ({
  fetchMoodDimensions: vi.fn(),
}))

import { fetchMoodDimensions } from '@/api/dashboard'

const mockFetch = vi.mocked(fetchMoodDimensions)

const fakeDimensions: MoodDimension[] = [
  {
    name: 'joy_sadness',
    positive_pole: 'joy',
    negative_pole: 'sadness',
    scale_type: 'bipolar',
    score_min: -1,
    score_max: 1,
    notes: 'Joyful vs sad — the valence axis.',
  },
  {
    name: 'energy_fatigue',
    positive_pole: 'energetic',
    negative_pole: 'tired',
    scale_type: 'bipolar',
    score_min: -1,
    score_max: 1,
    notes: 'Arousal axis — energy vs fatigue.',
  },
  {
    name: 'agency',
    positive_pole: 'agency',
    negative_pole: 'apathy',
    scale_type: 'unipolar',
    score_min: 0,
    score_max: 1,
    notes: 'Agency — feeling in control.',
  },
  {
    name: 'frustration',
    positive_pole: 'frustrated',
    negative_pole: 'calm',
    scale_type: 'unipolar',
    score_min: 0,
    score_max: 1,
    notes: 'Active negative affect.',
  },
  {
    name: 'proactive_reactive',
    positive_pole: 'proactive',
    negative_pole: 'reactive',
    scale_type: 'bipolar',
    score_min: -1,
    score_max: 1,
    notes: 'Stance dimension.',
  },
]

function mountView() {
  return mount(AdminMoodsView, { global: { plugins: [createPinia()] } })
}

describe('AdminMoodsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders the page heading', async () => {
    mockFetch.mockResolvedValue({
      dimensions: [],
      meta: { version: '', description: '' },
    })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="admin-moods-page"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Mood scoring configuration')
  })

  it('shows the version from the [meta] block', async () => {
    mockFetch.mockResolvedValue({
      dimensions: fakeDimensions,
      meta: { version: '2026-05-05', description: 'test description' },
    })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="admin-moods-version"]').text()).toBe(
      '2026-05-05',
    )
    expect(wrapper.text()).toContain('test description')
  })

  it('falls back to "unknown" when version is empty', async () => {
    mockFetch.mockResolvedValue({
      dimensions: fakeDimensions,
      meta: { version: '', description: '' },
    })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="admin-moods-version"]').text()).toBe(
      'unknown',
    )
  })

  it('renders one panel per group, in toml order', async () => {
    mockFetch.mockResolvedValue({
      dimensions: fakeDimensions,
      meta: { version: '2026-05-05', description: '' },
    })
    const wrapper = mountView()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="admin-moods-group-affect"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="admin-moods-group-needs"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="admin-moods-group-negative"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="admin-moods-group-stance"]').exists(),
    ).toBe(true)
  })

  it('renders each dimension with poles, scale, and notes', async () => {
    mockFetch.mockResolvedValue({
      dimensions: fakeDimensions,
      meta: { version: '2026-05-05', description: '' },
    })
    const wrapper = mountView()
    await flushPromises()
    const joy = wrapper.find(
      '[data-testid="admin-moods-dimension-joy_sadness"]',
    )
    expect(joy.exists()).toBe(true)
    expect(joy.text()).toContain('joy')
    expect(joy.text()).toContain('sadness')
    expect(joy.text()).toContain('bipolar')
    expect(joy.text()).toContain('Joyful vs sad — the valence axis.')
  })

  it('renders frustration with the inverted "calm" display label', async () => {
    mockFetch.mockResolvedValue({
      dimensions: fakeDimensions,
      meta: { version: '2026-05-05', description: '' },
    })
    const wrapper = mountView()
    await flushPromises()
    const frustration = wrapper.find(
      '[data-testid="admin-moods-dimension-frustration"]',
    )
    expect(frustration.exists()).toBe(true)
    // displayLabel turns frustration → calm at render time.
    expect(frustration.text()).toContain('calm')
  })

  it('shows the empty state when no dimensions are loaded', async () => {
    mockFetch.mockResolvedValue({
      dimensions: [],
      meta: { version: '', description: '' },
    })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="admin-moods-empty"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="admin-moods-group-affect"]').exists(),
    ).toBe(false)
  })

  it('shows each group description from MOOD_GROUPS', async () => {
    mockFetch.mockResolvedValue({
      dimensions: fakeDimensions,
      meta: { version: '2026-05-05', description: '' },
    })
    const wrapper = mountView()
    await flushPromises()
    const affect = wrapper.find('[data-testid="admin-moods-group-affect"]')
    // Description is the same plain-English copy used in the dashboard tooltips.
    expect(affect.text()).toContain('How the entry feels overall')
  })
})
