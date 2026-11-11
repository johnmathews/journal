import type {
  Conversation,
  ConversationMessage,
  ConversationSummary,
  StartConversationParams,
} from '@/types/conversation'
import { apiFetch } from './client'

export function createConversation(
  params: StartConversationParams,
): Promise<Conversation> {
  return apiFetch<Conversation>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({
      question: params.question,
      answer: params.answer,
      citations: params.citations,
    }),
  })
}

export function listConversations(): Promise<{
  conversations: ConversationSummary[]
}> {
  return apiFetch<{ conversations: ConversationSummary[] }>(
    '/api/conversations',
  )
}

export function getConversation(id: number): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/conversations/${id}`)
}

export function sendMessage(
  id: number,
  message: string,
): Promise<ConversationMessage> {
  return apiFetch<ConversationMessage>(`/api/conversations/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

export function deleteConversation(id: number): Promise<void> {
  return apiFetch<void>(`/api/conversations/${id}`, { method: 'DELETE' })
}
