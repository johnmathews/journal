<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import type { Segment } from '@/types/storyline'

/**
 * Renders a storyline's narrative panel as prose with footnote-style
 * citations. Body contains text spans and `<sup>[N]</sup>` markers;
 * a "Sources" section beneath lists each unique entry_id once, with
 * the cited quote, an entry link, and a backref that scrolls to the
 * first marker in the body.
 *
 * Numbering is supplied by a shared `registry: Map<entry_id, number>`
 * built by `useCitationRegistry`. The component never re-numbers
 * locally — it trusts whatever the registry says.
 *
 * The body is grouped into paragraphs at `\n\n` boundaries inside
 * text segments. When a paragraph's first citation has an
 * `entry_date` that jumps more than `DATE_EYEBROW_GAP_DAYS` past the
 * last eyebrow we rendered, we surface a small absolute-date eyebrow
 * above that paragraph so the reader keeps a sense of when events are
 * happening. The first paragraph that carries a citation always gets
 * an eyebrow as an opening anchor.
 */
const props = defineProps<{
  segments: Segment[]
  registry: Map<number, number>
}>()

const DATE_EYEBROW_GAP_DAYS = 7

interface BodyText {
  kind: 'text'
  text: string
  key: string
}
interface BodyMarker {
  kind: 'marker'
  entryId: number
  number: number | null
  instance: number
  entryDate: string | null
  key: string
}
type BodyPart = BodyText | BodyMarker

interface Paragraph {
  parts: BodyPart[]
  eyebrowDate: string | null
}

interface Footnote {
  number: number
  entryId: number
  quote: string
}

/** Flat parts list — kept for compatibility with the marker/footnote
 *  scroll logic which queries `data-marker` selectors. Paragraphs
 *  drive rendering; this just records every part with a stable key. */
const bodyParts = computed<BodyPart[]>(() => {
  const parts: BodyPart[] = []
  const instanceCount = new Map<number, number>()
  props.segments.forEach((seg, i) => {
    if (seg.kind === 'text') {
      parts.push({ kind: 'text', text: seg.text, key: `t-${i}` })
      return
    }
    const n = props.registry.get(seg.entry_id) ?? null
    const bucket = n ?? -1
    const instance = instanceCount.get(bucket) ?? 0
    instanceCount.set(bucket, instance + 1)
    parts.push({
      kind: 'marker',
      entryId: seg.entry_id,
      number: n,
      instance,
      entryDate: seg.entry_date ?? null,
      key: `m-${i}`,
    })
  })
  return parts
})

/** Group body parts into paragraphs at `\n\n` boundaries. A text
 *  part containing `\n\n` is split: the segment before stays in the
 *  current paragraph, the segment after opens a new one. Empty
 *  paragraphs are dropped. */
const paragraphs = computed<Paragraph[]>(() => {
  const out: Paragraph[] = []
  let current: BodyPart[] = []
  let textCounter = 0

  const flush = (): void => {
    const hasContent = current.some(
      (p) => p.kind === 'marker' || (p.kind === 'text' && p.text.trim() !== ''),
    )
    if (hasContent) out.push({ parts: current, eyebrowDate: null })
    current = []
  }

  for (const part of bodyParts.value) {
    if (part.kind === 'marker') {
      current.push(part)
      continue
    }
    const chunks = part.text.split(/\n{2,}/)
    chunks.forEach((chunk, idx) => {
      if (chunk !== '') {
        current.push({
          kind: 'text',
          text: chunk,
          key: `${part.key}-c${textCounter++}`,
        })
      }
      if (idx < chunks.length - 1) flush()
    })
  }
  flush()

  // Decide which paragraphs get an absolute-date eyebrow. The first
  // citation-bearing paragraph always does (anchor). Subsequent ones
  // get one when their first citation's date jumps past the
  // threshold.
  let lastShownTs: number | null = null
  for (const para of out) {
    const firstDated = para.parts.find(
      (p): p is BodyMarker => p.kind === 'marker' && p.entryDate !== null,
    )
    if (!firstDated?.entryDate) continue
    const ts = Date.parse(firstDated.entryDate)
    if (Number.isNaN(ts)) continue
    if (lastShownTs === null) {
      para.eyebrowDate = firstDated.entryDate
      lastShownTs = ts
      continue
    }
    const gapDays = (ts - lastShownTs) / (1000 * 60 * 60 * 24)
    if (gapDays >= DATE_EYEBROW_GAP_DAYS) {
      para.eyebrowDate = firstDated.entryDate
      lastShownTs = ts
    }
  }
  return out
})

const footnotes = computed<Footnote[]>(() => {
  const seen = new Map<number, Footnote>()
  for (const seg of props.segments) {
    if (seg.kind !== 'citation') continue
    const n = props.registry.get(seg.entry_id)
    if (n === undefined) continue
    if (seen.has(n)) continue
    seen.set(n, { number: n, entryId: seg.entry_id, quote: seg.quote })
  }
  return Array.from(seen.values()).sort((a, b) => a.number - b.number)
})

function formatEyebrowDate(iso: string): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return iso
  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Scroll queries are scoped to this component's root so the selectors
// stay correct if a future page mounts more than one StorylineNarrative.
const rootRef = useTemplateRef<HTMLElement>('rootRef')

