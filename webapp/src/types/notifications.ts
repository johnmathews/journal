// Notification types. The `/api/notifications/*` response shapes are
// generated from the server's API contract
// (server/src/journal/api/contract/schemas.py); UI-only state stays
// hand-written below.
export type {
  NotificationStatusResponse,
  NotificationTestResponse,
  NotificationTopic,
  NotificationTopicGroup,
  NotificationTopicsResponse,
  NotificationValidateResponse,
} from './generated/api'

export type PushoverValidationStatus =
  | 'unchecked'
  | 'validating'
  | 'valid'
  | 'invalid'
