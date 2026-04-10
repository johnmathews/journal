import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  Entity,
  EntityListParams,
  EntityMention,
  EntityRelationship,
  EntitySummary,
} from '@/types/entity'
import {
  fetchEntities,
  fetchEntity,
  fetchEntityMentions,
  fetchEntityRelationships,
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
  }
})
