import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  CreateStorylineRequest,
  CreateStorylineResponse,
  RegenerateStorylineRequest,
  RegenerateStorylineResponse,
  SetStorylineAnchorsResponse,
  StorylineDetail,
  StorylineListParams,
  StorylineSummary,
} from '@/types/storyline'
import {
  createStoryline as createStorylineApi,
  deleteStoryline as deleteStorylineApi,
  fetchStoryline,
  fetchStorylines,
  regenerateStoryline as regenerateStorylineApi,
  setStorylineAnchors as setStorylineAnchorsApi,
  updateStoryline as updateStorylineApi,
} from '@/api/storylines'

export const useStorylinesStore = defineStore('storylines', () => {
  const storylines = ref<StorylineSummary[]>([])
  const currentStoryline = ref<StorylineDetail | null>(null)
  const total = ref(0)
  // List + detail loading split (mirrors entities.ts) so a slow detail
  // fetch doesn't blank the list spinner if we ever render both in the
  // same view.
  const loading = ref(false)
  const detailLoading = ref(false)
  const error = ref<string | null>(null)
  const creating = ref(false)
  const createError = ref<string | null>(null)
  const regenerating = ref(false)
  const regenerateError = ref<string | null>(null)
  const savingAnchors = ref(false)
  const anchorsError = ref<string | null>(null)
  const savingName = ref(false)
  const nameError = ref<string | null>(null)
  const currentParams = ref<StorylineListParams>({
    limit: 20,
    offset: 0,
  })

  const totalPages = computed(() =>
    Math.ceil(total.value / (currentParams.value.limit || 20)),
  )
  const currentPage = computed(
    () =>
      Math.floor(
        (currentParams.value.offset || 0) / (currentParams.value.limit || 20),
      ) + 1,
  )
  const hasStorylines = computed(() => storylines.value.length > 0)

  async function loadStorylines(
    params: StorylineListParams = {},
  ): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const merged = { ...currentParams.value, ...params }
      currentParams.value = merged
      const resp = await fetchStorylines(merged)
      storylines.value = resp.items
      total.value = resp.total
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load storylines'
    } finally {
      loading.value = false
    }
  }

  async function loadStoryline(id: number): Promise<void> {
    detailLoading.value = true
    error.value = null
    try {
      currentStoryline.value = await fetchStoryline(id)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load storyline'
    } finally {
      detailLoading.value = false
    }
  }

  function clearCurrent(): void {
    currentStoryline.value = null
  }

  async function createStoryline(
    request: CreateStorylineRequest,
  ): Promise<CreateStorylineResponse> {
    creating.value = true
    createError.value = null
    try {
      return await createStorylineApi(request)
    } catch (e) {
      createError.value =
        e instanceof Error ? e.message : 'Failed to create storyline'
      throw e
    } finally {
      creating.value = false
    }
  }

  async function regenerate(
    id: number,
    body?: RegenerateStorylineRequest,
  ): Promise<RegenerateStorylineResponse> {
    regenerating.value = true
    regenerateError.value = null
    try {
      return await regenerateStorylineApi(id, body)
    } catch (e) {
      regenerateError.value =
        e instanceof Error ? e.message : 'Failed to queue regeneration'
      throw e
    } finally {
      regenerating.value = false
    }
  }

  /** Replace the anchor set on a storyline (PUT /anchors).
   *
   * The server response is authoritative — it dedupes and sorts the
   * ids ascending — so on success we refresh `currentStoryline` and
   * any matching list row from the response rather than echoing the
   * caller's selection. The PUT does not regenerate panels server-side;
   * callers that want fresh panels chain `regenerate()` afterwards. */
  async function setAnchors(
    id: number,
    entityIds: number[],
  ): Promise<SetStorylineAnchorsResponse> {
    savingAnchors.value = true
    anchorsError.value = null
    try {
      const resp = await setStorylineAnchorsApi(id, { entity_ids: entityIds })
      if (currentStoryline.value?.id === id) {
        currentStoryline.value = {
          ...currentStoryline.value,
          anchors: resp.anchors,
        }
      }
      const row = storylines.value.find((s) => s.id === id)
      if (row) {
        row.anchors = resp.anchors
      }
      return resp
    } catch (e) {
      anchorsError.value =
        e instanceof Error ? e.message : 'Failed to update anchors'
      throw e
    } finally {
      savingAnchors.value = false
    }
  }

  /** Rename a storyline (PATCH /api/storylines/{id}).
   *
   * The server trims the name and returns the authoritative value, so
   * on success we refresh `currentStoryline.name` and any matching list
   * row from the response. A rename does not touch panels, so callers
   * never need to chain a regeneration. */
  async function renameStoryline(id: number, name: string): Promise<void> {
    savingName.value = true
    nameError.value = null
    try {
      const resp = await updateStorylineApi(id, { name })
      if (currentStoryline.value?.id === id) {
        currentStoryline.value = {
          ...currentStoryline.value,
          name: resp.name,
        }
      }
      const row = storylines.value.find((s) => s.id === id)
      if (row) {
        row.name = resp.name
      }
    } catch (e) {
      nameError.value =
        e instanceof Error ? e.message : 'Failed to rename storyline'
      throw e
    } finally {
      savingName.value = false
    }
  }

  async function removeStoryline(id: number): Promise<void> {
    error.value = null
    try {
      await deleteStorylineApi(id)
      storylines.value = storylines.value.filter((s) => s.id !== id)
      total.value = Math.max(0, total.value - 1)
      if (currentStoryline.value?.id === id) {
        currentStoryline.value = null
      }
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Failed to delete storyline'
      throw e
    }
  }

  return {
    storylines,
    currentStoryline,
    total,
    loading,
    detailLoading,
    error,
    creating,
    createError,
    regenerating,
    regenerateError,
    savingAnchors,
    anchorsError,
    savingName,
    nameError,
    currentParams,
    totalPages,
    currentPage,
    hasStorylines,
    loadStorylines,
    loadStoryline,
    clearCurrent,
    createStoryline,
    regenerate,
    setAnchors,
    renameStoryline,
    removeStoryline,
  }
})
