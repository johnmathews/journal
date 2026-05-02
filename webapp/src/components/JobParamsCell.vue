<script setup lang="ts">
import { computed } from 'vue'
import type { Job } from '@/types/job'
import JsonPopover from './JsonPopover.vue'

const props = defineProps<{ job: Job }>()

interface Chip {
  key: string
  label: string
  classes: string
}

const chips = computed<Chip[]>(() => {
  const p = props.job.params
  const out: Chip[] = []

  if (p.start_date || p.end_date) {
    const start = p.start_date ? String(p.start_date) : '…'
    const end = p.end_date ? String(p.end_date) : '…'
    out.push({
      key: 'date_range',
      label: `${start} → ${end}`,
      classes:
        'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200',
    })
  }

  if (p.entry_date) {
    out.push({
      key: 'entry_date',
      label: String(p.entry_date),
      classes:
        'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200',
    })
  }

  if (p.mode) {
    const mode = String(p.mode)
    out.push({
      key: 'mode',
      label: mode,
      classes:
        mode === 'force'
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200'
          : 'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200',
    })
  }

  if (p.stale_only) {
    out.push({
      key: 'stale_only',
      label: 'stale only',
      classes:
        'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200',
    })
  }

  if (p.source_type) {
    out.push({
      key: 'source_type',
      label: String(p.source_type),
      classes:
        'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300',
    })
  }

  if (p.notify_strategy) {
    out.push({
      key: 'notify_strategy',
      label: `notify: ${String(p.notify_strategy)}`,
      classes:
        'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    })
  }

  return out
})

/** Show a raw-params popover when there are any params at all — even
 *  the ones we hide from the chip view (entry_id, user_id, parent_job_id)
 *  are useful to the user when debugging a job. */
const hasAnyParams = computed(() => Object.keys(props.job.params).length > 0)
</script>

<template>
  <div
    v-if="chips.length === 0 && !hasAnyParams"
    class="text-gray-400 dark:text-gray-500"
    data-testid="job-params-empty"
  >
    -
  </div>
  <div
    v-else
    class="flex flex-wrap items-center gap-1"
    data-testid="job-params-chips"
  >
    <span
      v-for="chip in chips"
      :key="chip.key"
      class="inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      :class="chip.classes"
      :data-testid="`param-chip-${chip.key}`"
    >
      {{ chip.label }}
    </span>
    <JsonPopover
      v-if="hasAnyParams"
      :content="job.params"
      title="Raw params"
      trigger-label="raw"
      data-testid="job-params-raw-popover"
    />
  </div>
</template>
