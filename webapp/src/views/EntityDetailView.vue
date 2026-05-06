<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useEntitiesStore } from '@/stores/entities'
import {
  ENTITY_TYPES,
  type EntityType,
  type EntityMention,
} from '@/types/entity'
import { displayName, displayAliases } from '@/utils/entityName'

const props = defineProps<{
  id: string
}>()

const router = useRouter()
const store = useEntitiesStore()

// Group mentions by entry for a cleaner presentation
interface EntryGroup {
  entry_id: number
  entry_date: string
  mentions: EntityMention[]
}

const entriesByMention = computed<EntryGroup[]>(() => {
  const grouped = new Map<number, EntryGroup>()
  for (const m of store.mentions) {
    if (!grouped.has(m.entry_id)) {
      grouped.set(m.entry_id, {
        entry_id: m.entry_id,
        entry_date: m.entry_date,
        mentions: [],
      })
    }
    grouped.get(m.entry_id)!.mentions.push(m)
  }
  return [...grouped.values()].sort((a, b) =>
    b.entry_date.localeCompare(a.entry_date),
  )
})

onMounted(() => {
  store.loadEntity(Number(props.id))
})

// React to route-param changes without remounting the view.
watch(
  () => props.id,
  (newId) => {
    if (newId) {
      editing.value = false
      store.loadEntity(Number(newId))
    }
  },
)

function goBack() {
  router.push({ name: 'entities' })
}

