import type { HealthResponse, ServerSettings } from '@/types/settings'
import { apiFetch } from './client'

export function fetchSettings(): Promise<ServerSettings> {
  return apiFetch<ServerSettings>('/api/settings')
}

export async function fetchHealth(): Promise<HealthResponse> {
  // /health bypasses bearer auth on the server, but sending the
  // header anyway is harmless and keeps the call simple.
  return apiFetch<HealthResponse>('/health')
}
