<script setup lang="ts">
import { ref } from 'vue'
import type { StorylineChapterSummary } from '@/types/storyline'

defineProps<{ chapter: StorylineChapterSummary; hasNext: boolean }>()
const emit = defineEmits<{ edit: []; split: []; merge: []; delete: [] }>()
const open = ref(false)
function pick(action: 'edit' | 'split' | 'merge' | 'delete') {
  open.value = false
  // TypeScript's overload resolution for defineEmits requires a literal — cast needed
  ;(emit as (e: typeof action) => void)(action)
}
</script>

<template>
  <div class="relative inline-block">
    <button
      data-test="menu-toggle"
      class="px-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      @click.stop="open = !open"
    >
      ⋯
    </button>
    <ul
      v-if="open"
      class="absolute right-0 z-10 mt-1 w-40 rounded border border-slate-200 bg-white shadow dark:border-slate-700 dark:bg-slate-800"
    >
      <li>
        <button
          data-test="action-edit"
          class="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
          @click="pick('edit')"
        >
          Edit dates
        </button>
      </li>
      <li>
        <button
          data-test="action-split"
          class="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
          @click="pick('split')"
        >
          Split here
        </button>
      </li>
      <li v-if="hasNext">
        <button
          data-test="action-merge"
          class="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
          @click="pick('merge')"
        >
          Merge with next
        </button>
      </li>
      <li>
        <button
          data-test="action-delete"
          class="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700"
          @click="pick('delete')"
        >
          Delete
        </button>
      </li>
    </ul>
  </div>
</template>