function typeBadgeClass(type: EntityType): string {
  switch (type) {
    case 'person':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
    case 'place':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300'
    case 'activity':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
    case 'organization':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300'
    case 'topic':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
    case 'other':
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300'
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// --- Editing ---
const editing = ref(false)
const editName = ref('')
const editType = ref<EntityType>('other')
const editDescription = ref('')
const saving = ref(false)

function startEditing() {
  if (!store.currentEntity) return
  editName.value = store.currentEntity.canonical_name
  editType.value = store.currentEntity.entity_type
  editDescription.value = store.currentEntity.description
  editing.value = true
}

function cancelEditing() {
  editing.value = false
}

async function saveEdit() {
  if (!store.currentEntity) return
  saving.value = true
  try {
    const patch: Record<string, string> = {}
    if (editName.value.trim() !== store.currentEntity.canonical_name) {
      patch.canonical_name = editName.value.trim()
    }
    if (editType.value !== store.currentEntity.entity_type) {
      patch.entity_type = editType.value
    }
    if (editDescription.value !== store.currentEntity.description) {
      patch.description = editDescription.value
    }
    if (Object.keys(patch).length > 0) {
      await store.updateCurrentEntity(patch)
    }
    editing.value = false
  } finally {
    saving.value = false
  }
}

// --- Quarantine release ---
//
// The currently-loaded entity carries `is_quarantined` plus the
// reason/timestamp so the banner can render even if the user
// landed on the detail view directly (the active-list endpoint
// does not include quarantined entities). Releasing flips the
// flag locally and goes back to the server.
const releasing = ref(false)

async function releaseFromQuarantine() {
  if (!store.currentEntity) return
  releasing.value = true
  try {
    await store.releaseEntityQuarantine(store.currentEntity.id)
  } finally {
    releasing.value = false
  }
}

function formatDateTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// --- Deleting ---
const deleting = ref(false)

async function confirmDelete() {
  if (!store.currentEntity) return
  const confirmed = window.confirm(
    `Delete entity "${displayName(store.currentEntity.canonical_name)}"? This will remove all its mentions and relationships.`,
  )
  if (!confirmed) return
  deleting.value = true
  try {
    await store.removeEntity(store.currentEntity.id)
    router.push({ name: 'entities' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div data-testid="entity-detail-view">
    <div
      v-if="store.detailLoading && !store.currentEntity"
      class="py-16 text-center text-gray-600 dark:text-gray-300"
      data-testid="loading-state"
    >
      Loading entity…
    </div>

    <div
      v-else-if="store.error && !store.currentEntity"
      class="mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
      data-testid="error-banner"
    >
      {{ store.error }}
    </div>

    <template v-else-if="store.currentEntity">
      <!-- Header -->
      <div class="mb-6">
        <div class="flex items-center gap-3 mb-2">
          <button
            class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
            data-testid="back-button"
            @click="goBack"
          >
            <svg class="w-4 h-4 fill-current mr-1" viewBox="0 0 16 16">
              <path d="M9.4 13.4L4 8l5.4-5.4 1.4 1.4L6.8 8l4 4z" />
            </svg>
            Back
          </button>

          <template v-if="!editing">
            <h1
              class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold"
            >
              {{ displayName(store.currentEntity.canonical_name) }}
            </h1>
            <span
              class="inline-flex text-xs font-medium rounded-full px-2.5 py-0.5 capitalize"
              :class="typeBadgeClass(store.currentEntity.entity_type)"
              data-testid="entity-type-badge"
            >
              {{ store.currentEntity.entity_type }}
            </span>

            <div class="ml-auto flex items-center gap-2">
              <button
                class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                data-testid="edit-button"
                @click="startEditing"
              >
                <svg
                  class="w-4 h-4 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                Edit
              </button>
              <button
                class="btn border-red-300 dark:border-red-700/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                data-testid="delete-button"
                :disabled="deleting"
                @click="confirmDelete"
              >
                <svg
                  class="w-4 h-4 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16"
                  />
                </svg>
                {{ deleting ? 'Deleting…' : 'Delete' }}
              </button>
            </div>
          </template>
        </div>

        <!-- Inline edit form -->
        <div
          v-if="editing"
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs p-4 mb-4"
          data-testid="edit-form"
        >
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label
                class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1"
              >
                Name
              </label>
              <input
                v-model="editName"
                type="text"
                class="form-input w-full text-sm dark:bg-gray-900 dark:border-gray-700"
                data-testid="edit-name-input"
              />
            </div>
            <div>
              <label
                class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1"
              >
                Type
              </label>
              <select
                v-model="editType"
                class="form-select w-full text-sm dark:bg-gray-900 dark:border-gray-700"
                data-testid="edit-type-select"
              >
                <option
                  v-for="t in ENTITY_TYPES"
                  :key="t"
                  :value="t"
                  class="capitalize"
                >
                  {{ t }}
                </option>
              </select>
            </div>
          </div>
          <div class="mb-4">
            <label
              class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1"
            >
              Description
            </label>
            <textarea
              v-model="editDescription"
              rows="2"
              class="form-textarea w-full text-sm dark:bg-gray-900 dark:border-gray-700"
              data-testid="edit-description-input"
            />
          </div>
          <div class="flex items-center gap-2">
            <button
              class="btn bg-violet-500 hover:bg-violet-600 text-white"
              data-testid="save-edit-button"
              :disabled="saving || !editName.trim()"
              @click="saveEdit"
            >
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
            <button
              class="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300"
              data-testid="cancel-edit-button"
              @click="cancelEditing"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Quarantine banner -->
        <div
          v-if="!editing && store.currentEntity.is_quarantined"
          class="mb-4 flex flex-wrap items-start gap-3 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-500/10 px-4 py-3"
          data-testid="quarantine-banner"
        >
          <svg
            class="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
            />
          </svg>
          <div
            class="flex-1 min-w-0 text-sm text-amber-800 dark:text-amber-200"
          >
            <div class="font-semibold">
              Quarantined<template v-if="store.currentEntity.quarantine_reason">
                — {{ store.currentEntity.quarantine_reason }}</template
              >
            </div>
            <div
              v-if="store.currentEntity.quarantined_at"
              class="text-xs mt-0.5 text-amber-700 dark:text-amber-300"
              data-testid="quarantine-banner-when"
            >
              Since {{ formatDateTime(store.currentEntity.quarantined_at) }}
            </div>
          </div>
          <button
            type="button"
            class="btn text-xs py-1 bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="releasing"
            data-testid="release-quarantine-button"
            @click="releaseFromQuarantine"
          >
            {{ releasing ? 'Releasing…' : 'Release from quarantine' }}
          </button>
        </div>

        <template v-if="!editing">
          <div
            v-if="store.currentEntity.aliases.length"
            class="text-sm text-gray-600 dark:text-gray-300"
            data-testid="entity-aliases"
          >
            Aliases: {{ displayAliases(store.currentEntity.aliases) }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-300 mt-1">
            {{ store.mentions.length }} mentions
            <template v-if="store.currentEntity.first_seen">
              · first seen {{ formatDate(store.currentEntity.first_seen) }}
            </template>
          </div>
          <div
            v-if="store.currentEntity.description"
            class="mt-2 text-sm text-gray-600 dark:text-gray-300 italic"
          >
            {{ store.currentEntity.description }}
          </div>
        </template>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Related entities -->
        <section
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs p-4"
          data-testid="related-entities"
        >
          <h2
            class="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-3"
          >
            Related entities
          </h2>
          <div
            v-if="!store.outgoing.length && !store.incoming.length"
            class="text-sm text-gray-600 dark:text-gray-300"
          >
            No relationships recorded yet.
          </div>
          <ul v-else class="space-y-2 text-sm">
            <li
              v-for="rel in store.outgoing"
              :key="`out-${rel.id}`"
              class="flex items-center gap-2"
              data-testid="relationship-outgoing"
            >
              <span class="text-gray-600 dark:text-gray-300">→</span>
              <span class="text-gray-600 dark:text-gray-300 italic">
                {{ rel.predicate }}
              </span>
              <RouterLink
                :to="{
                  name: 'entity-detail',
                  params: { id: rel.object_entity_id },
                }"
                class="text-violet-600 dark:text-violet-400 hover:underline"
              >
                {{ displayName(rel.object_name) }}
              </RouterLink>
              <span
                class="inline-flex text-[10px] font-medium rounded-full px-2 py-0.5 capitalize"
                :class="typeBadgeClass(rel.object_type)"
              >
                {{ rel.object_type }}
              </span>
            </li>
            <li
              v-for="rel in store.incoming"
              :key="`in-${rel.id}`"
              class="flex items-center gap-2"
              data-testid="relationship-incoming"
            >
              <span class="text-gray-600 dark:text-gray-300">←</span>
              <RouterLink
                :to="{
                  name: 'entity-detail',
                  params: { id: rel.subject_entity_id },
                }"
                class="text-violet-600 dark:text-violet-400 hover:underline"
              >
                {{ displayName(rel.subject_name) }}
              </RouterLink>
              <span
                class="inline-flex text-[10px] font-medium rounded-full px-2 py-0.5 capitalize"
                :class="typeBadgeClass(rel.subject_type)"
              >
                {{ rel.subject_type }}
              </span>
              <span class="text-gray-600 dark:text-gray-300 italic">
                {{ rel.predicate }} this
              </span>
            </li>
          </ul>
        </section>

        <!-- Journal entries containing this entity -->
        <section
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs p-4"
          data-testid="mentions-timeline"
        >
          <h2
            class="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-3"
          >
            Journal entries ({{ entriesByMention.length }})
          </h2>
          <div
            v-if="!store.mentions.length"
            class="text-sm text-gray-600 dark:text-gray-300"
          >
            No mentions recorded yet.
          </div>
          <ul v-else class="space-y-4 text-sm">
            <li
              v-for="group in entriesByMention"
              :key="group.entry_id"
              class="pb-4 border-b border-gray-100 dark:border-gray-700/60 last:border-b-0 last:pb-0"
              data-testid="mention-entry-group"
            >
              <RouterLink
                :to="{
                  name: 'entry-detail',
                  params: { id: group.entry_id },
                  query: { highlight: store.currentEntity?.canonical_name },
                }"
                class="flex items-center justify-between mb-2 group"
              >
                <span
                  class="text-violet-600 dark:text-violet-400 group-hover:underline font-medium"
                >
                  {{ formatDate(group.entry_date) }}
                </span>
                <span class="text-[10px] text-gray-600 dark:text-gray-300">
                  {{ group.mentions.length }}
                  {{ group.mentions.length === 1 ? 'mention' : 'mentions' }}
                </span>
              </RouterLink>
              <ul class="space-y-1 ml-3">
                <li
                  v-for="mention in group.mentions"
                  :key="mention.id"
                  class="text-gray-600 dark:text-gray-300 italic text-xs"
                  data-testid="mention-quote"
                >
                  "{{ mention.quote }}"
                </li>
              </ul>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
