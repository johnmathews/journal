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
 *
 * `dateMode` toggles the left column between the relative LLM-authored
 * label ("Nearly a month later") and the source entry's absolute ISO
 * date ("2026-03-14"). Absolute mode falls back to the relative label
 * for any citation whose `entry_date` is missing (older stored panels).
 */
const props = withDefaults(
  defineProps<{
    segments: Segment[]
    registry: Map<number, number>
    dateMode?: 'relative' | 'absolute'
  }>(),
  { dateMode: 'relative' },
)

interface CurationRow {
  rowIdx: number
  relativeLabel: string
  absoluteLabel: string | null
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
    const relativeLabel = pendingLabel.replace(/[:\s]+$/, '').trim()
    const number = props.registry.get(seg.entry_id) ?? null
    out.push({
      rowIdx,
      relativeLabel,
      absoluteLabel: seg.entry_date ?? null,
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

function dateLabelFor(row: CurationRow): string {
  if (props.dateMode === 'absolute' && row.absoluteLabel) {
    return row.absoluteLabel
  }
  return row.relativeLabel
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
          class="curation-date text-gray-500 dark:text-gray-300"
          :data-testid="`curation-row-date-${rowKeySuffix(row)}`"
          >{{ dateLabelFor(row) }}</span
        >
        <span
          v-if="row.quote.length > 0"
          class="curation-quote text-gray-700 dark:text-gray-100"
          :data-testid="`curation-row-quote-${rowKeySuffix(row)}`"
          >&ldquo;{{ row.quote }}&rdquo;</span
        >
        <RouterLink
          :to="`/entries/${row.entryId}`"
          class="curation-entry-link text-gray-400 dark:text-gray-500"
          :data-testid="`curation-row-link-${rowKeySuffix(row)}`"
          :title="`Open entry #${row.entryId}`"
        >
          <span class="curation-number">[{{ row.number ?? '?' }}]</span>
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

/* Wider middle column for the quote — date column tightened from
   minmax(7.5rem, max-content) to a fixed max, and the trailing link
   column lost its chevron so it occupies less width too. */
.curation-row {
  display: grid;
  grid-template-columns: minmax(6rem, 7.5rem) 1fr auto;
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
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.curation-quote {
  font-style: italic;
  min-width: 0;
}

/* Muted, smaller link that still navigates to the source entry. The
   narrative panel's footnote list is the primary place to follow a
   citation back to its entry; this is a backup affordance. */
.curation-entry-link {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  font-size: 0.7rem;
  font-weight: 500;
}
.curation-entry-link:hover {
  color: rgb(124 58 237); /* violet-600 */
}
:global(.dark) .curation-entry-link:hover {
  color: rgb(167 139 250); /* violet-400 */
}

.curation-number {
  font-variant-numeric: tabular-nums;
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
