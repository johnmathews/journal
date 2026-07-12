<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseModal from './BaseModal.vue'
import { fetchEntities } from '@/api/entities'
import { useStorylinesStore } from '@/stores/storylines'
import { useToast } from '@/composables/useToast'
import type { EntitySummary } from '@/types/entity'
import { MAX_ANCHORS, type CreateStorylineResponse } from '@/types/storyline'

/**
 * Modal for creating a new storyline. The user picks 1..MAX_ANCHORS
 * entities from a debounced search list, optionally overrides the
 * auto-filled name, and submits. The server responds with the created
 * storyline plus a `bootstrap_job_id`; the store hands the
 * panel-generation job off to the global jobs store and surface
 * progress through the notification bell.
 *
 * Multi-select: clicking an entity in the search results toggles its
 * membership in the picked set. Already-picked entities show as
 * removable chips above the search box. Auto-name reflects all picked
 * entities (e.g. "Atlas", "Atlas and Vienna", "Atlas, Sara and
 * Vienna") until the user overrides it. The component does not own
 * the modal-open state.
 */

const props = defineProps<{ modelValue: boolean }>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'created', payload: CreateStorylineResponse): void
}>()

const store = useStorylinesStore()
const toast = useToast()

// --- Entity search state ---
const searchQuery = ref('')
const searchResults = ref<EntitySummary[]>([])
const searching = ref(false)
const searchError = ref<string | null>(null)
let searchDebounce: ReturnType<typeof setTimeout> | null = null

// Picked anchor set (1..MAX_ANCHORS). Local component state — not in
// pinia. Order = pick order, which drives the auto-name reading.
const pickedEntities = ref<EntitySummary[]>([])

// --- Storyline form fields ---
const name = ref('')
// True once the user has manually edited the name. From then on,
// changing the anchor set does NOT clobber the user's override.
const nameDirty = ref(false)
const description = ref('')

const submitting = ref(false)

function autoName(entities: EntitySummary[]): string {
  const names = entities.map((e) => e.canonical_name)
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  const head = names.slice(0, -1).join(', ')
  return `${head}, and ${names[names.length - 1]}`
}

function resetState(): void {
  searchQuery.value = ''
  searchResults.value = []
  searching.value = false
  searchError.value = null
  pickedEntities.value = []
  name.value = ''
  nameDirty.value = false
  description.value = ''
  submitting.value = false
  store.createError = null
}

watch(
  () => props.modelValue,
  (open, prev) => {
    if (open && !prev) {
      resetState()
    }
  },
)

watch(searchQuery, (q) => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    void runSearch(q)
  }, 250)
})

