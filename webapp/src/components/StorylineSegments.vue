<script setup lang="ts">
import { computed } from 'vue'
import type { Segment } from '@/types/storyline'

/**
 * Renders a storyline panel's `Segment[]` to a flow of text and
 * citation links.
 *
 * Text segments render as plain prose. Citation segments render a
 * footnote-style RouterLink to `/entries/${entry_id}` plus an optional
 * quote disclosure.
 *
 * The quote handling has two modes by length:
 * - **Short quote** (≤ inlineQuoteThreshold chars): rendered inline as
 *   italicised text next to the link. This is what the curation panel
 *   gets — entity-mention quotes are the short verbatim excerpts pulled
 *   from `entity_mentions.quote`.
 * - **Long quote** (> threshold): collapsed behind a `<details>`
 *   disclosure showing "source". This is the narrative-panel case,
 *   where the Citations API returns the whole wrapped journal entry
 *   for `source: "content"` documents. The entry_id link is the
 *   actionable part; the bloated quote is a hidden affordance, not
 *   something to render inline by default.
 */
const props = withDefaults(
  defineProps<{
    segments: Segment[]
    inlineQuoteThreshold?: number
  }>(),
  { inlineQuoteThreshold: 200 },
)

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
// Per-panel numbering — the curation and narrative panels each restart
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

function isInlineQuote(quote: string): boolean {
  return quote.length > 0 && quote.length <= props.inlineQuoteThreshold
}

function isCollapsedQuote(quote: string): boolean {
  return quote.length > props.inlineQuoteThreshold
}
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
          v-if="isInlineQuote(seg.quote)"
          class="ml-1 text-sm italic text-gray-600 dark:text-gray-400"
          data-testid="segment-citation-quote-inline"
          >&ldquo;{{ seg.quote }}&rdquo;</span
        >
        <details
          v-else-if="isCollapsedQuote(seg.quote)"
          class="inline ml-1 text-xs text-gray-500 dark:text-gray-400 align-baseline"
          data-testid="segment-citation-quote-collapsed"
        >
          <summary
            class="cursor-pointer hover:text-violet-600 dark:hover:text-violet-400"
          >
            source
          </summary>
          <span
            class="block mt-1 pl-3 py-1 border-l-2 border-gray-300 dark:border-gray-700 italic whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400"
            data-testid="segment-citation-quote-expanded"
            >{{ seg.quote }}</span
          >
        </details>
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
