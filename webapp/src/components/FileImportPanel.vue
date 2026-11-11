<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEntriesStore } from '@/stores/entries'

const props = defineProps<{ entryDate: string }>()
const emit = defineEmits<{ created: [entryId: number] }>()

const entriesStore = useEntriesStore()
const selectedFile = ref<File | null>(null)
const preview = ref('')

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  selectedFile.value = file
  const reader = new FileReader()
  reader.onload = () => {
    preview.value = (reader.result as string).slice(0, 5000)
  }
  reader.readAsText(file)
}

function clearFile() {
  selectedFile.value = null
  preview.value = ''
}

const fileType = computed(() => {
  if (!selectedFile.value) return ''
  return selectedFile.value.name.endsWith('.md') ? 'Markdown' : 'Plain Text'
})

const fileSize = computed(() => {
  if (!selectedFile.value) return ''
  const bytes = selectedFile.value.size
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
})

async function submit() {
  if (!selectedFile.value) return
  const result = await entriesStore.importFile(
    selectedFile.value,
    props.entryDate,
  )
  emit('created', result.entry.id)
}
</script>

<template>
  <div
    class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
  >
    <div v-if="!selectedFile">
      <label
        class="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-violet-400 dark:hover:border-violet-500 transition-colors"
      >
        <svg
          class="w-8 h-8 text-gray-400 mb-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          Drop a <strong>.md</strong> or <strong>.txt</strong> file here, or
          click to browse
        </p>
        <input
          type="file"
          accept=".md,.txt,text/markdown,text/plain"
          class="hidden"
          @change="handleFileSelect"
        />
      </label>
    </div>

    <div v-else>
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center space-x-3">
          <span
            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300"
          >
            {{ fileType }}
          </span>
          <span class="text-sm text-gray-700 dark:text-gray-300 font-medium">{{
            selectedFile.name
          }}</span>
          <span class="text-sm text-gray-600 dark:text-gray-300">{{
            fileSize
          }}</span>
        </div>
        <button
          class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          @click="clearFile"
        >
          Change file
        </button>
      </div>

      <pre
        class="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm font-mono text-gray-700 dark:text-gray-300 max-h-[300px] overflow-auto whitespace-pre-wrap"
        >{{ preview }}</pre
      >

      <div class="flex justify-end mt-4">
        <button
          :disabled="entriesStore.creating"
          class="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium"
          @click="submit"
        >
          {{ entriesStore.creating ? 'Importing...' : 'Import File' }}
        </button>
      </div>
    </div>
  </div>
</template>
