import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { ApiRequestError } from '@/api/client'
import {
  fetchHealth,
  fetchSettings,
  updateRuntimeSettings,
  updatePricing as patchPricing,
} from '@/api/settings'
import type {
  HealthResponse,
  PricingEntry,
  ServerSettings,
} from '@/types/settings'
import { DEFAULT_PRICING, type PricingConfig } from '@/utils/cost-estimates'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<ServerSettings | null>(null)
  const health = ref<HealthResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const updating = ref(false)

  // In-flight load promise so ensureLoaded() can join a load another
  // caller (e.g. SettingsView's eager load()) already started instead of
  // firing a duplicate fetch.
  let inflight: Promise<void> | null = null

  function load(): Promise<void> {
    const p = doLoad().finally(() => {
      if (inflight === p) inflight = null
    })
    inflight = p
    return p
  }

  async function doLoad(): Promise<void> {
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

  /**
   * Load settings at most once. Callers that only need the settings to be
   * present (feature-flag readers like the Strava-mothball gating) use this
   * instead of load() so several components mounting together produce a
   * single fetch. A failed load leaves `settings` null — flag readers must
   * fail closed (treat unknown as disabled) — and the next ensureLoaded()
   * call retries.
   */
  function ensureLoaded(): Promise<void> {
    if (inflight) return inflight
    if (settings.value) return Promise.resolve()
    return load()
  }

  /** Build a PricingConfig from server pricing data, falling back to defaults. */
  const pricingConfig = computed<PricingConfig>(() => {
    const entries = settings.value?.pricing
    if (!entries || entries.length === 0) return DEFAULT_PRICING
    const models: Record<string, { input: number; output: number }> = {
      ...DEFAULT_PRICING.models,
    }
    const transcription: Record<string, number> = {
      ...DEFAULT_PRICING.transcription,
    }
    for (const e of entries) {
      if (e.category === 'transcription' && e.cost_per_minute != null) {
        transcription[e.model] = e.cost_per_minute
      } else if (e.input_cost_per_mtok != null) {
        models[e.model] = {
          input: e.input_cost_per_mtok,
          output: e.output_cost_per_mtok ?? 0,
        }
      }
    }
    return { models, transcription }
  })

  async function updateRuntime(
    changes: Record<string, boolean | string>,
  ): Promise<void> {
    updating.value = true
    try {
      const result = await updateRuntimeSettings(changes)
      // Replace the runtime array with the fresh server state
      if (settings.value) {
        settings.value = { ...settings.value, runtime: result.settings }
      }
    } finally {
      updating.value = false
    }
  }

  async function updatePricing(
    changes: Record<string, Partial<PricingEntry>>,
  ): Promise<void> {
    updating.value = true
    try {
      const result = await patchPricing(changes)
      if (settings.value) {
        settings.value = { ...settings.value, pricing: result.pricing }
      }
    } finally {
      updating.value = false
    }
  }

  return {
    settings,
    health,
    loading,
    error,
    updating,
    pricingConfig,
    load,
    ensureLoaded,
    updateRuntime,
    updatePricing,
  }
})
