<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useConversationsStore } from '@/stores/conversations'

const route = useRoute()
const store = useConversationsStore()
const draft = ref('')

const conversationId = computed(() => Number(route.params.id))

async function load() {
  await store.open(conversationId.value)
}

onMounted(load)
watch(conversationId, load)

async function submit() {
  const text = draft.value.trim()
  if (!text || store.sending) return
  draft.value = ''
  await store.reply(text)
}
</script>

<template>
  <div
    class="max-w-3xl mx-auto px-4 py-6 flex flex-col h-full"
    data-testid="conversation-view"
  >
    <header class="mb-4 flex items-center justify-between gap-4">
      <h1 class="text-lg font-semibold text-gray-900 dark:text-white truncate">
        {{ store.conversation?.title ?? 'Conversation' }}
      </h1>
      <RouterLink
        to="/search"
        class="shrink-0 text-sm text-violet-600 dark:text-violet-300 hover:underline"
      >
        ← Back to Search
      </RouterLink>
    </header>

    <!-- Message thread -->
    <div
      class="flex-1 space-y-3 overflow-y-auto"
      data-testid="conversation-messages"
    >
      <div
        v-for="m in store.messages"
        :key="m.id"
        class="flex"
        :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
          :class="
            m.role === 'user'
              ? 'bg-violet-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
          "
        >
          <p>{{ m.content }}</p>
          <div v-if="m.citations.length" class="mt-2 flex flex-wrap gap-1.5">
            <RouterLink
              v-for="c in m.citations"
              :key="c.entry_id"
              :to="`/entries/${c.entry_id}`"
              class="text-xs px-2 py-0.5 rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/50"
              data-testid="message-citation"
            >
              {{ c.entry_date }}
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Thinking placeholder while sending -->
      <div
        v-if="store.sending"
        class="flex justify-start"
        data-testid="thinking"
      >
        <div
          class="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 italic"
        >
          Thinking…
        </div>
      </div>

      <!-- Error line -->
      <p
        v-if="store.error"
        class="text-sm text-red-600 dark:text-red-400"
        data-testid="conversation-error"
      >
        {{ store.error }}
      </p>
    </div>

    <!-- Sticky input form -->
    <form
      class="mt-4 flex gap-2"
      data-testid="conversation-form"
      @submit.prevent="submit"
    >
      <input
        v-model="draft"
        type="text"
        placeholder="Ask a follow-up…"
        class="flex-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        data-testid="conversation-input"
      />
      <button
        type="submit"
        class="rounded bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="store.sending || !draft.trim()"
      >
        Send
      </button>
    </form>
  </div>
</template>
