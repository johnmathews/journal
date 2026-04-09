<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { useEntriesStore } from '@/stores/entries'
import { useEntryEditor } from '@/composables/useEntryEditor'

const props = defineProps<{
  id: string
}>()

const router = useRouter()
const toast = useToast()
const store = useEntriesStore()
const { editedText, saving, saveError, isDirty, isModified, reset } =
  useEntryEditor(() => store.currentEntry)

onMounted(() => {
  store.loadEntry(Number(props.id))
})

async function save() {
  if (!store.currentEntry || !isDirty.value) return
  saving.value = true
  saveError.value = null
  try {
    await store.saveEntryText(store.currentEntry.id, editedText.value)
    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: 'Entry text updated and re-processed.',
      life: 3000,
    })
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save'
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: saveError.value,
      life: 5000,
    })
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push({ name: 'entries' })
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Warn on unsaved changes when navigating away
onBeforeRouteLeave((_to, _from, next) => {
  if (isDirty.value) {
    const answer = window.confirm('You have unsaved changes. Leave anyway?')
    next(answer)
  } else {
    next()
  }
})

// Warn on browser close with unsaved changes
function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (isDirty.value) {
    e.preventDefault()
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <div class="entry-detail">
    <Toast />

    <div v-if="store.loading && !store.currentEntry" class="loading">
      Loading entry...
    </div>

    <div v-else-if="store.error && !store.currentEntry" class="error-message">
      {{ store.error }}
    </div>

    <template v-else-if="store.currentEntry">
      <div class="detail-header">
        <div class="header-left">
          <Button
            icon="pi pi-arrow-left"
            text
            rounded
            severity="secondary"
            @click="goBack"
          />
          <h2>{{ formatDate(store.currentEntry.entry_date) }}</h2>
          <Tag v-if="isModified" value="Modified" severity="warn" />
        </div>
        <div class="header-meta">
          <span>{{ store.currentEntry.source_type.toUpperCase() }}</span>
          <span
            >{{ store.currentEntry.word_count.toLocaleString() }} words</span
          >
          <span>{{ store.currentEntry.chunk_count }} chunks</span>
          <span
            >{{ store.currentEntry.page_count }} page{{
              store.currentEntry.page_count !== 1 ? 's' : ''
            }}</span
          >
        </div>
      </div>

      <div class="editor-toolbar">
        <div class="toolbar-left">
          <span v-if="isDirty" class="unsaved-indicator">Unsaved changes</span>
        </div>
        <div class="toolbar-right">
          <Button
            label="Reset"
            icon="pi pi-undo"
            text
            severity="secondary"
            :disabled="!isDirty"
            @click="reset"
          />
          <Button
            label="Save"
            icon="pi pi-check"
            :disabled="!isDirty"
            :loading="saving"
            @click="save"
          />
        </div>
      </div>

      <Splitter class="editor-splitter">
        <SplitterPanel :size="50" :min-size="30">
          <div class="panel">
            <div class="panel-header">Original OCR</div>
            <Textarea
              :model-value="store.currentEntry.raw_text"
              readonly
              auto-resize
              class="text-area readonly"
            />
          </div>
        </SplitterPanel>
        <SplitterPanel :size="50" :min-size="30">
          <div class="panel">
            <div class="panel-header">Corrected Text</div>
            <Textarea v-model="editedText" auto-resize class="text-area" />
          </div>
        </SplitterPanel>
      </Splitter>
    </template>
  </div>
</template>

<style scoped>
.entry-detail {
  max-width: 1200px;
}

.loading,
.error-message {
  padding: 2rem;
  text-align: center;
}

.error-message {
  background: var(--p-red-50);
  color: var(--p-red-700);
  border-radius: 6px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.header-left h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.header-meta {
  display: flex;
  gap: 1rem;
  color: var(--p-surface-500);
  font-size: 0.875rem;
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  min-height: 2.5rem;
}

.toolbar-right {
  display: flex;
  gap: 0.5rem;
}

.unsaved-indicator {
  color: var(--p-orange-600);
  font-size: 0.875rem;
  font-weight: 500;
}

.editor-splitter {
  border: 1px solid var(--p-surface-200);
  border-radius: 6px;
  min-height: 400px;
}

.panel {
  padding: 1rem;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-header {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-surface-500);
  margin-bottom: 0.75rem;
}

.text-area {
  width: 100%;
  min-height: 300px;
  font-family: 'Georgia', serif;
  font-size: 0.9375rem;
  line-height: 1.7;
}

.text-area.readonly {
  background: var(--p-surface-50);
  color: var(--p-surface-600);
}
</style>
