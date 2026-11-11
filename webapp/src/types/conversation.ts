// Conversation response types are generated from the server's API contract
// (server/src/journal/api/contract/schemas.py). The request body for
// starting a conversation stays hand-written below.
import type { AnswerCitation } from './search'

export type {
  Conversation,
  ConversationListResponse,
  ConversationMessage,
  ConversationRole,
  ConversationSummary,
} from './generated/api'

export interface StartConversationParams {
  question: string
  answer: string
  citations: AnswerCitation[]
}
