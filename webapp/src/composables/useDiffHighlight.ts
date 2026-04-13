import { computed, type Ref } from 'vue'
import DiffMatchPatch, { type Diff } from 'diff-match-patch'
import type { UncertainSpan } from '@/types/entry'

/**
 * Kinds of span the renderer knows how to style.
 *
 * - `equal` — untouched text; no markup. Used so the template's v-html
 *   consumer can still escape safely.
 * - `diff-delete` / `diff-insert` — from comparing original vs corrected.
 * - `uncertain` — a character range the OCR model flagged as uncertain
 *   at ingestion time. Applied only to the Original OCR side (where it
 *   is anchored) when the Review toggle is on.
 * - `diff-delete-uncertain` — composite kind for the overlap case: an
 *   uncertain span that falls inside a diff-delete region. Rendered
 *   with the red-delete background and a yellow ring so the user sees
 *   both signals without one drowning the other.
 */
export type HighlightKind =
  | 'equal'
  | 'diff-delete'
  | 'diff-insert'
  | 'uncertain'
  | 'diff-delete-uncertain'

export interface HighlightSegment {
  kind: HighlightKind
  text: string
}

/**
 * Escape a string for safe insertion into innerHTML. We cannot use
 * v-html with unescaped diff text — it would interpret any `<` the user
 * happens to type as markup.
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const CLASS_FOR_KIND: Record<HighlightKind, string> = {
  equal: '',
  'diff-delete':
    'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200 rounded-[2px]',
  'diff-insert':
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200 rounded-[2px]',
  uncertain:
    'bg-yellow-200 text-yellow-900 dark:bg-yellow-400/40 dark:text-yellow-100 rounded-[2px] underline decoration-dotted decoration-yellow-700 dark:decoration-yellow-300 underline-offset-2',
  // Composite: the red-delete background + a yellow ring. The ring
  // sits outside the rounded corners so it reads as a distinct signal
  // rather than "the red got a bit yellower". Order matters — this
  // class list must not conflict with the diff-delete base.
  'diff-delete-uncertain':
    'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200 ring-1 ring-yellow-500 dark:ring-yellow-400 rounded-[2px]',
}

/**
 * Render a list of segments as a single HTML string. Empty segments are
 * dropped. Whitespace is preserved verbatim (the consumer should set
 * `white-space: pre-wrap` on the container).
 */
export function segmentsToHtml(segments: HighlightSegment[]): string {
  const parts: string[] = []
  let uncertainIdx = 0
  for (const seg of segments) {
    if (seg.text.length === 0) continue
    const safe = escapeHtml(seg.text)
    const cls = CLASS_FOR_KIND[seg.kind]
    if (cls) {
      const isUncertain =
        seg.kind === 'uncertain' || seg.kind === 'diff-delete-uncertain'
      const attr = isUncertain ? ` data-uncertain="${uncertainIdx++}"` : ''
      parts.push(`<mark class="${cls}"${attr}>${safe}</mark>`)
    } else {
      parts.push(safe)
    }
  }
  return parts.join('')
}

/**
 * Overlay uncertain spans onto a list of original-side segments.
 *
 * The diff walker builds `originalSegments` in order — so the
 * concatenation of their `.text` equals the original string, and
 * each segment occupies a contiguous character range that we can
 * reconstruct with a running offset. This function walks those
 * segments, and for each character range that falls inside any
 * uncertain span, splits the segment and promotes the inner portion
 * to the `uncertain` or `diff-delete-uncertain` kind (depending on
 * whether the underlying segment was equal or a delete).
 *
 * `diff-insert` segments cannot appear on the original side, so we
 * don't need to handle them here — uncertainty is an Original-OCR
 * concept.
 *
 * The returned list still satisfies `join(.text) === original` so
 * downstream offset-sensitive consumers (there are none today, but
 * there could be) don't lose alignment.
 */
