import { apiFetch } from './client'

export interface PreferencesResponse {
  preferences: Record<string, unknown>
}

export function fetchPreferences(): Promise<PreferencesResponse> {
  return apiFetch<PreferencesResponse>('/api/users/me/preferences')
}

export function updatePreferences(
  changes: Record<string, unknown>,
): Promise<PreferencesResponse> {
  return apiFetch<PreferencesResponse>('/api/users/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
}
