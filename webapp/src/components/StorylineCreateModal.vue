<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseModal from './BaseModal.vue'
import { fetchEntities } from '@/api/entities'
import { useStorylinesStore } from '@/stores/storylines'
import { useJobsStore } from '@/stores/jobs'
import { useToast } from '@/composables/useToast'
import type { EntitySummary } from '@/types/entity'
import type { CreateStorylineResponse } from '@/types/storyline'

/**
 * Modal for creating a new storyline. The user picks one entity from a
 * debounced search list, optionally overrides the auto-filled name,
 * and submits. The server (after W7) responds with the created
 * storyline plus a `generation_job_id` so the webapp can hand the
 * panel-generation job off to the global jobs store and surface
 * progress through the notification bell.
 *
 * Single-select for now (the picker is built for future multi-select —
 * see plan D1). The component does not own the modal-open state; the
 * parent passes `modelValue` and listens for `update:modelValue`.
 */

const props = defineProps<{ modelValue: boolean }>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'created', payload: CreateStorylineResponse): void
}>()

const store = useStorylinesStore()
const jobsStore = useJobsStore()
const toast = useToast()

// --- Entity search state ---
const searchQuery = ref('')
const searchResults = ref<EntitySummary[]>([])
const searching = ref(false)
const searchError = ref<string | null>(null)
let searchDebounce: ReturnType<typeof setTimeout> | null = null

// Pinned to the local component: not stored in pinia. The picked
// entity drives both the auto-name behaviour and the submit guard.
const pickedEntity = ref<EntitySummary | null>(null)

// --- Storyline form fields ---
const name = ref('')
// True once the user has manually edited the name. From then on,
// re-picking an entity does NOT clobber the user's override.
const nameDirty = ref(false)
const description = ref('')
const startDate = ref('')
const endDate = ref('')

const submitting = ref(false)

function resetState(): void {
  searchQuery.value = ''
  searchResults.value = []
  searching.value = false
  searchError.value = null
  pickedEntity.value = null
  name.value = ''
  nameDirty.value = false
  description.value = ''
  startDate.value = ''
  endDate.value = ''
  submitting.value = false
  store.createError = null
}

// Reset whenever the modal transitions from closed → open so a fresh
// open never inherits stale picker / form state from a previous run.
watch(
  () => props.modelValue,
  (open, prev) => {
    if (open && !prev) {
      resetState()
    }
  },
)

// Debounced entity search. We forward `search` to /api/entities,
// matching the EntityListView pattern (250ms). An empty query
// clears the result list.
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

function pickEntity(entity: EntitySummary): void {
  pickedEntity.value = entity
  // Auto-fill the name from the canonical name unless the user has
  // already typed something custom.
  if (!nameDirty.value) {
    name.value = entity.canonical_name
  }
  // Collapse the search list once the user has picked — the picked
  // chip above the search box becomes the visible affordance.
  searchResults.value = []
  searchQuery.value = ''
}

function clearPicked(): void {
  pickedEntity.value = null
  // Picking a different entity should let auto-fill take over again,
  // unless the user already manually edited the name.
}

function onNameInput(event: Event): void {
  const target = event.target as HTMLInputElement
  name.value = target.value
  nameDirty.value = true
}

const canSubmit = computed<boolean>(() => {
  return (
    !submitting.value &&
    pickedEntity.value !== null &&
    name.value.trim().length > 0
  )
})

async function onSubmit(): Promise<void> {
  if (!canSubmit.value || !pickedEntity.value) return
  submitting.value = true
  try {
    const payload = {
      entity_id: pickedEntity.value.id,
      name: name.value.trim(),
      ...(description.value.trim()
        ? { description: description.value.trim() }
        : {}),
      ...(startDate.value ? { start_date: startDate.value } : {}),
      ...(endDate.value ? { end_date: endDate.value } : {}),
    }
    const resp = await store.createStoryline(payload)
    if (resp.generation_job_id) {
      jobsStore.trackJob(resp.generation_job_id, 'storyline_generation', {
        storyline_id: resp.id,
      })
    }
    toast.success('Storyline created. Generating panels…')
    emit('created', resp)
    emit('update:modelValue', false)
  } catch {
    // store.createError is already populated. Leave modal open so the
    // user can read the inline banner and retry.
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

      <!-- Entity picker -->
      <fieldset class="space-y-2">
        <legend
          class="text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
        >
          Entity
        </legend>

        <div
          v-if="pickedEntity"
          class="flex items-center justify-between gap-3 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700/40 rounded-md px-3 py-2"
          data-testid="storyline-picked-entity"
        >
          <div class="flex-1 min-w-0">
            <span class="font-medium text-gray-800 dark:text-gray-100">
              {{ pickedEntity.canonical_name }}
            </span>
            <span
              class="ml-2 text-xs text-gray-600 dark:text-gray-300 capitalize"
            >
              {{ pickedEntity.entity_type }}
            </span>
          </div>
          <button
            type="button"
            class="text-xs text-violet-600 dark:text-violet-400 hover:underline"
            data-testid="storyline-clear-entity"
            @click="clearPicked"
          >
            change
          </button>
        </div>

        <input
          v-else
          v-model="searchQuery"
          type="search"
          placeholder="Search entities…"
          class="form-input w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
          data-testid="storyline-entity-search"
        />

        <div
          v-if="!pickedEntity"
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
            Type to search for an entity to anchor the storyline on.
          </div>
          <ul v-else class="divide-y divide-gray-100 dark:divide-gray-700/60">
            <li
              v-for="entity in searchResults"
              :key="entity.id"
              class="px-3 py-2 text-sm hover:bg-violet-50 dark:hover:bg-violet-500/10 cursor-pointer flex items-center justify-between gap-2"
              data-testid="storyline-entity-result"
              @click="pickEntity(entity)"
            >
              <span class="font-medium text-gray-800 dark:text-gray-100">
                {{ entity.canonical_name }}
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

      <!-- Date range -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label
            for="storyline-create-start"
            class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
          >
            Start date
          </label>
          <input
            id="storyline-create-start"
            v-model="startDate"
            type="date"
            class="form-input w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
            data-testid="storyline-create-start-date"
          />
        </div>
        <div>
          <label
            for="storyline-create-end"
            class="block text-xs uppercase text-gray-600 dark:text-gray-300 font-semibold mb-1"
          >
            End date
          </label>
          <input
            id="storyline-create-end"
            v-model="endDate"
            type="date"
            class="form-input w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md"
            data-testid="storyline-create-end-date"
          />
        </div>
      </div>
      <p class="text-xs text-gray-600 dark:text-gray-300">
        Both dates are optional — leave blank to cover every entry that mentions
        the entity.
      </p>
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
