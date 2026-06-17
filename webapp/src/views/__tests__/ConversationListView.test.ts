import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ConversationListView from '../ConversationListView.vue'

vi.mock('@/api/conversations', () => ({
  listConversations: vi.fn(),
  deleteConversation: vi.fn(),
  getConversation: vi.fn(),
  sendMessage: vi.fn(),
  createConversation: vi.fn(),
}))

import { listConversations, deleteConversation } from '@/api/conversations'
const mList = vi.mocked(listConversations)
const mDelete = vi.mocked(deleteConversation)

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/conversations',
      name: 'conversations',
      component: ConversationListView,
    },
    {
      path: '/conversations/:id',
      name: 'conversation',
      component: { template: '<div/>' },
    },
  ],
})

async function mountView() {
  router.push('/conversations')
  await router.isReady()
  return mount(ConversationListView, {
    global: { plugins: [createPinia(), router] },
  })
}

describe('ConversationListView', () => {
  enableAutoUnmount(beforeEach)
  const originalConfirm = window.confirm
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })
  // happy-dom has no window.confirm to spy on, so we assign a stub and
  // restore it in afterEach (leak-safe even if a test body throws).
  afterEach(() => {
    window.confirm = originalConfirm
  })

  it('renders rows', async () => {
    mList.mockResolvedValue({
      conversations: [
        {
          id: 1,
          title: 'first thread',
          updated_at: '2026-06-17T00:00:00Z',
          message_count: 4,
        },
      ],
    })
    const wrapper = await mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('first thread')
    expect(wrapper.find('[data-testid="conversation-row"]').exists()).toBe(true)
  })

  it('delete removes the row after confirm', async () => {
    mList.mockResolvedValue({
      conversations: [
        {
          id: 1,
          title: 'x',
          updated_at: '2026-06-17T00:00:00Z',
          message_count: 2,
        },
      ],
    })
    mDelete.mockResolvedValue()
    window.confirm = vi
      .fn()
      .mockReturnValue(true) as unknown as typeof window.confirm
    const wrapper = await mountView()
    await flushPromises()
    await wrapper.find('[data-testid="delete-conversation"]').trigger('click')
    await flushPromises()
    expect(mDelete).toHaveBeenCalledWith(1)
    expect(wrapper.find('[data-testid="conversation-row"]').exists()).toBe(
      false,
    )
  })
})
