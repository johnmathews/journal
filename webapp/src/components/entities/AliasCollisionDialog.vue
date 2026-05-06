<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseModal from '@/components/BaseModal.vue'
import { useEntitiesStore } from '@/stores/entities'
import type { AliasCollisionResponse, EntityType } from '@/types/entity'
import { displayName } from '@/utils/entityName'

// When the user attempts to add an alias to entity A, but the alias
// is already attached to entity B, the server returns 409 with the
// existing entity's id/name/type. This dialog offers to merge A into
// B (B is the survivor — keeping the alias attached as the user
// originally intended). On confirm, we call the existing
// /api/entities/merge endpoint and route the user to the survivor.

const props = defineProps<{
  modelValue: boolean
  collision: AliasCollisionResponse | null
  // The entity the user was trying to add an alias to.
  currentEntityId: number
  currentEntityName: string
  currentEntityType: EntityType
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'merged', survivorId: number): void
}>()

const router = useRouter()
const store = useEntitiesStore()
const merging = ref(false)
const error = ref<string | null>(null)

function close(): void {
  if (merging.value) return
  emit('update:modelValue', false)
  error.value = null
}

async function confirmMerge(): Promise<void> {
  if (!props.collision) return
  merging.value = true
  error.value = null
  try {
    // Existing entity wins — its alias was already there, so keep it
    // as the survivor and absorb the entity the user was editing.
    await store.mergeEntities(props.collision.existing_entity_id, [
      props.currentEntityId,
    ])
    emit('merged', props.collision.existing_entity_id)
    emit('update:modelValue', false)
    // Route to the survivor so the user lands on the unified entity.
    router.push({
      name: 'entity-detail',
      params: { id: props.collision.existing_entity_id },
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to merge entities'
  } finally {
    merging.value = false
  }
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    title="Alias already in use"
    size="md"
    @update:model-value="close"
  >
    <div data-testid="alias-collision-dialog">
      <p v-if="collision" class="mb-3">
        The alias
        <code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">{{
          collision.alias
        }}</code>
        already maps to
        <strong>{{ displayName(collision.existing_canonical_name) }}</strong>
        ({{ collision.existing_entity_type }}).
      </p>
      <p class="mb-3">
        Do you want to merge
        <strong>{{ displayName(currentEntityName) }}</strong>
        into it? The combined entity will keep the name
        <strong v-if="collision">{{
          displayName(collision.existing_canonical_name)
        }}</strong
        >, and all mentions and relationships from
        <strong>{{ displayName(currentEntityName) }}</strong> will move across.
      </p>
      <div
        v-if="error"
        class="mb-2 p-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded text-sm"
        data-testid="alias-collision-error"
      >
        {{ error }}
      </div>
    </div>
    <template #footer>
      <button
        type="button"
        class="btn-sm border-gray-200 dark:border-gray-700/60 hover:bg-gray-100 dark:hover:bg-gray-700/40 text-gray-700 dark:text-gray-300"
        :disabled="merging"
        data-testid="alias-collision-cancel"
        @click="close"
      >
        Cancel
      </button>
      <button
        type="button"
        class="btn-sm bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50"
        :disabled="merging"
        data-testid="alias-collision-confirm"
        @click="confirmMerge"
      >
        {{ merging ? 'Merging…' : 'Merge entities' }}
      </button>
    </template>
  </BaseModal>
</template>
