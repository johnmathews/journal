import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import EntryListView from '../EntryListView.vue'

vi.mock('@/api/entries', () => ({
  fetchEntries: vi.fn().mockResolvedValue({
    items: [
      {
        id: 1,
        entry_date: '2026-03-22',
        source_type: 'ocr',
        page_count: 2,
        word_count: 347,
        chunk_count: 5,
        created_at: '2026-03-23T10:30:00Z',
      },
      {
        id: 2,
        entry_date: '2026-03-21',
        source_type: 'voice',
        page_count: 0,
        word_count: 120,
        chunk_count: 2,
        created_at: '2026-03-21T15:00:00Z',
      },
    ],
    total: 2,
    limit: 20,
    offset: 0,
  }),
  fetchEntry: vi.fn(),
  updateEntryText: vi.fn(),
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'entries', component: EntryListView },
    {
      path: '/entries/:id',
      name: 'entry-detail',
      component: { template: '<div />' },
    },
  ],
})

function mountComponent() {
  return mount(EntryListView, {
    global: {
      plugins: [createPinia(), router, [PrimeVue, { theme: { preset: Aura } }]],
    },
  })
}

describe('EntryListView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the heading', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('h2').text()).toBe('Journal Entries')
  })

  it('loads entries on mount', async () => {
    const wrapper = mountComponent()
    // Wait for onMounted + async loadEntries
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const { fetchEntries } = await import('@/api/entries')
    expect(fetchEntries).toHaveBeenCalled()
  })

  it('displays entry count after loading', async () => {
    const wrapper = mountComponent()
    await new Promise((r) => setTimeout(r, 50))
    await wrapper.vm.$nextTick()

    const countSpan = wrapper.find('.entry-count')
    expect(countSpan.exists()).toBe(true)
    expect(countSpan.text()).toContain('2 entries')
  })
})
