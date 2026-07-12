import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import StorylineAnchorEditor from '../StorylineAnchorEditor.vue'
import type { EntitySummary } from '@/types/entity'
import type { StorylineAnchor } from '@/types/storyline'

vi.mock('@/api/entities', () => ({
  fetchEntities: vi.fn(),
}))

vi.mock('@/api/storylines', () => ({
  fetchStorylines: vi.fn(),
  fetchStoryline: vi.fn(),
  createStoryline: vi.fn(),
  refreshStoryline: vi.fn(),
  deleteStoryline: vi.fn(),
  setStorylineAnchors: vi.fn(),
}))

import { fetchEntities } from '@/api/entities'
import { setStorylineAnchors } from '@/api/storylines'
const mockFetchEntities = vi.mocked(fetchEntities)
const mockSetAnchors = vi.mocked(setStorylineAnchors)

function makeEntity(overrides: Partial<EntitySummary> = {}): EntitySummary {
  return {
    id: 700,
    entity_type: 'person',
    canonical_name: 'Sara',
    aliases: [],
    mention_count: 3,
    first_seen: '2026-01-01',
    last_seen: '2026-05-01',
    ...overrides,
  }
}

const defaultAnchors: StorylineAnchor[] = [
  { entity_id: 513, canonical_name: 'Vienna' },
  { entity_id: 514, canonical_name: 'Atlas' },
]

function mountEditor(anchors: StorylineAnchor[] = defaultAnchors) {
  return mount(StorylineAnchorEditor, {
    props: { storylineId: 3, anchors },
    global: { plugins: [createPinia()] },
  })
}

/** Type into the search box and let the 250ms debounce elapse. */
async function search(
  wrapper: ReturnType<typeof mountEditor>,
  query: string,
): Promise<void> {
  const input = wrapper.get('[data-testid="anchor-editor-search"]')
  await input.setValue(query)
  await vi.advanceTimersByTimeAsync(260)
  await flushPromises()
}

