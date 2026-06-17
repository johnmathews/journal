import type { AnswerCitation } from './search'

export interface ConversationMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  citations: AnswerCitation[]
  created_at: string
}

export interface ConversationSummary {
  id: number
  title: string
  updated_at: string
  message_count: number
}

export interface Conversation {
  id: number
  title: string
  created_at: string
  updated_at: string
  messages: ConversationMessage[]
}

export interface StartConversationParams {
  question: string
  answer: string
  citations: AnswerCitation[]
}
