import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/client', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '@/api/client'
import {
  createConversation,
  listConversations,
  getConversation,
  sendMessage,
  deleteConversation,
} from '../conversations'

const mockFetch = vi.mocked(apiFetch)

describe('conversations api client', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createConversation POSTs the seed', async () => {
    mockFetch.mockResolvedValue({ id: 1, title: 'q', messages: [] } as never)
    await createConversation({ question: 'q', answer: 'a', citations: [] })
    expect(mockFetch).toHaveBeenCalledWith('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ question: 'q', answer: 'a', citations: [] }),
    })
  })

  it('listConversations GETs the list', async () => {
    mockFetch.mockResolvedValue({ conversations: [] } as never)
    await listConversations()
    expect(mockFetch).toHaveBeenCalledWith('/api/conversations')
  })

  it('getConversation GETs by id', async () => {
    mockFetch.mockResolvedValue({ id: 3, messages: [] } as never)
    await getConversation(3)
    expect(mockFetch).toHaveBeenCalledWith('/api/conversations/3')
  })

  it('sendMessage POSTs the message', async () => {
    mockFetch.mockResolvedValue({ id: 9, role: 'assistant' } as never)
    await sendMessage(3, 'hi?')
    expect(mockFetch).toHaveBeenCalledWith('/api/conversations/3/messages', {
      method: 'POST',
      body: JSON.stringify({ message: 'hi?' }),
    })
  })

  it('deleteConversation DELETEs by id', async () => {
    mockFetch.mockResolvedValue(undefined as never)
    await deleteConversation(3)
    expect(mockFetch).toHaveBeenCalledWith('/api/conversations/3', {
      method: 'DELETE',
    })
  })
})
