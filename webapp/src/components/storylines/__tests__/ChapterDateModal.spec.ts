import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChapterDateModal from '@/components/storylines/ChapterDateModal.vue'

describe('ChapterDateModal', () => {
  it('emits submit with start_date when showEnd is false', async () => {
    const w = mount(ChapterDateModal, {
      props: { title: 'Split chapter', showEnd: false },
    })
    await w.find('[data-test="start"]').setValue('2026-04-01')
    await w.find('[data-test="save"]').trigger('click')
    expect(w.emitted('submit')?.[0]).toEqual([{ start_date: '2026-04-01' }])
  })
  it('includes end_date when showEnd is true', async () => {
    const w = mount(ChapterDateModal, {
      props: { title: 'Edit', showEnd: true },
    })
    await w.find('[data-test="start"]').setValue('2026-04-01')
    await w.find('[data-test="end"]').setValue('2026-06-30')
    await w.find('[data-test="save"]').trigger('click')
    expect(w.emitted('submit')?.[0]).toEqual([
      { start_date: '2026-04-01', end_date: '2026-06-30' },
    ])
  })
  it('omits end_date when showEnd is true but End field is left blank', async () => {
    const w = mount(ChapterDateModal, {
      props: { title: 'Add chapter', showEnd: true },
    })
    await w.find('[data-test="start"]').setValue('2026-04-01')
    // Do NOT fill in end — should emit without end_date
    await w.find('[data-test="save"]').trigger('click')
    expect(w.emitted('submit')?.[0]).toEqual([{ start_date: '2026-04-01' }])
  })
  it('renders hint text when the hint prop is provided', async () => {
    const w = mount(ChapterDateModal, {
      props: {
        title: 'Add chapter',
        showEnd: true,
        hint: 'Leave End blank to start a new open chapter.',
      },
    })
    expect(w.find('[data-test="chapter-modal-hint"]').exists()).toBe(true)
    expect(w.find('[data-test="chapter-modal-hint"]').text()).toContain(
      'Leave End blank',
    )
  })
  it('does not render hint when the hint prop is absent', async () => {
    const w = mount(ChapterDateModal, {
      props: { title: 'Split chapter', showEnd: false },
    })
    expect(w.find('[data-test="chapter-modal-hint"]').exists()).toBe(false)
  })
})
