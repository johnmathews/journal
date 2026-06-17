import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  Conversation,
  ConversationMessage,
  ConversationSummary,
  StartConversationParams,
} from '@/types/conversation'
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  sendMessage,
} from '@/api/conversations'
import { ApiRequestError } from '@/api/client'

function friendlyError(e: unknown, fallback: string): string {
  if (e instanceof ApiRequestError) {
    return e.status >= 500
      ? 'The assistant is temporarily unavailable — please try again.'
      : e.message
  }
  if (e instanceof Error) return e.message
  return fallback
}

// Monotonically decreasing sentinel ids for optimistic (not-yet-persisted)
// user turns. Negative so they never collide with server ids, and unique
// across rapid sends so they are safe `v-for` keys.
let optimisticSeq = 0

export const useConversationsStore = defineStore('conversations', () => {
  const conversation = ref<Conversation | null>(null)
  const messages = ref<ConversationMessage[]>([])
  const sending = ref(false)
  const error = ref<string | null>(null)

  const summaries = ref<ConversationSummary[]>([])
  const listLoading = ref(false)

  async function start(seed: StartConversationParams): Promise<number> {
    const conv = await createConversation(seed)
    conversation.value = conv
    messages.value = conv.messages
    return conv.id
  }

  async function open(id: number): Promise<void> {
    error.value = null
    // Clear the prior thread so a slow fetch can't flash another
    // conversation's messages while loading.
    messages.value = []
    try {
      const conv = await getConversation(id)
      conversation.value = conv
      messages.value = conv.messages
    } catch (e) {
      // Surface load failures (network, 404 from a bad id) in the view's
      // error line rather than throwing an unhandled rejection.
      error.value = friendlyError(e, 'Failed to load conversation.')
    }
  }

  async function reply(message: string): Promise<void> {
    if (!conversation.value) return
    error.value = null
    sending.value = true
    // Optimistic user turn so the thread updates immediately.
    const optimistic: ConversationMessage = {
      id: --optimisticSeq,
      role: 'user',
      content: message,
      citations: [],
      created_at: new Date().toISOString(),
    }
    messages.value.push(optimistic)
    try {
      const assistant = await sendMessage(conversation.value.id, message)
      messages.value.push(assistant)
    } catch (e) {
      // Nothing was persisted server-side, so roll the optimistic turn
      // back out — the thread stays consistent with the server.
      messages.value = messages.value.filter((m) => m.id !== optimistic.id)
      error.value = friendlyError(e, 'Failed to send message.')
    } finally {
      sending.value = false
    }
  }

  async function loadList(): Promise<void> {
    error.value = null
    listLoading.value = true
    try {
      const res = await listConversations()
      summaries.value = res.conversations
    } catch (e) {
      error.value = friendlyError(e, 'Failed to load conversations.')
    } finally {
      listLoading.value = false
    }
  }

  async function remove(id: number): Promise<void> {
    await deleteConversation(id)
    summaries.value = summaries.value.filter((c) => c.id !== id)
  }

  return {
    conversation,
    messages,
    sending,
    error,
    summaries,
    listLoading,
    start,
    open,
    reply,
    loadList,
    remove,
  }
})
