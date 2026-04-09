<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import type { DataTablePageEvent } from 'primevue/datatable'
import { useEntriesStore } from '@/stores/entries'

const router = useRouter()
const store = useEntriesStore()

const rows = ref(20)
const first = ref(0)

onMounted(() => {
  store.loadEntries({ limit: rows.value, offset: 0 })
})

function onPage(event: DataTablePageEvent) {
  first.value = event.first
  rows.value = event.rows
  store.loadEntries({ limit: event.rows, offset: event.first })
}

function onSort() {
  // Re-fetch with current pagination (server doesn't support sort yet, but we handle the event)
  store.loadEntries({ limit: rows.value, offset: first.value })
}

function onRowClick(event: { data: { id: number } }) {
  router.push({ name: 'entry-detail', params: { id: event.data.id } })
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="entry-list">
    <div class="header">
      <h2>Journal Entries</h2>
      <span v-if="store.total > 0" class="entry-count">
        {{ store.total }} entries
      </span>
    </div>

    <div v-if="store.error" class="error-message">
      {{ store.error }}
    </div>

    <DataTable
      :value="store.entries"
      :loading="store.loading"
      :lazy="true"
      :paginator="true"
      :rows="rows"
      :total-records="store.total"
      :first="first"
      :rows-per-page-options="[10, 20, 50]"
      data-key="id"
      striped-rows
      hoverable-rows
      class="entries-table"
      @page="onPage"
      @sort="onSort"
      @row-click="onRowClick"
    >
      <template #empty>
        <div class="empty-state">No journal entries found.</div>
      </template>

      <Column
        field="entry_date"
        header="Date"
        sortable
        style="min-width: 10rem"
      >
        <template #body="{ data }">
          {{ formatDate(data.entry_date) }}
        </template>
      </Column>

      <Column
        field="page_count"
        header="Pages"
        sortable
        style="width: 6rem; text-align: center"
      >
        <template #body="{ data }">
          {{ data.page_count }}
        </template>
      </Column>

      <Column
        field="word_count"
        header="Words"
        sortable
        style="width: 7rem; text-align: right"
      >
        <template #body="{ data }">
          {{ data.word_count.toLocaleString() }}
        </template>
      </Column>

      <Column
        field="chunk_count"
        header="Chunks"
        sortable
        style="width: 7rem; text-align: right"
      >
        <template #body="{ data }">
          {{ data.chunk_count }}
        </template>
      </Column>

      <Column
        field="created_at"
        header="Ingested"
        sortable
        style="min-width: 12rem"
      >
        <template #body="{ data }">
          {{ formatDateTime(data.created_at) }}
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.entry-list {
  max-width: 1000px;
}

.header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.header h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.entry-count {
  color: var(--p-surface-500);
  font-size: 0.875rem;
}

.error-message {
  background: var(--p-red-50);
  color: var(--p-red-700);
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--p-surface-500);
}

:deep(.entries-table) {
  cursor: pointer;
}

:deep(.entries-table .p-datatable-tbody > tr:hover) {
  background: var(--p-primary-50) !important;
}
</style>
