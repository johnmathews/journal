<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ title: string; message: string; showAllowGap: boolean }>()
const emit = defineEmits<{
  confirm: [{ allow_gap: boolean }]
  cancel: []
}>()

const allowGap = ref(false)
</script>

<template>
  <div class="fixed inset-0 z-20 flex items-center justify-center bg-black/40">
    <div class="w-80 rounded-lg bg-white p-4 dark:bg-slate-800">
      <h3 class="mb-2 font-semibold">{{ title }}</h3>
      <p class="text-sm text-slate-600 dark:text-slate-300">{{ message }}</p>
      <label v-if="showAllowGap" class="mt-3 flex items-center gap-2 text-sm">
        <input v-model="allowGap" type="checkbox" data-test="allow-gap" />
        Leave a gap instead of merging into the neighbour
      </label>
      <div class="mt-4 flex justify-end gap-2">
        <button
          data-test="cancel"
          class="px-3 py-1 text-sm"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          data-test="confirm"
          class="rounded bg-red-600 px-3 py-1 text-sm text-white"
          @click="emit('confirm', { allow_gap: allowGap })"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
</template>
