import type { HealthResponse, ServerSettings } from '@/types/settings'
import { apiFetch } from './client'

export function fetchSettings(): Promise<ServerSettings> {
  return apiFetch<ServerSettings>('/api/settings')
}

export async function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/api/health')
}
