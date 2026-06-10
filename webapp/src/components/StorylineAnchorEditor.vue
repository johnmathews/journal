<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fetchEntities } from '@/api/entities'
import { useStorylinesStore } from '@/stores/storylines'
import type { EntitySummary } from '@/types/entity'
import { MAX_ANCHORS, type StorylineAnchor } from '@/types/storyline'

/**
 * Inline anchor editor for an existing storyline (W30).
 *
 * Design decisions (recorded here, in docs/storylines.md, and in the
 * journal entry 260610-anchor-edit-ux.md):
 *
 * 1. **Inline panel, not a modal.** Editing anchors is contextual to
 *    the detail view — keeping the current panels visible while
 *    editing lets the user see exactly what a regeneration would
 *    replace. The multi-select picker (debounced search + removable
 *    chips + toggle-on-click results) reuses the pattern shipped in
 *    StorylineCreateModal for multi-entity storylines.
 *
 * 2. **Diff-vs-current display.** The chips row always shows the
 *    *proposed* set; a separate diff summary ("Adding" / "Removing"
 *    chips) appears as soon as the selection diverges from the saved
 *    set, and Save stays disabled until there is a non-empty diff.
 *    Showing both proposed set and delta beats showing only one: the
 *    set is what gets saved, the delta is what the user needs to
 *    sanity-check.
 *
 * 3. **Confirm-before-stale-panels, no auto-kick.** The server's
 *    `PUT /api/storylines/{id}/anchors` only replaces the anchor rows
 *    — it does NOT touch the stored panels or queue a regeneration
 *    (verified in server `api/ingestion.py::set_storyline_anchors`).
 *    So saved panels go stale the moment anchors change. Clicking
 *    Save therefore opens a confirm step that says so and offers
 *    "Save & regenerate" (PUT, then the parent chains the existing
 *    regenerate flow with job tracking) or "Save only" (panels stay
 *    stale until a manual Regenerate). We deliberately do not
 *    auto-kick regeneration on every save: it costs LLM tokens and a
 *    user reshaping a storyline may want to batch several edits
 *    before paying for one regeneration.
 */

interface PickedAnchor {
  id: number
  canonical_name: string
  entity_type?: string
}

const props = defineProps<{
  storylineId: number
  anchors: StorylineAnchor[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', payload: { regenerate: boolean }): void
}>()

const store = useStorylinesStore()
// Clear any error left over from a previous editing session — the
// component mounts fresh each time the panel opens (v-if).
store.anchorsError = null

// Proposed anchor set, seeded from the saved anchors. Pick order is
// kept for display; the server normalises to ascending id order and
// the store refreshes state from its response.
const picked = ref<PickedAnchor[]>(props.anchors.map((a) => ({ ...a })))

// --- Entity search (same debounced pattern as StorylineCreateModal) ---
const searchQuery = ref('')
const searchResults = ref<EntitySummary[]>([])
const searching = ref(false)
const searchError = ref<string | null>(null)
let searchDebounce: ReturnType<typeof setTimeout> | null = null

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
  return picked.value.some((e) => e.id === entity.id)
}

function togglePick(entity: EntitySummary): void {
  if (isPicked(entity)) {
    picked.value = picked.value.filter((e) => e.id !== entity.id)
  } else {
    if (picked.value.length >= MAX_ANCHORS) return
    picked.value = [
      ...picked.value,
      {
        id: entity.id,
        canonical_name: entity.canonical_name,
        entity_type: entity.entity_type,
      },
    ]
  }
}

function removePicked(entityId: number): void {
  picked.value = picked.value.filter((e) => e.id !== entityId)
}

// --- Diff against the saved anchor set ---
const originalIds = computed(() => new Set(props.anchors.map((a) => a.id)))
const pickedIds = computed(() => new Set(picked.value.map((p) => p.id)))
const added = computed(() =>
  picked.value.filter((p) => !originalIds.value.has(p.id)),
)
const removed = computed(() =>
  props.anchors.filter((a) => !pickedIds.value.has(a.id)),
)
const hasChanges = computed(
  () => added.value.length > 0 || removed.value.length > 0,
)

const atCap = computed<boolean>(() => picked.value.length >= MAX_ANCHORS)

const canSave = computed<boolean>(
  () =>
    hasChanges.value &&
    picked.value.length >= 1 &&
    picked.value.length <= MAX_ANCHORS &&
    !store.savingAnchors,
)

// --- Save with confirm step ---
const confirming = ref(false)

function openConfirm(): void {
  if (!canSave.value) return
  confirming.value = true
}

function backToEdit(): void {
  confirming.value = false
}

async function doSave(regenerate: boolean): Promise<void> {
  try {
    await store.setAnchors(
      props.storylineId,
      picked.value.map((p) => p.id),
    )
    emit('saved', { regenerate })
  } catch {
    // store.anchorsError renders inline; drop back to the edit step so
    // the user can adjust the selection and retry.
    confirming.value = false
  }
}
</script>

