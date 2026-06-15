import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChapterEditMenu from '@/components/storylines/ChapterEditMenu.vue'

const chapter = {
  id: 1,
  seq: 1,
  title: 'A',
  state: 'closed' as const,
  start_date: '2026-01-01',
  end_date: '2026-03-31',
  citation_count: 0,
  storyline_id: 1,
  last_generated_at: null,
}

describe('ChapterEditMenu', () => {
  it('emits edit/split intents', async () => {
    const w = mount(ChapterEditMenu, { props: { chapter, hasNext: true } })
    await w.find('[data-test="menu-toggle"]').trigger('click')
    await w.find('[data-test="action-edit"]').trigger('click')
    expect(w.emitted('edit')).toBeTruthy()
    await w.find('[data-test="menu-toggle"]').trigger('click')
    await w.find('[data-test="action-split"]').trigger('click')
    expect(w.emitted('split')).toBeTruthy()
  })
  it('hides "merge with next" when there is no next chapter', async () => {
    const w = mount(ChapterEditMenu, { props: { chapter, hasNext: false } })
    await w.find('[data-test="menu-toggle"]').trigger('click')
    expect(w.find('[data-test="action-merge"]').exists()).toBe(false)
  })
})
