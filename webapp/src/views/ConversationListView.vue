<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useConversationsStore } from '@/stores/conversations'

const store = useConversationsStore()

onMounted(() => store.loadList())

function relativeFromNow(iso: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const diffSec = Math.round((Date.now() - t) / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  const diffMo = Math.round(diffDay / 30)
  if (diffMo < 12) return `${diffMo} month${diffMo === 1 ? '' : 's'} ago`
  const diffYr = Math.round(diffMo / 12)
  return `${diffYr} year${diffYr === 1 ? '' : 's'} ago`
}

async function onDelete(id: number) {
  if (!window.confirm('Delete this conversation?')) return
  await store.remove(id)
}
</script>

<template>
  <div data-testid="conversation-list-view">
    <div class="mb-6 flex items-center justify-between">
      <h1
        class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold"
      >
        Conversations
      </h1>
    </div>

    <div
      v-if="store.listLoading && store.summaries.length === 0"
      class="py-16 text-center text-gray-600 dark:text-gray-300"
    >
      Loading conversations…
    </div>

    <div
      v-else-if="store.error"
      class="mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-lg px-4 py-3 text-sm"
      data-testid="error-banner"
    >
      {{ store.error }}
    </div>

    <p
      v-else-if="!store.listLoading && store.summaries.length === 0"
      class="py-16 text-center text-gray-600 dark:text-gray-300"
    >
      No conversations yet. Start one from a Search answer.
    </p>

    <div
      v-else
      class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl shadow-xs overflow-hidden"
    >
      <ul class="divide-y divide-gray-100 dark:divide-gray-700/60">
        <li
          v-for="c in store.summaries"
          :key="c.id"
          class="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30"
          data-testid="conversation-row"
        >
          <RouterLink :to="`/conversations/${c.id}`" class="min-w-0 flex-1">
            <span
              class="block truncate text-sm font-medium text-gray-900 dark:text-white"
            >
              {{ c.title }}
            </span>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {{ relativeFromNow(c.updated_at) }} · {{ c.message_count }}
              {{ c.message_count === 1 ? 'message' : 'messages' }}
            </span>
          </RouterLink>
          <button
            type="button"
            class="ml-4 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 shrink-0"
            data-testid="delete-conversation"
            @click="onDelete(c.id)"
          >
            Delete
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
