<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  title: string
  initialStart?: string
  initialEnd?: string
  showEnd: boolean
  hint?: string
}>()
const emit = defineEmits<{
  submit: [{ start_date?: string; end_date?: string }]
  cancel: []
}>()

const start = ref(props.initialStart ?? '')
const end = ref(props.initialEnd ?? '')

function save() {
  const payload: { start_date?: string; end_date?: string } = {}
  if (start.value) payload.start_date = start.value
  if (props.showEnd && end.value) payload.end_date = end.value
  emit('submit', payload)
}
</script>

<template>
  <div class="fixed inset-0 z-20 flex items-center justify-center bg-black/40">
    <div class="w-80 rounded-lg bg-white p-4 dark:bg-slate-800">
      <h3 class="mb-3 font-semibold">{{ title }}</h3>
      <label class="block text-sm">
        Start
        <input
          v-model="start"
          data-test="start"
          type="date"
          class="mt-1 w-full rounded border px-2 py-1 dark:bg-slate-700"
        />
      </label>
      <label v-if="showEnd" class="mt-2 block text-sm">
        End
        <input
          v-model="end"
          data-test="end"
          type="date"
          class="mt-1 w-full rounded border px-2 py-1 dark:bg-slate-700"
        />
      </label>
      <p
        v-if="hint"
        data-test="chapter-modal-hint"
        class="mt-3 text-xs text-gray-500 dark:text-gray-400"
      >
        {{ hint }}
      </p>
      <div class="mt-4 flex justify-end gap-2">
        <button
          data-test="cancel"
          class="px-3 py-1 text-sm"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          data-test="save"
          class="rounded bg-indigo-600 px-3 py-1 text-sm text-white"
          @click="save"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>
