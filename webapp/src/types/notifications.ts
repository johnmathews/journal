export type PushoverValidationStatus =
  | 'unchecked'
  | 'validating'
  | 'valid'
  | 'invalid'

export interface NotificationTopic {
  key: string
  label: string
  group: string
  admin_only: boolean
  default: boolean
  enabled: boolean
}

export interface NotificationTopicsResponse {
  topics: NotificationTopic[]
}

export interface NotificationStatusResponse {
  configured: boolean
}

export interface NotificationValidateResponse {
  valid: boolean
  error: string | null
}

export interface NotificationTestResponse {
  sent: boolean
  error: string | null
}
