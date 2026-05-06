import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  Entity,
  EntityListParams,
  EntityMention,
  EntityMergeResponse,
  EntityRelationship,
  EntitySummary,
  EntityUpdateRequest,
  MergeCandidate,
} from '@/types/entity'
import {
  deleteEntity as deleteEntityApi,
  fetchEntities,
  fetchEntity,
  fetchEntityMentions,
  fetchEntityRelationships,
  fetchMergeCandidates,
  fetchQuarantinedEntities,
  mergeEntities as mergeEntitiesApi,
  releaseQuarantine as releaseQuarantineApi,
  resolveMergeCandidate,
  updateEntity as updateEntityApi,
} from '@/api/entities'

export const useEntitiesStore = defineStore('entities', () => {
  // State
  const entities = ref<EntitySummary[]>([])
  const currentEntity = ref<Entity | null>(null)
  const mentions = ref<EntityMention[]>([])
  const outgoing = ref<EntityRelationship[]>([])
  const incoming = ref<EntityRelationship[]>([])
  const total = ref(0)
  const loading = ref(false)
  const detailLoading = ref(false)
  const error = ref<string | null>(null)
  const currentParams = ref<EntityListParams>({
    limit: 50,
    offset: 0,
  })

  // Getters
  const totalPages = computed(() =>
    Math.ceil(total.value / (currentParams.value.limit || 50)),
  )
  const currentPage = computed(
    () =>
      Math.floor(
        (currentParams.value.offset || 0) / (currentParams.value.limit || 50),
      ) + 1,
  )
  const hasEntities = computed(() => entities.value.length > 0)

  // Actions
  async function loadEntities(params: EntityListParams = {}) {
    loading.value = true
    error.value = null
    try {
      const merged = { ...currentParams.value, ...params }
      currentParams.value = merged
      const resp = await fetchEntities(merged)
      entities.value = resp.items
      total.value = resp.total
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load entities'
    } finally {
      loading.value = false
    }
  }

  async function loadEntity(id: number) {
    detailLoading.value = true
    error.value = null
    try {
      const [entity, mentionsResp, relsResp] = await Promise.all([
        fetchEntity(id),
        fetchEntityMentions(id),
        fetchEntityRelationships(id),
      ])
      currentEntity.value = entity
      mentions.value = mentionsResp.mentions
      outgoing.value = relsResp.outgoing
      incoming.value = relsResp.incoming
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load entity'
    } finally {
      detailLoading.value = false
    }
  }

  function clearCurrent() {
    currentEntity.value = null
    mentions.value = []
    outgoing.value = []
    incoming.value = []
  }

  // --- Entity management ---

  async function updateCurrentEntity(
    patch: EntityUpdateRequest,
  ): Promise<Entity> {
    error.value = null
    try {
      if (!currentEntity.value) throw new Error('No entity selected')
      const updated = await updateEntityApi(currentEntity.value.id, patch)
      currentEntity.value = updated
      // Update in list if present
      const idx = entities.value.findIndex((e) => e.id === updated.id)
      if (idx !== -1) {
        entities.value[idx] = {
          ...entities.value[idx],
          canonical_name: updated.canonical_name,
          entity_type: updated.entity_type,
          aliases: updated.aliases,
        }
      }
      return updated
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to update entity'
      throw e
    }
  }

  async function removeEntity(id: number): Promise<void> {
    error.value = null
    try {
      await deleteEntityApi(id)
      entities.value = entities.value.filter((e) => e.id !== id)
      quarantinedEntities.value = quarantinedEntities.value.filter(
        (e) => e.id !== id,
      )
      total.value = Math.max(0, total.value - 1)
      if (currentEntity.value?.id === id) {
        currentEntity.value = null
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete entity'
      throw e
    }
  }

  async function mergeEntities(
    survivorId: number,
    absorbedIds: number[],
  ): Promise<EntityMergeResponse> {
    error.value = null
    try {
      const result = await mergeEntitiesApi({
        survivor_id: survivorId,
        absorbed_ids: absorbedIds,
      })
      // Remove absorbed entities from list
      const absorbedSet = new Set(absorbedIds)
      entities.value = entities.value.filter((e) => !absorbedSet.has(e.id))
      total.value = Math.max(0, total.value - absorbedIds.length)
      // Update survivor in list if present
      if (result.survivor) {
        const idx = entities.value.findIndex((e) => e.id === survivorId)
        if (idx !== -1) {
          entities.value[idx] = {
            ...entities.value[idx],
            canonical_name: result.survivor.canonical_name,
            aliases: result.survivor.aliases,
          }
        }
      }
      return result
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to merge entities'
      throw e
    }
  }

  // --- Merge candidates ---

  const mergeCandidates = ref<MergeCandidate[]>([])
  const mergeCandidatesTotal = ref(0)
  const mergeCandidatesLoading = ref(false)

  async function loadMergeCandidates() {
    mergeCandidatesLoading.value = true
    try {
      const resp = await fetchMergeCandidates('pending')
      mergeCandidates.value = resp.items
      mergeCandidatesTotal.value = resp.total
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Failed to load merge candidates'
    } finally {
      mergeCandidatesLoading.value = false
    }
  }

  async function dismissMergeCandidate(candidateId: number): Promise<void> {
    await resolveMergeCandidate(candidateId, 'dismissed')
    mergeCandidates.value = mergeCandidates.value.filter(
      (c) => c.id !== candidateId,
    )
    mergeCandidatesTotal.value = Math.max(0, mergeCandidatesTotal.value - 1)
  }

  async function acceptMergeCandidate(candidateId: number): Promise<void> {
    await resolveMergeCandidate(candidateId, 'accepted')
    mergeCandidates.value = mergeCandidates.value.filter(
      (c) => c.id !== candidateId,
    )
    mergeCandidatesTotal.value = Math.max(0, mergeCandidatesTotal.value - 1)
  }

  // --- Quarantine ---
  //
  // Quarantined entities are kept in their own list — the regular
  // /api/entities endpoint hides them. We load on demand from the
  // EntityListView's "Quarantined" tab and from the badge that
  // surfaces the count.
  const quarantinedEntities = ref<EntitySummary[]>([])
  const quarantinedLoading = ref(false)

  async function loadQuarantined() {
    quarantinedLoading.value = true
    error.value = null
    try {
      const resp = await fetchQuarantinedEntities()
      quarantinedEntities.value = resp.items
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Failed to load quarantined entities'
    } finally {
      quarantinedLoading.value = false
    }
  }

  async function releaseEntityQuarantine(id: number): Promise<void> {
    error.value = null
    try {
      await releaseQuarantineApi(id)
      // Drop from the quarantined list immediately so the UI updates.
      quarantinedEntities.value = quarantinedEntities.value.filter(
        (e) => e.id !== id,
      )
      // Mirror the change on the detail entity if it's the one
      // currently open. Server emits these fields; we make it
      // explicit so the banner disappears without a refetch.
      if (currentEntity.value?.id === id) {
        currentEntity.value = {
          ...currentEntity.value,
          is_quarantined: false,
          quarantine_reason: '',
          quarantined_at: '',
        }
      }
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Failed to release quarantine'
      throw e
    }
  }

  return {
    entities,
    currentEntity,
    mentions,
    outgoing,
    incoming,
    total,
    loading,
    detailLoading,
    error,
    currentParams,
    totalPages,
    currentPage,
    hasEntities,
    loadEntities,
    loadEntity,
    clearCurrent,
    updateCurrentEntity,
    removeEntity,
    mergeEntities,
    mergeCandidates,
    mergeCandidatesTotal,
    mergeCandidatesLoading,
    loadMergeCandidates,
    dismissMergeCandidate,
    acceptMergeCandidate,
    quarantinedEntities,
    quarantinedLoading,
    loadQuarantined,
    releaseEntityQuarantine,
  }
})
