import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChapterConfirmModal from '@/components/storylines/ChapterConfirmModal.vue'

describe('ChapterConfirmModal', () => {
  it('emits confirm with allow_gap=false by default', async () => {
    const w = mount(ChapterConfirmModal, {
      props: { title: 'Delete chapter', message: 'Sure?', showAllowGap: true },
    })
    await w.find('[data-test="confirm"]').trigger('click')
    expect(w.emitted('confirm')?.[0]).toEqual([{ allow_gap: false }])
  })
  it('reflects the allow_gap checkbox', async () => {
    const w = mount(ChapterConfirmModal, {
      props: { title: 'Delete', message: 'Sure?', showAllowGap: true },
    })
    await w.find('[data-test="allow-gap"]').setValue(true)
    await w.find('[data-test="confirm"]').trigger('click')
    expect(w.emitted('confirm')?.[0]).toEqual([{ allow_gap: true }])
  })
})
