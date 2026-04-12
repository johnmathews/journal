<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useEntriesStore } from '@/stores/entries'
import TextEntryPanel from '@/components/TextEntryPanel.vue'
import FileImportPanel from '@/components/FileImportPanel.vue'
import ImageUploadPanel from '@/components/ImageUploadPanel.vue'

const router = useRouter()
const entriesStore = useEntriesStore()

const activeTab = ref<'write' | 'import' | 'upload'>('write')
const entryDate = ref(new Date().toISOString().slice(0, 10))

function handleCreated(entryId: number) {
  router.push({ name: 'entry-detail', params: { id: String(entryId) } })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function handleJobSubmitted(_jobId: string) {
  // Will be handled by ImageUploadPanel's progress flow
}

const tabs = [
  { key: 'upload' as const, label: 'Upload Images' },
  { key: 'import' as const, label: 'Import File' },
  { key: 'write' as const, label: 'Write Entry' },
]

function switchTab(key: typeof activeTab.value) {
  activeTab.value = key
  entriesStore.createError = null
}
</script>

<template>
  <div>
    <div class="sm:flex sm:justify-between sm:items-center mb-8">
      <h1
        class="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold"
      >
        New Journal Entry
      </h1>
    </div>

    <!-- Date picker -->
    <div class="mb-6">
      <label
        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
      >
        Entry Date
      </label>
      <input
        v-model="entryDate"
        type="date"
        class="form-input w-48 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
      />
    </div>

    <!-- Tab bar -->
    <div class="mb-6">
      <div
        class="flex space-x-1 rounded-lg bg-gray-100 dark:bg-gray-700/60 p-1 w-fit"
      >
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="[
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            activeTab === tab.key
              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200',
          ]"
          @click="switchTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Error display -->
    <div
      v-if="entriesStore.createError"
      class="mb-4 flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300"
    >
      <p class="flex-1">{{ entriesStore.createError }}</p>
      <button
        class="shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-200"
        @click="entriesStore.createError = null"
      >
        &times;
      </button>
    </div>

    <!-- Tab panels -->
    <TextEntryPanel
      v-if="activeTab === 'write'"
      :entry-date="entryDate"
      @created="handleCreated"
    />
    <FileImportPanel
      v-if="activeTab === 'import'"
      :entry-date="entryDate"
      @created="handleCreated"
    />
    <ImageUploadPanel
      v-if="activeTab === 'upload'"
      :entry-date="entryDate"
      @created="handleCreated"
      @submitted="handleJobSubmitted"
    />
  </div>
</template>