<template>
  <div
    class="bg-white dark:bg-gray-800 border border-violet-200 dark:border-violet-800/60 rounded-xl shadow-xs p-4 md:p-5 space-y-3"
    data-testid="anchor-editor"
  >
    <div class="flex items-center justify-between gap-3">
      <h2
        class="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300"
      >
        Edit anchors
      </h2>
    </div>

    <!-- Save / cap error -->
    <div
      v-if="store.anchorsError"
      class="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm"
      data-testid="anchor-editor-error"
    >
      {{ store.anchorsError }}
    </div>

    <!-- Edit step -->
    <template v-if="!confirming">
      <!-- Proposed anchor chips -->
      <div
        v-if="picked.length > 0"
        class="flex flex-wrap gap-2"
        data-testid="anchor-editor-picked"
      >
        <span
          v-for="entity in picked"
          :key="entity.id"
          class="inline-flex items-center gap-1.5 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700/40 rounded-full px-2.5 py-1 text-xs"
          data-testid="anchor-editor-chip"
        >
          <span class="font-medium text-gray-800 dark:text-gray-100">
            {{ entity.canonical_name }}
          </span>
          <span
            v-if="entity.entity_type"
            class="text-gray-500 dark:text-gray-400 capitalize text-[10px]"
          >
            {{ entity.entity_type }}
          </span>
          <button
            type="button"
            class="text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-200 leading-none"
            :aria-label="`Remove anchor ${entity.canonical_name}`"
            :data-testid="`anchor-editor-remove-${entity.id}`"
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
            : 'Search entities to add…'
        "
        :disabled="atCap"
        class="form-input w-full text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 rounded-md disabled:opacity-60"
        data-testid="anchor-editor-search"
      />

      <div
        v-if="searchQuery.trim() || searching || searchError"
        class="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700/60 rounded-md bg-white dark:bg-gray-800"
        data-testid="anchor-editor-results"
      >
        <div
          v-if="searching"
          class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400"
          data-testid="anchor-editor-searching"
        >
          Searching…
        </div>
        <div
          v-else-if="searchError"
          class="px-3 py-2 text-xs text-red-600 dark:text-red-400"
          data-testid="anchor-editor-search-error"
        >
          {{ searchError }}
        </div>
        <div
          v-else-if="searchResults.length === 0"
          class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400"
          data-testid="anchor-editor-empty"
        >
          No entities match.
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
            data-testid="anchor-editor-result"
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

      <!-- Diff summary vs the saved anchor set -->
      <div
        v-if="hasChanges"
        class="space-y-1.5 text-sm"
        data-testid="anchor-editor-diff"
      >
        <div
          v-if="added.length > 0"
          class="flex flex-wrap items-center gap-1.5"
          data-testid="anchor-diff-added"
        >
          <span
            class="text-xs uppercase font-semibold text-green-700 dark:text-green-400"
          >
            Adding:
          </span>
          <span
            v-for="entity in added"
            :key="entity.id"
            class="inline-flex items-center bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-700/40 rounded-full px-2.5 py-0.5 text-xs text-green-800 dark:text-green-300"
          >
            + {{ entity.canonical_name }}
          </span>
        </div>
        <div
          v-if="removed.length > 0"
          class="flex flex-wrap items-center gap-1.5"
          data-testid="anchor-diff-removed"
        >
          <span
            class="text-xs uppercase font-semibold text-red-700 dark:text-red-400"
          >
            Removing:
          </span>
          <span
            v-for="entity in removed"
            :key="entity.id"
            class="inline-flex items-center bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-700/40 rounded-full px-2.5 py-0.5 text-xs text-red-800 dark:text-red-300"
          >
            − {{ entity.canonical_name }}
          </span>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          class="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300"
          data-testid="anchor-editor-cancel"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn-sm bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!canSave"
          data-testid="anchor-editor-save"
          @click="openConfirm"
        >
          Save changes
        </button>
      </div>
    </template>

    <!-- Confirm step: warn that saved panels go stale -->
    <div v-else class="space-y-3" data-testid="anchor-editor-confirm">
      <p class="text-sm text-gray-700 dark:text-gray-300">
        Changing anchors makes the previously generated panels stale — they were
        built for the old anchor set and won't reflect this change until the
        storyline is regenerated.
      </p>

      <div class="space-y-1.5 text-sm">
        <div
          v-if="added.length > 0"
          class="flex flex-wrap items-center gap-1.5"
        >
          <span
            class="text-xs uppercase font-semibold text-green-700 dark:text-green-400"
          >
            Adding:
          </span>
          <span class="text-gray-800 dark:text-gray-100">
            {{ added.map((e) => e.canonical_name).join(', ') }}
          </span>
        </div>
        <div
          v-if="removed.length > 0"
          class="flex flex-wrap items-center gap-1.5"
        >
          <span
            class="text-xs uppercase font-semibold text-red-700 dark:text-red-400"
          >
            Removing:
          </span>
          <span class="text-gray-800 dark:text-gray-100">
            {{ removed.map((e) => e.canonical_name).join(', ') }}
          </span>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button
          type="button"
          class="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300"
          :disabled="store.savingAnchors"
          data-testid="anchor-confirm-back"
          @click="backToEdit"
        >
          Back
        </button>
        <button
          type="button"
          class="btn-sm bg-white dark:bg-gray-800 border-violet-200 dark:border-violet-800/60 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="store.savingAnchors"
          data-testid="anchor-confirm-save-only"
          @click="doSave(false)"
        >
          Save only
        </button>
        <button
          type="button"
          class="btn-sm bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="store.savingAnchors"
          data-testid="anchor-confirm-save-regenerate"
          @click="doSave(true)"
        >
          {{ store.savingAnchors ? 'Saving…' : 'Save & regenerate' }}
        </button>
      </div>
    </div>
  </div>
</template>
