import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DraftBlock from '../DraftBlock.vue'
import type { ChapterDetail, ChapterMeta } from '@/types/storyline'

const meta: ChapterMeta = {
  id: 9,
  seq: 3,
  title: '',
  state: 'draft',
  entry_count: 2,
  first_entry_date: '2026-06-01',
  last_entry_date: '2026-06-20',
  published_at: null,
  read_at: null,
  citation_count: 1,
}

const detail: ChapterDetail = {
  ...meta,
  segments: [{ kind: 'text', text: 'Forming arc.' }],
  addenda: [],
  model_used: 'opus',
  generated_at: '2026-06-21T00:00:00Z',
}

function mountBlock(chapter: ChapterDetail | null, updating = false) {
  return mount(DraftBlock, {
    props: { meta, chapter, updating },
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
}

describe('DraftBlock', () => {
  it('shows the entry count and the draft narrative', () => {
    const wrapper = mountBlock(detail)
    expect(wrapper.find('[data-testid="draft-heading"]').text()).toContain(
      '2 entries',
    )
    expect(wrapper.text()).toContain('Forming arc.')
  })

  it('shows the empty state when no narrative exists yet', () => {
    const wrapper = mountBlock({ ...detail, segments: [] })
    expect(wrapper.find('[data-testid="draft-empty"]').exists()).toBe(true)
  })

  it('emits refresh and disables the button while updating', async () => {
    const idle = mountBlock(detail, false)
    await idle.find('[data-testid="draft-refresh-button"]').trigger('click')
    expect(idle.emitted('refresh')).toHaveLength(1)

    const busy = mountBlock(detail, true)
    const button = busy.find('[data-testid="draft-refresh-button"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(busy.find('[data-testid="draft-updating"]').exists()).toBe(true)
  })
})