async function runSearch(query: string): Promise<void> {
  const trimmed = query.trim()
  if (!trimmed) {
    searchResults.value = []
    return
  }
  searching.value = true
  searchError.value = null
  try {
    const resp = await fetchEntities({ search: trimmed, limit: 20 })
    searchResults.value = resp.items
  } catch (e) {
    searchError.value = e instanceof Error ? e.message : 'Search failed'
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

function isPicked(entity: EntitySummary): boolean {
  return pickedEntities.value.some((e) => e.id === entity.id)
}

function togglePick(entity: EntitySummary): void {
  if (isPicked(entity)) {
    pickedEntities.value = pickedEntities.value.filter(
      (e) => e.id !== entity.id,
    )
  } else {
    if (pickedEntities.value.length >= MAX_ANCHORS) return
    pickedEntities.value = [...pickedEntities.value, entity]
  }
  if (!nameDirty.value) {
    name.value = autoName(pickedEntities.value)
  }
}

function removePicked(entityId: number): void {
  pickedEntities.value = pickedEntities.value.filter((e) => e.id !== entityId)
  if (!nameDirty.value) {
    name.value = autoName(pickedEntities.value)
  }
}

function onNameInput(event: Event): void {
  const target = event.target as HTMLInputElement
  name.value = target.value
  nameDirty.value = true
}

const atCap = computed<boolean>(
  () => pickedEntities.value.length >= MAX_ANCHORS,
)

const canSubmit = computed<boolean>(() => {
  return (
    !submitting.value &&
    pickedEntities.value.length >= 1 &&
    pickedEntities.value.length <= MAX_ANCHORS &&
    name.value.trim().length > 0
  )
})

async function onSubmit(): Promise<void> {
  if (!canSubmit.value || pickedEntities.value.length === 0) return
  submitting.value = true
  try {
    const payload = {
      entity_ids: pickedEntities.value.map((e) => e.id),
      name: name.value.trim(),
      ...(description.value.trim()
        ? { description: description.value.trim() }
        : {}),
    }
    const resp = await store.createStoryline(payload)
    toast.success(
      resp.bootstrap_job_id
        ? 'Storyline created. Writing its chapters…'
        : 'Storyline created.',
    )
    emit('created', resp)
    emit('update:modelValue', false)
  } catch {
    // store.createError is already populated. Leave modal open.
  } finally {
    submitting.value = false
  }
}

function onCancel(): void {
  emit('update:modelValue', false)
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    title="New storyline"
    size="lg"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <div class="space-y-4" data-testid="storyline-create-modal">
      <!-- Inline error from the store (create failure) -->
      <div
        v-if="store.createError"
        class="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
        data-testid="create-error-banner"
      >
        {{ store.createError }}
      </div>

      <!-- Entity picker (multi-select; 1..15 anchors) -->
      <fieldset class="space-y-2">
        <legend
          class="text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
        >
          Anchor entities
        </legend>

        <!-- Picked anchor chips -->
        <div
          v-if="pickedEntities.length > 0"
          class="flex flex-wrap gap-2"
          data-testid="storyline-picked-entities"
        >
          <span
            v-for="entity in pickedEntities"
            :key="entity.id"
            class="inline-flex items-center gap-1.5 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700/40 rounded-full px-2.5 py-1 text-xs"
            data-testid="storyline-picked-chip"
          >
            <span class="font-medium text-gray-800 dark:text-gray-100">
              {{ entity.canonical_name }}
            </span>
            <span
              class="text-gray-500 dark:text-gray-400 capitalize text-[10px]"
            >
              {{ entity.entity_type }}
            </span>
            <button
              type="button"
              class="text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-200 leading-none"
              :aria-label="`Remove anchor ${entity.canonical_name}`"
              data-testid="storyline-remove-anchor"
              @click="removePicked(entity.id)"
            >
              ×
            </button>
          </span>
        </div>

        <input
          v-model="searchQuery"
          type="search"
          :placeholder="
            atCap
              ? `Cap reached (${MAX_ANCHORS} anchors max)`
              : 'Search entities…'
          "
          :disabled="atCap"
          class="form-input w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md disabled:opacity-60"
          data-testid="storyline-entity-search"
        />

        <div
          class="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700/60 rounded-md bg-white dark:bg-gray-800"
          data-testid="storyline-entity-results"
        >
          <div
            v-if="searching"
            class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400"
            data-testid="storyline-entity-searching"
          >
            Searching…
          </div>
          <div
            v-else-if="searchError"
            class="px-3 py-2 text-xs text-red-600 dark:text-red-400"
            data-testid="storyline-entity-search-error"
          >
            {{ searchError }}
          </div>
          <div
            v-else-if="searchResults.length === 0 && searchQuery.trim()"
            class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400"
            data-testid="storyline-entity-empty"
          >
            No entities match.
          </div>
          <div
            v-else-if="searchResults.length === 0"
            class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400"
          >
            Type to search for entities to anchor the storyline on (1–{{
              MAX_ANCHORS
            }}).
          </div>
          <ul v-else class="divide-y divide-gray-100 dark:divide-gray-700/60">
            <li
              v-for="entity in searchResults"
              :key="entity.id"
              :class="[
                'px-3 py-2 text-sm flex items-center justify-between gap-2 cursor-pointer',
                isPicked(entity)
                  ? 'bg-violet-50 dark:bg-violet-500/10 font-medium'
                  : 'hover:bg-violet-50 dark:hover:bg-violet-500/10',
              ]"
              data-testid="storyline-entity-result"
              @click="togglePick(entity)"
            >
              <span class="flex items-center gap-2">
                <span
                  class="inline-block w-4 text-violet-600 dark:text-violet-400"
                  aria-hidden="true"
                >
                  {{ isPicked(entity) ? '✓' : '' }}
                </span>
                <span class="text-gray-800 dark:text-gray-100">
                  {{ entity.canonical_name }}
                </span>
              </span>
              <span
                class="text-xs text-gray-600 dark:text-gray-300 capitalize shrink-0"
              >
                {{ entity.entity_type }}
              </span>
            </li>
          </ul>
        </div>
      </fieldset>

      <!-- Name -->
      <div>
        <label
          for="storyline-name"
          class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
        >
          Name
        </label>
        <input
          id="storyline-name"
          :value="name"
          type="text"
          placeholder="Storyline name"
          class="form-input w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
          data-testid="storyline-create-name"
          @input="onNameInput"
        />
      </div>

      <!-- Description -->
      <div>
        <label
          for="storyline-description"
          class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
        >
          Description
        </label>
        <textarea
          id="storyline-description"
          v-model="description"
          rows="3"
          placeholder="Optional"
          class="form-input w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
          data-testid="storyline-create-description"
        />
      </div>

    </div>

    <template #footer>
      <button
        type="button"
        class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300"
        data-testid="storyline-create-cancel"
        @click="onCancel"
      >
        Cancel
      </button>
      <button
        type="button"
        class="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!canSubmit"
        data-testid="storyline-create-submit"
        @click="onSubmit"
      >
        {{ submitting ? 'Creating…' : 'Create' }}
      </button>
    </template>
  </BaseModal>
</template>
