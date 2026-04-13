import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiRequestError } from '@/api/client'
import { fetchHealth, fetchSettings } from '@/api/settings'
import type { HealthResponse, ServerSettings } from '@/types/settings'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<ServerSettings | null>(null)
  const health = ref<HealthResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [s, h] = await Promise.all([fetchSettings(), fetchHealth()])
      settings.value = s
      health.value = h
    } catch (e) {
      if (e instanceof ApiRequestError) {
        error.value = e.message
      } else if (e instanceof Error) {
        error.value = e.message
      } else {
        error.value = 'Failed to load settings'
      }
    } finally {
      loading.value = false
    }
  }

  return { settings, health, loading, error, load }
})
