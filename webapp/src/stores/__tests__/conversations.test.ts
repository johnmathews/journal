import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/conversations', () => ({
  createConversation: vi.fn(),
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  sendMessage: vi.fn(),
  deleteConversation: vi.fn(),
}))

import {
  createConversation,
  listConversations,
  getConversation,
  sendMessage,
  deleteConversation,
} from '@/api/conversations'
import { useConversationsStore } from '../conversations'

const mCreate = vi.mocked(createConversation)
const mList = vi.mocked(listConversations)
const mGet = vi.mocked(getConversation)
const mSend = vi.mocked(sendMessage)
const mDelete = vi.mocked(deleteConversation)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

it('start creates a conversation and returns its id', async () => {
  mCreate.mockResolvedValue({
    id: 5,
    title: 'q',
    created_at: 't',
    updated_at: 't',
    messages: [
      { id: 1, role: 'user', content: 'q', citations: [], created_at: 't' },
    ],
  })
  const store = useConversationsStore()
  const id = await store.start({ question: 'q', answer: 'a', citations: [] })
  expect(id).toBe(5)
  expect(store.messages).toHaveLength(1)
})

it('open loads a conversation', async () => {
  mGet.mockResolvedValue({
    id: 5,
    title: 'q',
    created_at: 't',
    updated_at: 't',
    messages: [
      { id: 1, role: 'user', content: 'q', citations: [], created_at: 't' },
      {
        id: 2,
        role: 'assistant',
        content: 'a',
        citations: [],
        created_at: 't',
      },
    ],
  })
  const store = useConversationsStore()
  await store.open(5)
  expect(store.conversation?.id).toBe(5)
  expect(store.messages).toHaveLength(2)
})

it('open surfaces an error and does not throw on load failure', async () => {
  mGet.mockRejectedValue(new Error('boom'))
  const store = useConversationsStore()
  await store.open(999)
  expect(store.error).toBeTruthy()
  expect(store.messages).toHaveLength(0)
})

it('reply appends the assistant turn', async () => {
  mGet.mockResolvedValue({
    id: 5,
    title: 'q',
    created_at: 't',
    updated_at: 't',
    messages: [
      { id: 1, role: 'user', content: 'q', citations: [], created_at: 't' },
    ],
  })
  mSend.mockResolvedValue({
    id: 9,
    role: 'assistant',
    content: 'reply',
    citations: [],
    created_at: 't',
  })
  const store = useConversationsStore()
  await store.open(5)
  await store.reply('follow up')
  // optimistic user turn + assistant turn appended
  const roles = store.messages.map((m) => m.role)
  expect(roles).toEqual(['user', 'user', 'assistant'])
  expect(store.messages.at(-1)?.content).toBe('reply')
  expect(store.sending).toBe(false)
})

it('reply surfaces an error and clears sending', async () => {
  mGet.mockResolvedValue({
    id: 5,
    title: 'q',
    created_at: 't',
    updated_at: 't',
    messages: [],
  })
  mSend.mockRejectedValue(new Error('boom'))
  const store = useConversationsStore()
  await store.open(5)
  await store.reply('x')
  expect(store.error).toBeTruthy()
  expect(store.sending).toBe(false)
  // The optimistic user turn is rolled back on failure — thread stays
  // consistent with the server (nothing was persisted).
  expect(store.messages).toHaveLength(0)
})

it('loadList populates summaries', async () => {
  mList.mockResolvedValue({
    conversations: [{ id: 1, title: 't', updated_at: 't', message_count: 2 }],
  })
  const store = useConversationsStore()
  await store.loadList()
  expect(store.summaries).toHaveLength(1)
})

it('remove deletes and drops the summary', async () => {
  mList.mockResolvedValue({
    conversations: [{ id: 1, title: 't', updated_at: 't', message_count: 2 }],
  })
  mDelete.mockResolvedValue()
  const store = useConversationsStore()
  await store.loadList()
  await store.remove(1)
  expect(store.summaries).toHaveLength(0)
  expect(mDelete).toHaveBeenCalledWith(1)
})

it('remove surfaces an error and keeps the summary on failure', async () => {
  mList.mockResolvedValue({
    conversations: [{ id: 1, title: 't', updated_at: 't', message_count: 2 }],
  })
  mDelete.mockRejectedValue(new Error('boom'))
  const store = useConversationsStore()
  await store.loadList()
  await store.remove(1)
  expect(store.error).toBeTruthy()
  expect(store.summaries).toHaveLength(1)
})
