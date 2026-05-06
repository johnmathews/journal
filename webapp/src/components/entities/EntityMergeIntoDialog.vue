<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BaseModal from '@/components/BaseModal.vue'
import { fetchEntities } from '@/api/entities'
import { useEntitiesStore } from '@/stores/entities'
import type { EntitySummary, EntityType } from '@/types/entity'
import { displayName } from '@/utils/entityName'

// "Merge this entity into another one" — used from the entity detail
// view when the user already knows the target. We restrict the search
// to the same entity_type because cross-type merges have never been
// supported (canonical_name + entity_type is the uniqueness key in
// the store) and would silently fail at the API.

const props = defineProps<{
  modelValue: boolean
  // The entity the user is merging away — will be absorbed into the
  // selected candidate.
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

const search = ref('')
const candidates = ref<EntitySummary[]>([])
const loading = ref(false)
const merging = ref(false)
const error = ref<string | null>(null)
const selectedId = ref<number | null>(null)

async function runSearch(): Promise<void> {
  const q = search.value.trim()
  if (!q) {
    candidates.value = []
    return
  }
  loading.value = true
  error.value = null
  try {
    const resp = await fetchEntities({
      search: q,
      type: props.currentEntityType,
      limit: 10,
    })
    candidates.value = resp.items.filter((e) => e.id !== props.currentEntityId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Search failed'
  } finally {
    loading.value = false
  }
}

// Re-run search on input change with a tiny debounce so we don't
// hammer the API on every keystroke.
let debounceHandle: number | undefined
watch(search, () => {
  if (debounceHandle) window.clearTimeout(debounceHandle)
  debounceHandle = window.setTimeout(() => {
    void runSearch()
  }, 200)
})

function reset(): void {
  search.value = ''
  candidates.value = []
  selectedId.value = null
  error.value = null
}

function close(): void {
  if (merging.value) return
  reset()
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) reset()
  },
)

async function confirmMerge(): Promise<void> {
  if (selectedId.value === null) return
  merging.value = true
  error.value = null
  try {
    await store.mergeEntities(selectedId.value, [props.currentEntityId])
    emit('merged', selectedId.value)
    emit('update:modelValue', false)
    router.push({
      name: 'entity-detail',
      params: { id: selectedId.value },
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Merge failed'
  } finally {
    merging.value = false
  }
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    title="Merge into another entity"
    size="md"
    @update:model-value="close"
  >
    <div data-testid="merge-into-dialog">
      <p class="mb-2">
        Search for the entity you want to merge
        <strong>{{ displayName(currentEntityName) }}</strong> into. The target
        keeps its name; this entity's mentions, relationships, and aliases move
        across.
      </p>
      <input
        v-model="search"
        type="text"
        placeholder="Type to search…"
        class="form-input form-input-sm w-full mb-3"
        :disabled="merging"
        data-testid="merge-into-search"
      />
      <div
        v-if="loading"
        class="text-sm text-gray-500 dark:text-gray-400 italic"
      >
        Searching…
      </div>
      <div
        v-else-if="search.trim() && !candidates.length"
        class="text-sm text-gray-500 dark:text-gray-400 italic"
        data-testid="merge-into-empty"
      >
        No matching {{ currentEntityType }} entities.
      </div>
      <ul v-else class="space-y-1" data-testid="merge-into-candidates">
        <li
          v-for="cand in candidates"
          :key="cand.id"
          class="flex items-center gap-2"
        >
          <input
            :id="`merge-into-${cand.id}`"
            v-model="selectedId"
            type="radio"
            :value="cand.id"
            :disabled="merging"
            :data-testid="`merge-into-radio-${cand.id}`"
          />
          <label :for="`merge-into-${cand.id}`" class="text-sm cursor-pointer">
            {{ displayName(cand.canonical_name) }}
            <span class="text-xs text-gray-500 dark:text-gray-400">
              ({{ cand.mention_count }} mentions)
            </span>
          </label>
        </li>
      </ul>
      <div
        v-if="error"
        class="mt-3 p-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded text-sm"
        data-testid="merge-into-error"
      >
        {{ error }}
      </div>
    </div>
    <template #footer>
      <button
        type="button"
        class="btn-sm border-gray-200 dark:border-gray-700/60 hover:bg-gray-100 dark:hover:bg-gray-700/40 text-gray-700 dark:text-gray-300"
        :disabled="merging"
        data-testid="merge-into-cancel"
        @click="close"
      >
        Cancel
      </button>
      <button
        type="button"
        class="btn-sm bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50"
        :disabled="merging || selectedId === null"
        data-testid="merge-into-confirm"
        @click="confirmMerge"
      >
        {{ merging ? 'Merging…' : 'Merge' }}
      </button>
    </template>
  </BaseModal>
</template>