export function applyUncertainOverlay(
  segments: HighlightSegment[],
  spans: UncertainSpan[],
): HighlightSegment[] {
  if (spans.length === 0) return segments

  // Normalise: sort by char_start, drop invalid/zero-length entries,
  // and merge overlaps. The server guarantees sorted/non-overlapping
  // input today, but the composable is public and we'd rather not
  // trust a caller to hand us clean data.
  const normalised = normaliseSpans(spans)
  if (normalised.length === 0) return segments

  const result: HighlightSegment[] = []
  let offset = 0
  let spanIdx = 0

  for (const seg of segments) {
    const segStart = offset
    const segEnd = offset + seg.text.length
    offset = segEnd

    if (seg.text.length === 0) {
      result.push(seg)
      continue
    }

    // Skip spans that ended before this segment started. Spans are
    // sorted, so once we're past the current segment we can advance
    // the cursor for good.
    while (
      spanIdx < normalised.length &&
      normalised[spanIdx].char_end <= segStart
    ) {
      spanIdx += 1
    }

    // Collect every span that overlaps this segment. Because spans
    // are sorted, once we hit one that starts after the segment we
    // can stop — the rest are in later segments.
    const touching: UncertainSpan[] = []
    for (let i = spanIdx; i < normalised.length; i += 1) {
      const s = normalised[i]
      if (s.char_start >= segEnd) break
      touching.push(s)
    }

    if (touching.length === 0) {
      result.push(seg)
      continue
    }

    const promotedKind: HighlightKind =
      seg.kind === 'diff-delete' ? 'diff-delete-uncertain' : 'uncertain'

    let cursor = segStart
    for (const span of touching) {
      const spanStart = Math.max(span.char_start, segStart)
      const spanEnd = Math.min(span.char_end, segEnd)
      if (cursor < spanStart) {
        result.push({
          kind: seg.kind,
          text: seg.text.slice(cursor - segStart, spanStart - segStart),
        })
      }
      result.push({
        kind: promotedKind,
        text: seg.text.slice(spanStart - segStart, spanEnd - segStart),
      })
      cursor = spanEnd
    }
    if (cursor < segEnd) {
      result.push({
        kind: seg.kind,
        text: seg.text.slice(cursor - segStart),
      })
    }
  }

  return result
}

/**
 * Map uncertain spans from raw_text coordinates to corrected text positions
 * using regex matching. For each uncertain span, extract the literal text
 * from rawText and search for it in correctedText. If the user has already
 * corrected that region, the regex won't match — which is correct (it's
 * been fixed). For short spans (< 3 chars), surrounding context is included
 * in the pattern to avoid false positives.
 */
