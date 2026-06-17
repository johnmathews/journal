import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ConversationView from '../ConversationView.vue'

vi.mock('@/api/conversations', () => ({
  getConversation: vi.fn(),
  sendMessage: vi.fn(),
  createConversation: vi.fn(),
  listConversations: vi.fn(),
  deleteConversation: vi.fn(),
}))

import { getConversation, sendMessage } from '@/api/conversations'
const mGet = vi.mocked(getConversation)
const mSend = vi.mocked(sendMessage)

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/conversations/:id',
      name: 'conversation',
      component: ConversationView,
    },
    { path: '/search', name: 'search', component: { template: '<div/>' } },
    {
      path: '/entries/:id',
      name: 'entry-detail',
      component: { template: '<div/>' },
    },
  ],
})

async function mountAt(id: number) {
  router.push(`/conversations/${id}`)
  await router.isReady()
  return mount(ConversationView, {
    global: { plugins: [createPinia(), router] },
  })
}

describe('ConversationView', () => {
  enableAutoUnmount(beforeEach)
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders the turns with citation chips', async () => {
    mGet.mockResolvedValue({
      id: 5,
      title: 'when did my back hurt?',
      created_at: 't',
      updated_at: 't',
      messages: [
        {
          id: 1,
          role: 'user',
          content: 'when did my back hurt?',
          citations: [],
          created_at: 't',
        },
        {
          id: 2,
          role: 'assistant',
          content: 'On 2026-02-14.',
          citations: [
            { entry_id: 42, entry_date: '2026-02-14', snippet: 'back' },
          ],
          created_at: 't',
        },
      ],
    })
    const wrapper = await mountAt(5)
    await flushPromises()
    expect(wrapper.text()).toContain('On 2026-02-14.')
    const chip = wrapper.find('[data-testid="message-citation"]')
    expect(chip.exists()).toBe(true)
    expect(chip.attributes('href')).toContain('/entries/42')
  })

  it('sending a message calls reply', async () => {
    mGet.mockResolvedValue({
      id: 5,
      title: 'q',
      created_at: 't',
      updated_at: 't',
      messages: [],
    })
    mSend.mockResolvedValue({
      id: 9,
      role: 'assistant',
      content: 'reply',
      citations: [],
      created_at: 't',
    })
    const wrapper = await mountAt(5)
    await flushPromises()
    await wrapper
      .find('[data-testid="conversation-input"]')
      .setValue('follow up')
    await wrapper.find('[data-testid="conversation-form"]').trigger('submit')
    await flushPromises()
    expect(mSend).toHaveBeenCalledWith(5, 'follow up')
    expect(wrapper.text()).toContain('reply')
  })
})
