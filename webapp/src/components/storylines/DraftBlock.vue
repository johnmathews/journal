<script setup lang="ts">
import { computed } from 'vue'
import type { ChapterDetail, ChapterMeta } from '@/types/storyline'
import StorylineNarrative from '@/components/StorylineNarrative.vue'
import { buildCitationRegistry } from '@/composables/useCitationRegistry'

/**
 * The storyline's single draft chapter, rendered last and visually
 * subdued: the arc is still forming, so the prose is explicitly
 * provisional. Shows an entry count, the draft narrative when one has
 * been generated, and a Refresh button that re-narrates the draft
 * from its current entries.
 */
const props = defineProps<{
  meta: ChapterMeta
  chapter: ChapterDetail | null
  updating: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const registry = computed(() =>
  buildCitationRegistry(props.chapter ? [props.chapter.segments] : []),
)
</script>

<template>
  <section
    class="draft-block border border-dashed border-gray-300 dark:border-gray-600/60 rounded-xl p-4 md:p-6 bg-gray-50/60 dark:bg-gray-800/40"
    data-testid="draft-block"
  >
    <div class="flex items-center justify-between gap-3 mb-3">
      <h2
        class="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
        data-testid="draft-heading"
      >
        In progress — {{ meta.entry_count }}
        entr{{ meta.entry_count === 1 ? 'y' : 'ies' }}
      </h2>
      <button
        type="button"
        class="btn-sm bg-white dark:bg-gray-800 border-violet-200 dark:border-violet-800/60 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="updating"
        data-testid="draft-refresh-button"
        @click="emit('refresh')"
      >
        <span
          v-if="updating"
          class="inline-block animate-pulse"
          data-testid="draft-updating"
          >Updating…</span
        >
        <span v-else>Refresh</span>
      </button>
    </div>

    <div v-if="chapter && chapter.segments.length > 0" class="opacity-80">
      <StorylineNarrative :segments="chapter.segments" :registry="registry" />
    </div>
    <div
      v-else
      class="py-6 text-center text-sm text-gray-500 dark:text-gray-400"
      data-testid="draft-empty"
    >
      Nothing here yet — the draft grows as new entries mention this
      storyline's anchors.
    </div>
  </section>
</template>
