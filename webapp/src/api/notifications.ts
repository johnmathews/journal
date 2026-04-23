import { apiFetch } from './client'
import type {
  NotificationTopicsResponse,
  NotificationStatusResponse,
  NotificationValidateResponse,
  NotificationTestResponse,
} from '@/types/notifications'

export function fetchNotificationTopics(): Promise<NotificationTopicsResponse> {
  return apiFetch<NotificationTopicsResponse>('/api/notifications/topics')
}

export function fetchNotificationStatus(): Promise<NotificationStatusResponse> {
  return apiFetch<NotificationStatusResponse>('/api/notifications/status')
}

export function validatePushoverCredentials(
  userKey: string,
  appToken: string,
): Promise<NotificationValidateResponse> {
  return apiFetch<NotificationValidateResponse>('/api/notifications/validate', {
    method: 'POST',
    body: JSON.stringify({ user_key: userKey, app_token: appToken }),
  })
}

export function sendPushoverTest(): Promise<NotificationTestResponse> {
  return apiFetch<NotificationTestResponse>('/api/notifications/test', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
