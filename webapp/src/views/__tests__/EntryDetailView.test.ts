import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import EntryDetailView from '../EntryDetailView.vue'

vi.mock('@/api/entries', () => ({
  fetchEntries: vi.fn(),
  fetchEntry: vi.fn().mockResolvedValue({
    id: 1,
    entry_date: '2026-03-22',
    source_type: 'ocr',
    raw_text: 'Original OCR text here.',
    final_text: 'Corrected text here.',
    page_count: 2,
    word_count: 4,
    chunk_count: 1,
    language: 'en',
    created_at: '2026-03-23T10:30:00Z',
    updated_at: '2026-03-23T10:30:00Z',
  }),
  updateEntryText: vi.fn().mockResolvedValue({
    id: 1,
    entry_date: '2026-03-22',
    source_type: 'ocr',
    raw_text: 'Original OCR text here.',
    final_text: 'Updated text',
    page_count: 2,
    word_count: 4,
    chunk_count: 1,
    language: 'en',
    created_at: '2026-03-23T10:30:00Z',
    updated_at: '2026-03-23T10:30:00Z',
  }),
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'entries', component: { template: '<div />' } },
    {
      path: '/entries/:id',
      name: 'entry-detail',
      component: EntryDetailView,
      props: true,
    },
  ],
})

function mountComponent() {
  return mount(EntryDetailView, {
    props: { id: '1' },
    global: {
      plugins: [createPinia(), router],
    },
  })
}

describe('EntryDetailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mounts without error', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('[data-testid="entry-detail-view"]').exists()).toBe(true)
  })

  it('loads entry on mount', async () => {
    mountComponent()
    await flushPromises()

    const { fetchEntry } = await import('@/api/entries')
    expect(fetchEntry).toHaveBeenCalledWith(1)
  })

  it('renders entry detail after loading', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.vm.$nextTick()

    // After the mock resolves, either the loading state clears and the
    // view renders, or we're still in loading. Either way the root
    // container must exist.
    expect(wrapper.find('[data-testid="entry-detail-view"]').exists()).toBe(true)
    // When the fetch resolves, the back button becomes visible.
    expect(wrapper.find('[data-testid="back-button"]').exists()).toBe(true)
  })
})
