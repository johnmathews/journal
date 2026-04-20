import type {
  HealthResponse,
  RuntimeSetting,
  ServerSettings,
} from '@/types/settings'
import { apiFetch } from './client'

export function fetchSettings(): Promise<ServerSettings> {
  return apiFetch<ServerSettings>('/api/settings')
}

export async function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/api/health')
}

export interface RuntimeSettingsResponse {
  updated: string[]
  settings: RuntimeSetting[]
  warnings?: string[]
}

export function updateRuntimeSettings(
  changes: Record<string, boolean | string>,
): Promise<RuntimeSettingsResponse> {
  return apiFetch<RuntimeSettingsResponse>('/api/settings/runtime', {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
}
