import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import TileGrid from '../TileGrid.vue'

type TestTileId = 'alpha' | 'beta' | 'gamma'

const TILES = [
  { id: 'alpha' as TestTileId, title: 'Alpha', testId: 'tile-alpha-section' },
  { id: 'beta' as TestTileId, title: 'Beta', testId: 'tile-beta-section' },
  { id: 'gamma' as TestTileId, title: 'Gamma' },
] as const

function mountGrid(overrides: Partial<Record<string, unknown>> = {}) {
  return mount(TileGrid<TestTileId>, {
    props: {
      tiles: TILES,
      tileOrder: ['alpha', 'beta', 'gamma'],
      hiddenTiles: [],
      editing: false,
      gridClass: 'grid grid-cols-2 gap-4',
      getSpan: () => 'span 1',
      getWidthTitle: () => 'Full width',
      testIdPrefix: 'test',
      ...overrides,
    },
    slots: {
      'tile-alpha': () => h('div', { 'data-testid': 'alpha-content' }, 'A'),
      'tile-beta': () => h('div', { 'data-testid': 'beta-content' }, 'B'),
      'tile-gamma': () => h('div', { 'data-testid': 'gamma-content' }, 'G'),
    },
  })
}

describe('TileGrid', () => {
  it('renders one section per visible tile with the configured testIds', () => {
    const wrapper = mountGrid()
    expect(wrapper.find('[data-testid="test-tiles-grid"]').exists()).toBe(true)
    expect(wrapper.findAll('section')).toHaveLength(3)
    expect(wrapper.find('[data-testid="tile-alpha-section"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="tile-beta-section"]').exists()).toBe(
      true,
    )
    // Tile defs without a testId render a section but no data-testid is set.
    expect(wrapper.find('[data-testid="alpha-content"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="gamma-content"]').exists()).toBe(true)
  })

  it('hides tiles in hiddenTiles', () => {
    const wrapper = mountGrid({ hiddenTiles: ['beta'] })
    expect(wrapper.find('[data-testid="alpha-content"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="beta-content"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="gamma-content"]').exists()).toBe(true)
  })

  it('does not render edit controls when not editing', () => {
    const wrapper = mountGrid()
    expect(wrapper.find('[data-testid="tile-move-up-alpha"]').exists()).toBe(
      false,
    )
    expect(wrapper.find('[data-testid="tile-hide-alpha"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tile-width-alpha"]').exists()).toBe(
      false,
    )
    expect(
      wrapper.find('[data-testid="test-hidden-tiles-panel"]').exists(),
    ).toBe(false)
  })

  it('renders edit controls per tile when editing', () => {
    const wrapper = mountGrid({ editing: true })
    expect(wrapper.find('[data-testid="tile-move-up-alpha"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="tile-move-down-alpha"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="tile-width-alpha"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tile-hide-alpha"]').exists()).toBe(true)
  })

  it('emits move/hide/cycle-width events', async () => {
    const wrapper = mountGrid({ editing: true })

    await wrapper.find('[data-testid="tile-move-up-beta"]').trigger('click')
    expect(wrapper.emitted('move')).toEqual([['beta', 'up']])

    await wrapper.find('[data-testid="tile-move-down-beta"]').trigger('click')
    expect(wrapper.emitted('move')?.[1]).toEqual(['beta', 'down'])

    await wrapper.find('[data-testid="tile-hide-alpha"]').trigger('click')
    expect(wrapper.emitted('hide')).toEqual([['alpha']])

    await wrapper.find('[data-testid="tile-width-gamma"]').trigger('click')
    expect(wrapper.emitted('cycle-width')).toEqual([['gamma']])
  })

  it('shows the hidden-tiles restore panel only when editing AND there are hidden tiles', async () => {
    const wrapper = mountGrid({ editing: false, hiddenTiles: ['beta'] })
    expect(
      wrapper.find('[data-testid="test-hidden-tiles-panel"]').exists(),
    ).toBe(false)

    await wrapper.setProps({ editing: true })
    expect(
      wrapper.find('[data-testid="test-hidden-tiles-panel"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="test-restore-tile-beta"]').exists(),
    ).toBe(true)
  })

  it('emits show when a restore button is clicked, and reset when the reset button is clicked', async () => {
    const wrapper = mountGrid({
      editing: true,
      hiddenTiles: ['beta', 'gamma'],
    })
    await wrapper
      .find('[data-testid="test-restore-tile-beta"]')
      .trigger('click')
    expect(wrapper.emitted('show')).toEqual([['beta']])

    await wrapper.find('[data-testid="test-reset-layout"]').trigger('click')
    expect(wrapper.emitted('reset')).toEqual([[]])
  })

  it('applies getSpan to style.gridColumn for each section', () => {
    const wrapper = mountGrid({
      getSpan: (id: TestTileId) => (id === 'beta' ? '1 / -1' : 'span 1'),
    })
    const sections = wrapper.findAll('section')
    expect(sections[0].attributes('style')).toContain('grid-column: span 1')
    expect(sections[1].attributes('style')).toContain('grid-column: 1 / -1')
  })

  it('orders tiles by their position in tileOrder via CSS order', () => {
    const wrapper = mountGrid({ tileOrder: ['gamma', 'alpha', 'beta'] })
    const sections = wrapper.findAll('section')
    // sections are emitted in canonical (tiles prop) order, but CSS
    // order is rewritten from tileOrder so the rendered layout
    // matches the saved sequence.
    expect(sections[0].attributes('style')).toContain('order: 1') // alpha at idx 1
    expect(sections[1].attributes('style')).toContain('order: 2') // beta at idx 2
    expect(sections[2].attributes('style')).toContain('order: 0') // gamma at idx 0
  })

  it('honours available=false on a tile def by omitting it from the grid', () => {
    const wrapper = mount(TileGrid<TestTileId>, {
      props: {
        tiles: [
          { id: 'alpha', title: 'Alpha', testId: 'tile-alpha-section' },
          {
            id: 'beta',
            title: 'Beta',
            testId: 'tile-beta-section',
            available: false,
          },
        ],
        tileOrder: ['alpha', 'beta'],
        hiddenTiles: [],
        editing: false,
        gridClass: 'grid',
        getSpan: () => 'span 1',
        testIdPrefix: 'test',
      },
      slots: {
        'tile-alpha': () => h('div', 'A'),
        'tile-beta': () => h('div', 'B'),
      },
    })
    expect(wrapper.find('[data-testid="tile-alpha-section"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="tile-beta-section"]').exists()).toBe(
      false,
    )
  })

  it('exposes sectionEls keyed by tile id', async () => {
    const wrapper = mountGrid()
    await wrapper.vm.$nextTick()
    const exposed = wrapper.vm as unknown as {
      sectionEls: Record<string, HTMLElement>
    }
    expect(exposed.sectionEls.alpha).toBeInstanceOf(HTMLElement)
    expect(exposed.sectionEls.beta).toBeInstanceOf(HTMLElement)
    expect(exposed.sectionEls.gamma).toBeInstanceOf(HTMLElement)
  })

  it('renders the width-button title from getWidthTitle', () => {
    const wrapper = mountGrid({
      editing: true,
      getWidthTitle: (id: TestTileId) => `Cycle ${id}`,
    })
    expect(
      wrapper.find('[data-testid="tile-width-alpha"]').attributes('title'),
    ).toBe('Cycle alpha')
  })
})