describe('StorylineAnchorEditor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pre-selects the current anchors as removable chips', () => {
    const wrapper = mountEditor()
    const chips = wrapper.findAll('[data-testid="anchor-editor-chip"]')
    expect(chips).toHaveLength(2)
    expect(chips[0].text()).toContain('Vienna')
    expect(chips[1].text()).toContain('Atlas')
  })

  it('Save is disabled while the selection matches the current anchor set', () => {
    const wrapper = mountEditor()
    const save = wrapper.get('[data-testid="anchor-editor-save"]')
    expect(save.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="anchor-editor-diff"]').exists()).toBe(
      false,
    )
  })

  it('adding an entity via search shows it in the added diff', async () => {
    mockFetchEntities.mockResolvedValue({
      items: [makeEntity()],
      total: 1,
      limit: 20,
      offset: 0,
    })
    const wrapper = mountEditor()
    await search(wrapper, 'sara')
    await wrapper.get('[data-testid="anchor-editor-result"]').trigger('click')
    const added = wrapper.get('[data-testid="anchor-diff-added"]')
    expect(added.text()).toContain('Sara')
    expect(wrapper.find('[data-testid="anchor-diff-removed"]').exists()).toBe(
      false,
    )
    expect(
      wrapper.get('[data-testid="anchor-editor-save"]').attributes('disabled'),
    ).toBeUndefined()
  })

  it('removing a current anchor shows it in the removed diff', async () => {
    const wrapper = mountEditor()
    await wrapper
      .get('[data-testid="anchor-editor-remove-514"]')
      .trigger('click')
    const removed = wrapper.get('[data-testid="anchor-diff-removed"]')
    expect(removed.text()).toContain('Atlas')
    expect(wrapper.find('[data-testid="anchor-diff-added"]').exists()).toBe(
      false,
    )
  })

  it('re-adding a removed anchor cancels the diff and disables Save again', async () => {
    mockFetchEntities.mockResolvedValue({
      items: [makeEntity({ id: 514, canonical_name: 'Atlas' })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    const wrapper = mountEditor()
    await wrapper
      .get('[data-testid="anchor-editor-remove-514"]')
      .trigger('click')
    await search(wrapper, 'atlas')
    await wrapper.get('[data-testid="anchor-editor-result"]').trigger('click')
    expect(wrapper.find('[data-testid="anchor-editor-diff"]').exists()).toBe(
      false,
    )
    expect(
      wrapper.get('[data-testid="anchor-editor-save"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('Save cannot empty the anchor set (min 1 anchor)', async () => {
    const wrapper = mountEditor([{ entity_id: 513, canonical_name: 'Vienna' }])
    await wrapper
      .get('[data-testid="anchor-editor-remove-513"]')
      .trigger('click')
    expect(
      wrapper.get('[data-testid="anchor-editor-save"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('clicking Save opens the confirm step instead of saving', async () => {
    const wrapper = mountEditor()
    await wrapper
      .get('[data-testid="anchor-editor-remove-514"]')
      .trigger('click')
    await wrapper.get('[data-testid="anchor-editor-save"]').trigger('click')
    expect(mockSetAnchors).not.toHaveBeenCalled()
    const confirm = wrapper.get('[data-testid="anchor-editor-confirm"]')
    expect(confirm.text()).toContain('refresh the draft')
    expect(
      wrapper.find('[data-testid="anchor-confirm-save-only"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="anchor-confirm-save-refresh"]').exists(),
    ).toBe(true)
  })

  it('Back from the confirm step returns to editing without saving', async () => {
    const wrapper = mountEditor()
    await wrapper
      .get('[data-testid="anchor-editor-remove-514"]')
      .trigger('click')
    await wrapper.get('[data-testid="anchor-editor-save"]').trigger('click')
    await wrapper.get('[data-testid="anchor-confirm-back"]').trigger('click')
    expect(wrapper.find('[data-testid="anchor-editor-confirm"]').exists()).toBe(
      false,
    )
    expect(wrapper.find('[data-testid="anchor-editor-search"]').exists()).toBe(
      true,
    )
    expect(mockSetAnchors).not.toHaveBeenCalled()
  })

  it('"Save only" PUTs the new anchor set and emits saved with refresh=false', async () => {
    mockSetAnchors.mockResolvedValue({
      id: 3,
      anchors: [{ entity_id: 513, canonical_name: 'Vienna' }],
    })
    const wrapper = mountEditor()
    await wrapper
      .get('[data-testid="anchor-editor-remove-514"]')
      .trigger('click')
    await wrapper.get('[data-testid="anchor-editor-save"]').trigger('click')
    await wrapper
      .get('[data-testid="anchor-confirm-save-only"]')
      .trigger('click')
    await flushPromises()
    expect(mockSetAnchors).toHaveBeenCalledWith(3, { entity_ids: [513] })
    expect(wrapper.emitted('saved')).toEqual([[{ refresh: false }]])
  })

  it('"Save & refresh" emits saved with refresh=true after the PUT', async () => {
    mockFetchEntities.mockResolvedValue({
      items: [makeEntity()],
      total: 1,
      limit: 20,
      offset: 0,
    })
    mockSetAnchors.mockResolvedValue({
      id: 3,
      anchors: [
        { entity_id: 513, canonical_name: 'Vienna' },
        { entity_id: 514, canonical_name: 'Atlas' },
        { entity_id: 700, canonical_name: 'Sara' },
      ],
    })
    const wrapper = mountEditor()
    await search(wrapper, 'sara')
    await wrapper.get('[data-testid="anchor-editor-result"]').trigger('click')
    await wrapper.get('[data-testid="anchor-editor-save"]').trigger('click')
    await wrapper
      .get('[data-testid="anchor-confirm-save-refresh"]')
      .trigger('click')
    await flushPromises()
    expect(mockSetAnchors).toHaveBeenCalledWith(3, {
      entity_ids: [513, 514, 700],
    })
    expect(wrapper.emitted('saved')).toEqual([[{ refresh: true }]])
  })

  it('a failed save surfaces the store error and drops back to the edit step', async () => {
    mockSetAnchors.mockRejectedValue(new Error('cap exceeded'))
    const wrapper = mountEditor()
    await wrapper
      .get('[data-testid="anchor-editor-remove-514"]')
      .trigger('click')
    await wrapper.get('[data-testid="anchor-editor-save"]').trigger('click')
    await wrapper
      .get('[data-testid="anchor-confirm-save-only"]')
      .trigger('click')
    await flushPromises()
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.get('[data-testid="anchor-editor-error"]').text()).toBe(
      'cap exceeded',
    )
    expect(wrapper.find('[data-testid="anchor-editor-confirm"]').exists()).toBe(
      false,
    )
  })

  it('Cancel emits close without saving', async () => {
    const wrapper = mountEditor()
    await wrapper.get('[data-testid="anchor-editor-cancel"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(mockSetAnchors).not.toHaveBeenCalled()
  })

  it('search results mark already-picked entities and toggle on click', async () => {
    mockFetchEntities.mockResolvedValue({
      items: [makeEntity({ id: 513, canonical_name: 'Vienna' })],
      total: 1,
      limit: 20,
      offset: 0,
    })
    const wrapper = mountEditor()
    await search(wrapper, 'vienna')
    const row = wrapper.get('[data-testid="anchor-editor-result"]')
    expect(row.text()).toContain('✓')
    // Clicking the already-picked row removes it from the selection.
    await row.trigger('click')
    expect(wrapper.findAll('[data-testid="anchor-editor-chip"]')).toHaveLength(
      1,
    )
    expect(wrapper.get('[data-testid="anchor-diff-removed"]').text()).toContain(
      'Vienna',
    )
  })

  it('shows a search error message when the entity search fails', async () => {
    mockFetchEntities.mockRejectedValue(new Error('search down'))
    const wrapper = mountEditor()
    await search(wrapper, 'x')
    expect(
      wrapper.get('[data-testid="anchor-editor-search-error"]').text(),
    ).toBe('search down')
  })

  it('disables the search input at the anchor cap', async () => {
    const anchors = Array.from({ length: 15 }, (_, i) => ({
      entity_id: i + 1,
      canonical_name: `E${i + 1}`,
    }))
    const wrapper = mountEditor(anchors)
    const input = wrapper.get('[data-testid="anchor-editor-search"]')
    expect(input.attributes('disabled')).toBeDefined()
    await nextTick()
    expect(input.attributes('placeholder')).toContain('15')
  })
})
