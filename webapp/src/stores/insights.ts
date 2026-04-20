import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiRequestError } from '@/api/client'
import {
  fetchEntityDistribution,
  fetchMoodDimensions,
  fetchMoodDrilldown,
  fetchMoodTrends,
} from '@/api/insights'
import type {
  DashboardBin,
  DashboardRange,
  MoodDimension,
  MoodTrendBin,
} from '@/types/dashboard'
import type {
  EntityDistributionItem,
  InsightsEntityType,
  MoodDrilldownEntry,
} from '@/types/insights'
import { rangeToDates } from './dashboard'

export const useInsightsStore = defineStore('insights', () => {
  // --- Shared filter state (independent from dashboard store) ---
  const range = ref<DashboardRange>('last_3_months')
  const bin = ref<DashboardBin>('week')

  // --- Mood chart state ---
  const moodDimensions = ref<MoodDimension[]>([])
  const moodBins = ref<MoodTrendBin[]>([])
  const hiddenMoodDimensions = ref<Set<string>>(new Set())
  const DEFAULT_ISOLATED_MOOD = 'agency'
  let moodDefaultsApplied = false
  const moodLoading = ref(false)
  const moodError = ref<string | null>(null)
  const moodHasLoaded = ref(false)

  const moodScoringEnabled = computed(() => moodDimensions.value.length > 0)
  const hasMoodData = computed(() => moodBins.value.length > 0)

  // --- Drill-down state ---
  const drillPeriod = ref<string | null>(null)
  const drillDimension = ref<string | null>(null)
  const drillEntries = ref<MoodDrilldownEntry[]>([])
  const drillLoading = ref(false)
  const drillError = ref<string | null>(null)

  // --- Entity distribution state ---
  const entityType = ref<InsightsEntityType>('topic')
  const entityDistribution = ref<EntityDistributionItem[]>([])
  const entityLoading = ref(false)
  const entityError = ref<string | null>(null)
  const entityHasLoaded = ref(false)

  // --- Actions ---

  async function loadMoodDimensions(): Promise<void> {
    try {
      const response = await fetchMoodDimensions()
      moodDimensions.value = response.dimensions
      if (!moodDefaultsApplied && response.dimensions.length > 0) {
        hiddenMoodDimensions.value = new Set(
          response.dimensions
            .map((d) => d.name)
            .filter((n) => n !== DEFAULT_ISOLATED_MOOD),
        )
        moodDefaultsApplied = true
      }
    } catch {
      moodDimensions.value = []
    }
  }

  async function loadMoodTrends(
    overrides: { range?: DashboardRange; bin?: DashboardBin } = {},
  ): Promise<void> {
    if (overrides.range !== undefined) range.value = overrides.range
    if (overrides.bin !== undefined) bin.value = overrides.bin

    moodLoading.value = true
    moodError.value = null
    try {
      const { from, to } = rangeToDates(range.value)
      const response = await fetchMoodTrends({
        bin: bin.value,
        from: from ?? undefined,
        to: to ?? undefined,
      })
      moodBins.value = response.bins
      moodHasLoaded.value = true
    } catch (e) {
      if (e instanceof ApiRequestError) {
        moodError.value = e.message
      } else if (e instanceof Error) {
        moodError.value = e.message
      } else {
        moodError.value = 'Failed to load mood data'
      }
      moodBins.value = []
    } finally {
      moodLoading.value = false
    }
  }

  function toggleMoodDimension(name: string): void {
    const allNames = moodDimensions.value.map((d) => d.name)
    const hidden = hiddenMoodDimensions.value

    if (hidden.size === allNames.length - 1 && !hidden.has(name)) {
      hiddenMoodDimensions.value = new Set()
      return
    }

    hiddenMoodDimensions.value = new Set(allNames.filter((n) => n !== name))
  }

  /**
   * Compute the end date for a bin period. E.g., a 'week' bin
   * starting 2026-04-14 ends on 2026-04-20.
   */
  function periodEndDate(periodStart: string, binSize: DashboardBin): string {
    // Compute the start of the NEXT period, then subtract 1 day.
    const d = new Date(periodStart + 'T12:00:00')
    switch (binSize) {
      case 'week':
        d.setDate(d.getDate() + 6)
        break
      case 'month':
        d.setMonth(d.getMonth() + 1)
        d.setDate(d.getDate() - 1)
        break
      case 'quarter':
        d.setMonth(d.getMonth() + 3)
        d.setDate(d.getDate() - 1)
        break
      case 'year':
        d.setFullYear(d.getFullYear() + 1)
        d.setDate(d.getDate() - 1)
        break
    }
    // Use local date parts to avoid timezone offset issues.
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  async function loadDrillDown(
    period: string,
    dimension: string,
  ): Promise<void> {
    drillPeriod.value = period
    drillDimension.value = dimension
    drillLoading.value = true
    drillError.value = null
    try {
      const response = await fetchMoodDrilldown({
        dimension,
        from: period,
        to: periodEndDate(period, bin.value),
      })
      drillEntries.value = response.entries
    } catch (e) {
      if (e instanceof ApiRequestError) {
        drillError.value = e.message
      } else if (e instanceof Error) {
        drillError.value = e.message
      } else {
        drillError.value = 'Failed to load drill-down data'
      }
      drillEntries.value = []
    } finally {
      drillLoading.value = false
    }
  }

  function clearDrillDown(): void {
    drillPeriod.value = null
    drillDimension.value = null
    drillEntries.value = []
    drillError.value = null
  }

  async function loadEntityDistribution(
    type?: InsightsEntityType,
  ): Promise<void> {
    if (type !== undefined) entityType.value = type

    entityLoading.value = true
    entityError.value = null
    try {
      const { from, to } = rangeToDates(range.value)
      const response = await fetchEntityDistribution({
        type: entityType.value,
        from: from ?? undefined,
        to: to ?? undefined,
        limit: 30,
      })
      entityDistribution.value = response.items
      entityHasLoaded.value = true
    } catch (e) {
      if (e instanceof ApiRequestError) {
        entityError.value = e.message
      } else if (e instanceof Error) {
        entityError.value = e.message
      } else {
        entityError.value = 'Failed to load entity distribution'
      }
      entityDistribution.value = []
    } finally {
      entityLoading.value = false
    }
  }

  function reset(): void {
    range.value = 'last_3_months'
    bin.value = 'week'
    moodDimensions.value = []
    moodBins.value = []
    hiddenMoodDimensions.value = new Set()
    moodDefaultsApplied = false
    moodLoading.value = false
    moodError.value = null
    moodHasLoaded.value = false
    drillPeriod.value = null
    drillDimension.value = null
    drillEntries.value = []
    drillLoading.value = false
    drillError.value = null
    entityType.value = 'topic'
    entityDistribution.value = []
    entityLoading.value = false
    entityError.value = null
    entityHasLoaded.value = false
  }

  return {
    range,
    bin,
    moodDimensions,
    moodBins,
    hiddenMoodDimensions,
    moodLoading,
    moodError,
    moodHasLoaded,
    moodScoringEnabled,
    hasMoodData,
    loadMoodDimensions,
    loadMoodTrends,
    toggleMoodDimension,
    drillPeriod,
    drillDimension,
    drillEntries,
    drillLoading,
    drillError,
    loadDrillDown,
    clearDrillDown,
    periodEndDate,
    entityType,
    entityDistribution,
    entityLoading,
    entityError,
    entityHasLoaded,
    loadEntityDistribution,
    reset,
  }
})
