<script setup lang="ts">
import type { ChapterMeta } from '@/types/storyline'

/**
 * Slim table of contents for the storyline reader: one row per chapter
 * with title, derived date range, and an unread dot for published
 * chapters not yet read. The draft renders as a subdued "In progress"
 * row. Selecting a row asks the parent to scroll that chapter into
 * view — the TOC owns no state.
 */
defineProps<{
  chapters: ChapterMeta[]
  activeId: number | null
}>()

const emit = defineEmits<{
  (e: 'select', chapterId: number): void
}>()

function dateRange(c: ChapterMeta): string {
  if (!c.first_entry_date) return ''
  if (!c.last_entry_date || c.first_entry_date === c.last_entry_date) {
    return c.first_entry_date
  }
  return `${c.first_entry_date} – ${c.last_entry_date}`
}
</script>

<template>
  <nav class="chapter-toc" data-testid="chapter-toc" aria-label="Chapters">
    <h2
      class="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2"
    >
      Chapters
    </h2>
    <ul class="space-y-0.5">
      <li v-for="c in chapters" :key="c.id">
        <button
          type="button"
          class="w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2"
          :class="
            c.id === activeId
              ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/40'
          "
          :data-testid="`toc-item-${c.id}`"
          :aria-current="c.id === activeId ? 'true' : undefined"
          @click="emit('select', c.id)"
        >
          <span
            v-if="c.state === 'published' && c.read_at === null"
            class="w-2 h-2 rounded-full bg-violet-500 shrink-0"
            data-testid="toc-unread-dot"
            aria-label="Unread"
          />
          <span class="min-w-0 flex-1">
            <span
              class="block truncate"
              :class="
                c.state === 'draft'
                  ? 'italic text-gray-500 dark:text-gray-400'
                  : 'font-medium'
              "
            >
              {{
                c.state === 'draft'
                  ? 'In progress'
                  : c.title || `Chapter ${c.seq}`
              }}
            </span>
            <span
              v-if="dateRange(c)"
              class="block text-xs text-gray-500 dark:text-gray-400 truncate"
            >
              {{ dateRange(c) }}
            </span>
          </span>
        </button>
      </li>
    </ul>
  </nav>
</template>