function scrollToFootnote(n: number | null): void {
  if (n === null) return
  const el = rootRef.value?.querySelector(`[data-fn="${n}"]`)
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function scrollToBodyMarker(n: number): void {
  const el = rootRef.value?.querySelector(`[data-marker="${n}-0"]`)
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}
</script>

<template>
  <div
    ref="rootRef"
    class="storyline-narrative"
    data-testid="storyline-narrative"
  >
    <div class="narrative-body" data-testid="narrative-body">
      <template v-for="(para, paraIdx) in paragraphs" :key="`p-${paraIdx}`">
        <div
          v-if="para.eyebrowDate"
          class="narrative-date-eyebrow"
          :data-testid="`narrative-date-eyebrow-${paraIdx}`"
        >
          {{ formatEyebrowDate(para.eyebrowDate) }}
        </div>
        <p class="narrative-paragraph">
          <template v-for="part in para.parts" :key="part.key">
            <span
              v-if="part.kind === 'text'"
              class="text-gray-800 dark:text-gray-200"
              >{{ part.text }}</span
            >
            <sup v-else>
              <a
                href="#"
                class="footnote-marker"
                :data-marker="
                  part.number !== null
                    ? `${part.number}-${part.instance}`
                    : null
                "
                :data-testid="
                  part.number !== null
                    ? `narrative-body-marker-${part.number}-${part.instance}`
                    : `narrative-body-marker-unknown-${part.entryId}-${part.instance}`
                "
                :title="`Source entry #${part.entryId}`"
                @click.prevent="scrollToFootnote(part.number)"
                >[{{ part.number ?? '?' }}]</a
              >
            </sup>
          </template>
        </p>
      </template>
    </div>

    <div
      v-if="footnotes.length > 0"
      class="narrative-footnotes"
      data-testid="narrative-footnotes"
    >
      <div class="footnotes-eyebrow">Sources</div>
      <ol class="footnotes-list">
        <li
          v-for="fn in footnotes"
          :key="fn.number"
          :data-fn="fn.number"
          :data-testid="`narrative-footnote-${fn.number}`"
          class="footnote-row"
        >
          <span class="footnote-number">[{{ fn.number }}]</span>
          <span v-if="fn.quote.length > 0" class="footnote-quote"
            >&ldquo;{{ fn.quote }}&rdquo;</span
          >
          <RouterLink
            :to="`/entries/${fn.entryId}`"
            class="footnote-entry-link"
            :data-testid="`narrative-footnote-link-${fn.number}`"
            :title="`Source entry #${fn.entryId}`"
          >
            entry #{{ fn.entryId }}
          </RouterLink>
          <button
            type="button"
            class="footnote-backref"
            :data-testid="`narrative-footnote-backref-${fn.number}`"
            :aria-label="`Back to citation [${fn.number}] in body`"
            title="Back to citation in body"
            @click="scrollToBodyMarker(fn.number)"
          >
            ↩
          </button>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.storyline-narrative {
  font-family: ui-serif, Georgia, Cambria, 'Times New Roman', serif;
}

.narrative-body {
  font-size: 1.0625rem;
  line-height: 1.8;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.narrative-paragraph {
  margin: 0 0 1rem 0;
  white-space: pre-wrap;
}
.narrative-paragraph:last-child {
  margin-bottom: 0;
}

.narrative-date-eyebrow {
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgb(107 114 128); /* gray-500 */
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid rgb(229 231 235); /* gray-200 */
}
:global(.dark) .narrative-date-eyebrow {
  color: rgb(156 163 175); /* gray-400 */
  border-bottom-color: rgba(75, 85, 99, 0.4);
}

.footnote-marker {
  display: inline-block;
  color: rgb(124 58 237); /* violet-600 */
  font-weight: 500;
  font-size: 0.875rem;
  vertical-align: super;
  padding: 0 0.125rem;
  text-decoration: none;
}
.footnote-marker:hover {
  text-decoration: underline;
}
:global(.dark) .footnote-marker {
  color: rgb(167 139 250); /* violet-400 */
}

.narrative-footnotes {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgb(229 231 235); /* gray-200 */
}
:global(.dark) .narrative-footnotes {
  border-top-color: rgba(75, 85, 99, 0.5);
}

.footnotes-eyebrow {
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(75 85 99);
  margin-bottom: 0.75rem;
}
:global(.dark) .footnotes-eyebrow {
  color: rgb(209 213 219);
}

.footnotes-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.footnote-row {
  font-size: 0.9rem;
  line-height: 1.55;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
  color: rgb(75 85 99);
}
:global(.dark) .footnote-row {
  color: rgb(209 213 219);
}

.footnote-number {
  font-weight: 600;
  color: rgb(124 58 237);
  font-variant-numeric: tabular-nums;
}
:global(.dark) .footnote-number {
  color: rgb(167 139 250);
}

.footnote-quote {
  font-style: italic;
  flex: 1 1 16rem;
  min-width: 0;
}

.footnote-entry-link {
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  font-size: 0.8rem;
  color: rgb(124 58 237);
  text-decoration: none;
}
.footnote-entry-link:hover {
  text-decoration: underline;
}
:global(.dark) .footnote-entry-link {
  color: rgb(167 139 250);
}

.footnote-backref {
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  font-size: 0.95rem;
  background: transparent;
  border: none;
  cursor: pointer;
  color: rgb(124 58 237);
  padding: 0;
}
.footnote-backref:hover {
  color: rgb(91 33 182);
}
:global(.dark) .footnote-backref {
  color: rgb(167 139 250);
}
:global(.dark) .footnote-backref:hover {
  color: rgb(196 181 253);
}
</style>
