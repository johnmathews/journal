<script setup lang="ts">
import { computed } from 'vue'
import type { Segment } from '@/types/storyline'

/**
 * Renders a storyline's curation panel as a list of rows. Each row pairs
 * a date label (taken from the text segment immediately preceding the
 * citation) with the citation's quote and a link to the source entry.
 *
 * Numbering is supplied by the shared `useCitationRegistry` map. Curation
 * rows may show non-sequential `[N]` because the narrative drives
 * numbering — that's expected, and the row order (chronological) is
 * what carries the reading flow.
 */
const props = defineProps<{
  segments: Segment[]
  registry: Map<number, number>
}>()

interface CurationRow {
  rowIdx: number
  dateLabel: string
  entryId: number
  quote: string
  number: number | null
}

const rows = computed<CurationRow[]>(() => {
  const out: CurationRow[] = []
  let pendingLabel = ''
  let rowIdx = 0
  for (const seg of props.segments) {
    if (seg.kind === 'text') {
      pendingLabel = seg.text
      continue
    }
    const dateLabel = pendingLabel.replace(/[:\s]+$/, '').trim()
    const number = props.registry.get(seg.entry_id) ?? null
    out.push({
      rowIdx,
      dateLabel,
      entryId: seg.entry_id,
      quote: seg.quote,
      number,
    })
    rowIdx += 1
    pendingLabel = ''
  }
  return out
})

function rowKeySuffix(row: CurationRow): string {
  return row.number !== null ? String(row.number) : `unknown-${row.entryId}`
}
</script>

<template>
  <div class="storyline-curation" data-testid="storyline-curation">
    <ul v-if="rows.length > 0" class="curation-list">
      <li
        v-for="row in rows"
        :key="row.rowIdx"
        class="curation-row"
        :data-testid="`curation-row-${rowKeySuffix(row)}`"
      >
        <span
          class="curation-date"
          :data-testid="`curation-row-date-${rowKeySuffix(row)}`"
          >{{ row.dateLabel }}</span
        >
        <span
          v-if="row.quote.length > 0"
          class="curation-quote"
          :data-testid="`curation-row-quote-${rowKeySuffix(row)}`"
          >&ldquo;{{ row.quote }}&rdquo;</span
        >
        <RouterLink
          :to="`/entries/${row.entryId}`"
          class="curation-entry-link"
          :data-testid="`curation-row-link-${rowKeySuffix(row)}`"
          :title="`Open entry #${row.entryId}`"
        >
          <span class="curation-number">[{{ row.number ?? '?' }}]</span>
          <svg class="curation-chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M6.6 13.4L12 8 6.6 2.6 5.2 4l4 4-4 4z"
              fill="currentColor"
            />
          </svg>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.storyline-curation {
  font-family: ui-serif, Georgia, Cambria, 'Times New Roman', serif;
  font-size: 1rem;
  line-height: 1.5;
}

.curation-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
}

.curation-row {
  display: grid;
  grid-template-columns: minmax(7.5rem, max-content) 1fr auto;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.625rem 0;
  border-bottom: 1px solid rgb(243 244 246); /* gray-100 */
}
.curation-row:last-child {
  border-bottom: none;
}
.curation-row:hover {
  background: rgba(124, 58, 237, 0.04);
}
:global(.dark) .curation-row {
  border-bottom-color: rgba(75, 85, 99, 0.35);
}
:global(.dark) .curation-row:hover {
  background: rgba(167, 139, 250, 0.06);
}

.curation-date {
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  font-size: 0.8rem;
  font-weight: 500;
  color: rgb(107 114 128); /* gray-500 */
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
:global(.dark) .curation-date {
  color: rgb(156 163 175); /* gray-400 */
}

.curation-quote {
  font-style: italic;
  color: rgb(55 65 81); /* gray-700 */
  min-width: 0;
}
:global(.dark) .curation-quote {
  color: rgb(229 231 235); /* gray-200 */
}

.curation-entry-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: rgb(124 58 237); /* violet-600 */
  text-decoration: none;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  font-size: 0.85rem;
  font-weight: 500;
}
.curation-entry-link:hover {
  color: rgb(91 33 182); /* violet-800 */
}
:global(.dark) .curation-entry-link {
  color: rgb(167 139 250); /* violet-400 */
}
:global(.dark) .curation-entry-link:hover {
  color: rgb(196 181 253); /* violet-300 */
}

.curation-number {
  font-variant-numeric: tabular-nums;
}

.curation-chevron {
  width: 0.75rem;
  height: 0.75rem;
  flex-shrink: 0;
}

/* Below 640px the date column wraps onto its own row above the quote so
   nothing gets cramped. */
@media (max-width: 40rem) {
  .curation-row {
    grid-template-columns: 1fr auto;
  }
  .curation-date {
    grid-column: 1 / -1;
    text-align: left;
  }
}
</style>
