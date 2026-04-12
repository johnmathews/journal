<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useEntitiesStore } from '@/stores/entities'
import type { EntityType, EntityMention } from '@/types/entity'

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
    if (newId) store.loadEntity(Number(newId))
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
</script>

<template>
  <div data-testid="entity-detail-view">
    <div
      v-if="store.detailLoading && !store.currentEntity"
      class="py-16 text-center text-gray-500 dark:text-gray-400"
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
          <h1
            class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold"
          >
            {{ store.currentEntity.canonical_name }}
          </h1>
          <span
            class="inline-flex text-xs font-medium rounded-full px-2.5 py-0.5 capitalize"
            :class="typeBadgeClass(store.currentEntity.entity_type)"
            data-testid="entity-type-badge"
          >
            {{ store.currentEntity.entity_type }}
          </span>
        </div>
        <div
          v-if="store.currentEntity.aliases.length"
          class="text-sm text-gray-500 dark:text-gray-400"
          data-testid="entity-aliases"
        >
          Aliases: {{ store.currentEntity.aliases.join(', ') }}
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">
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
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Related entities -->
        <section
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs p-4"
          data-testid="related-entities"
        >
          <h2
            class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3"
          >
            Related entities
          </h2>
          <div
            v-if="!store.outgoing.length && !store.incoming.length"
            class="text-sm text-gray-500 dark:text-gray-400"
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
              <span class="text-gray-400 dark:text-gray-500">→</span>
              <span class="text-gray-500 dark:text-gray-400 italic">
                {{ rel.predicate }}
              </span>
              <RouterLink
                :to="{
                  name: 'entity-detail',
                  params: { id: rel.object_entity_id },
                }"
                class="text-violet-600 dark:text-violet-400 hover:underline"
              >
                {{ rel.object_name }}
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
              <span class="text-gray-400 dark:text-gray-500">←</span>
              <RouterLink
                :to="{
                  name: 'entity-detail',
                  params: { id: rel.subject_entity_id },
                }"
                class="text-violet-600 dark:text-violet-400 hover:underline"
              >
                {{ rel.subject_name }}
              </RouterLink>
              <span
                class="inline-flex text-[10px] font-medium rounded-full px-2 py-0.5 capitalize"
                :class="typeBadgeClass(rel.subject_type)"
              >
                {{ rel.subject_type }}
              </span>
              <span class="text-gray-500 dark:text-gray-400 italic">
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
            class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3"
          >
            Journal entries ({{ entriesByMention.length }})
          </h2>
          <div
            v-if="!store.mentions.length"
            class="text-sm text-gray-500 dark:text-gray-400"
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
                <span class="text-[10px] text-gray-400 dark:text-gray-500">
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