export function mapUncertainToCorrected(
  rawText: string,
  correctedText: string,
  spans: UncertainSpan[],
): UncertainSpan[] {
  if (!rawText || !correctedText || spans.length === 0) return []

  const result: UncertainSpan[] = []
  for (const span of spans) {
    const text = rawText.slice(span.char_start, span.char_end)
    if (!text) continue

    if (text.length < 3) {
      // Short spans need surrounding context to disambiguate
      const ctxBefore = rawText.slice(
        Math.max(0, span.char_start - 15),
        span.char_start,
      )
      const ctxAfter = rawText.slice(
        span.char_end,
        Math.min(rawText.length, span.char_end + 15),
      )
      const pattern =
        escapeRegex(ctxBefore) +
        '(' +
        escapeRegex(text) +
        ')' +
        escapeRegex(ctxAfter)
      try {
        const match = new RegExp(pattern).exec(correctedText)
        if (match) {
          const start = match.index + ctxBefore.length
          result.push({ char_start: start, char_end: start + text.length })
        }
      } catch {
        // Invalid regex from exotic characters — skip this span
      }
    } else {
      const escaped = escapeRegex(text)
      try {
        const regex = new RegExp(escaped, 'g')
        let match: RegExpExecArray | null
        while ((match = regex.exec(correctedText)) !== null) {
          result.push({
            char_start: match.index,
            char_end: match.index + match[0].length,
          })
        }
      } catch {
        // Invalid regex — skip
      }
    }
  }
  return result
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Sort `spans` by `char_start`, drop empty/invalid entries, and merge
 * any overlapping pairs into the minimum set of disjoint spans that
 * cover the same characters. Returns a fresh array — does not mutate
 * the input.
 */
function normaliseSpans(spans: UncertainSpan[]): UncertainSpan[] {
  const valid = spans.filter((s) => s.char_end > s.char_start)
  if (valid.length === 0) return []
  const sorted = [...valid].sort((a, b) => a.char_start - b.char_start)
  const merged: UncertainSpan[] = []
  for (const s of sorted) {
    const last = merged[merged.length - 1]
    if (last && s.char_start <= last.char_end) {
      if (s.char_end > last.char_end) {
        merged[merged.length - 1] = {
          char_start: last.char_start,
          char_end: s.char_end,
        }
      }
    } else {
      merged.push({ char_start: s.char_start, char_end: s.char_end })
    }
  }
  return merged
}

/**
 * Compute the diff between two strings and return two parallel segment
 * lists — one for the "original" panel (contains equal + delete spans)
 * and one for the "corrected" panel (contains equal + insert spans).
 *
 * When `uncertainSpans` is provided, the original-side segments also
 * pick up `uncertain` / `diff-delete-uncertain` markup for the
 * flagged character ranges. `uncertainSpans` addresses the
 * `original` string, not `corrected` — the uncertainty is a property
 * of the Original OCR reading.
 *
 * Exported so it can be used directly in unit tests without a Vue
 * reactive context.
 */
export function diffToSegments(
  original: string,
  corrected: string,
  uncertainSpans: UncertainSpan[] = [],
): {
  originalSegments: HighlightSegment[]
  correctedSegments: HighlightSegment[]
} {
  // diff-match-patch throws "Null input" for null/undefined, which
  // takes down the whole <EntryDetailView> render and leaves the
  // user staring at a blank page. Coerce defensively so an entry
  // with a missing text field (shouldn't happen per the backend
  // contract, but has) degrades to "no diff" instead of a crash.
  const safeOriginal = original ?? ''
  const safeCorrected = corrected ?? ''
  const dmp = new DiffMatchPatch()
  const diffs: Diff[] = dmp.diff_main(safeOriginal, safeCorrected)
  // Merge adjacent micro-edits into readable chunks — much nicer for prose.
  dmp.diff_cleanupSemantic(diffs)

  const originalSegments: HighlightSegment[] = []
  const correctedSegments: HighlightSegment[] = []

  for (const [op, text] of diffs) {
    if (op === 0) {
      originalSegments.push({ kind: 'equal', text })
      correctedSegments.push({ kind: 'equal', text })
    } else if (op === -1) {
      originalSegments.push({ kind: 'diff-delete', text })
    } else if (op === 1) {
      correctedSegments.push({ kind: 'diff-insert', text })
    }
  }

  // Map uncertain spans to corrected text positions via regex matching.
  // Spans that the user already corrected won't match — expected.
  const correctedSpans = mapUncertainToCorrected(
    safeOriginal,
    safeCorrected,
    uncertainSpans,
  )

  return {
    originalSegments: applyUncertainOverlay(originalSegments, uncertainSpans),
    correctedSegments: applyUncertainOverlay(correctedSegments, correctedSpans),
  }
}

/**
 * Optional second argument bag for `useDiffHighlight`. Kept as a
 * separate object so adding more overlays later doesn't keep growing
 * the positional argument list.
 */
export interface DiffHighlightOptions {
  /** OCR uncertainty spans in `original` coordinates. Applied only when
   * `showReview.value` is true. */
  uncertainSpans?: Ref<UncertainSpan[]>
  /** Review toggle state. When false, uncertainty overlays are
   * suppressed regardless of `uncertainSpans`. */
  showReview?: Ref<boolean>
}

/**
 * Reactive wrapper. Given refs to the original text (read-only) and the
 * corrected text (editable), returns reactive HTML strings ready to be
 * rendered with `v-html`.
 *
 * - When `enabled` is false, the output is the raw text (escaped) with
 *   no highlight markup — matching a plain textarea.
 * - When `options.showReview` is true and `options.uncertainSpans` is
 *   non-empty, both the Original OCR side and the Corrected Text side
 *   render uncertainty highlights. Corrected-side spans are found via
 *   regex matching: the literal text of each uncertain region is
 *   searched for in the corrected text. If the user has already fixed
 *   an uncertain region, the regex won't match and the highlight
 *   naturally disappears from the corrected side.
 */
export function useDiffHighlight(
  original: Ref<string>,
  corrected: Ref<string>,
  enabled: Ref<boolean>,
  options: DiffHighlightOptions = {},
) {
  const segments = computed(() => {
    // See `diffToSegments` — coerce null/undefined to empty string so
    // a malformed entry payload doesn't crash the diff render.
    const originalText = original.value ?? ''
    const correctedText = corrected.value ?? ''
    const spans =
      options.showReview?.value && options.uncertainSpans
        ? options.uncertainSpans.value
        : []
    if (!enabled.value) {
      // Diff overlay off. Build a single "equal" segment and apply
      // the uncertainty overlay by hand so the Review toggle still
      // works on its own — both original and corrected sides.
      const originalSegments = applyUncertainOverlay(
        [{ kind: 'equal' as const, text: originalText }],
        spans,
      )
      const correctedSpans = mapUncertainToCorrected(
        originalText,
        correctedText,
        spans,
      )
      const correctedSegments = applyUncertainOverlay(
        [{ kind: 'equal' as const, text: correctedText }],
        correctedSpans,
      )
      return { originalSegments, correctedSegments }
    }
    return diffToSegments(originalText, correctedText, spans)
  })

  const originalHtml = computed(() =>
    segmentsToHtml(segments.value.originalSegments),
  )
  const correctedHtml = computed(() =>
    segmentsToHtml(segments.value.correctedSegments),
  )

  return {
    originalHtml,
    correctedHtml,
  }
}
