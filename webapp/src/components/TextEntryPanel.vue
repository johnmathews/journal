<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEntriesStore } from '@/stores/entries'
import { useJobsStore } from '@/stores/jobs'

const props = defineProps<{ entryDate: string }>()
const emit = defineEmits<{ created: [entryId: number] }>()

const entriesStore = useEntriesStore()
const jobsStore = useJobsStore()
const text = ref('')

const wordCount = computed(() => {
  const trimmed = text.value.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
})

async function submit() {
  if (!text.value.trim()) return
  const result = await entriesStore.createTextEntry(text.value, props.entryDate)
  // Track background jobs in a group for batched notifications
  const hasJobs = result.mood_job_id || result.entity_extraction_job_id
  if (hasJobs) {
    const groupId = crypto.randomUUID()
    jobsStore.createGroup(groupId, 'Entry created — all processing complete')
    if (result.mood_job_id) {
      jobsStore.trackJob(result.mood_job_id, 'mood_score_entry', {}, groupId)
    }
    if (result.entity_extraction_job_id) {
      jobsStore.trackJob(
        result.entity_extraction_job_id,
        'entity_extraction',
        {},
        groupId,
      )
    }
  }
  emit('created', result.entry.id)
}
</script>

<template>
  <div
    class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
  >
    <textarea
      v-model="text"
      placeholder="Write your journal entry..."
      class="form-input w-full min-h-[300px] font-mono text-sm resize-y dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
    />
    <div class="flex items-center justify-between mt-4">
      <span class="text-sm text-gray-600 dark:text-gray-300">
        {{ wordCount }} {{ wordCount === 1 ? 'word' : 'words' }}
      </span>
      <button
        :disabled="!text.trim() || entriesStore.creating"
        class="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium"
        @click="submit"
      >
        {{ entriesStore.creating ? 'Creating...' : 'Create Entry' }}
      </button>
    </div>
  </div>
</template>
