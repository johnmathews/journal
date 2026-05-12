<script setup lang="ts">
import { computed } from 'vue'
import type { Segment } from '@/types/storyline'

/**
 * Renders a storyline panel's `Segment[]` to a flow of text and
 * citation links.
 *
 * Text segments render as plain prose. Citation segments render a
 * footnote-style RouterLink to `/entries/${entry_id}` followed by the
 * italicised cited quote. Quotes arrive sentence-length from the
 * server (Anthropic Citations `source="text"` documents) so they
 * always render inline; no disclosure path.
 */
const props = defineProps<{
  segments: Segment[]
}>()

interface NumberedText {
  kind: 'text'
  text: string
  idx: number
}

interface NumberedCitation {
  kind: 'citation'
  entry_id: number
  quote: string
  idx: number
  citationNumber: number
}

type NumberedSegment = NumberedText | NumberedCitation

// Number each citation so the visible link label is "[1]", "[2]", etc.
// Per-panel numbering — curation and narrative panels each restart
// from 1, which is fine because each renders its own component instance.
const numberedSegments = computed<NumberedSegment[]>(() => {
  let citationCount = 0
  return props.segments.map((seg, i): NumberedSegment => {
    if (seg.kind === 'citation') {
      citationCount += 1
      return {
        kind: 'citation',
        entry_id: seg.entry_id,
        quote: seg.quote,
        idx: i,
        citationNumber: citationCount,
      }
    }
    return { kind: 'text', text: seg.text, idx: i }
  })
})
</script>

<template>
  <div class="storyline-segments" data-testid="storyline-segments">
    <template v-for="seg in numberedSegments" :key="seg.idx">
      <span
        v-if="seg.kind === 'text'"
        class="text-gray-800 dark:text-gray-200"
        data-testid="segment-text"
        >{{ seg.text }}</span
      >
      <template v-else>
        <RouterLink
          :to="`/entries/${seg.entry_id}`"
          class="inline-citation"
          :data-testid="`segment-citation-${seg.entry_id}`"
          :title="`Source entry #${seg.entry_id}`"
          >[{{ seg.citationNumber }}]</RouterLink
        >
        <span
          v-if="seg.quote.length > 0"
          class="ml-1 text-sm italic text-gray-600 dark:text-gray-400"
          data-testid="segment-citation-quote-inline"
          >&ldquo;{{ seg.quote }}&rdquo;</span
        >
      </template>
    </template>
  </div>
</template>

<style scoped>
/*
  Comfortable serif typography for the narrative + curation panels.
  Matches the .reading-surface style used in EntryDetailView so single-
  entry reading and cross-entry storyline reading feel like the same
  surface.
*/
.storyline-segments {
  font-family: ui-serif, Georgia, Cambria, 'Times New Roman', serif;
  font-size: 1.0625rem;
  line-height: 1.8;
  letter-spacing: normal;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.inline-citation {
  display: inline-block;
  color: rgb(124 58 237); /* violet-600 */
  font-weight: 500;
  font-size: 0.875rem;
  vertical-align: super;
  padding: 0 0.125rem;
  text-decoration: none;
}
.inline-citation:hover {
  text-decoration: underline;
}
:global(.dark) .inline-citation {
  color: rgb(167 139 250); /* violet-400 */
}
</style>
