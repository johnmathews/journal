import { computed, type Ref } from 'vue'
import DiffMatchPatch, { type Diff } from 'diff-match-patch'

/**
 * Kinds of span the renderer knows how to style. `diff-delete` and
 * `diff-insert` come from comparing original vs corrected text. `equal`
 * is used to render untouched chunks so the template can still escape
 * them safely. Other kinds (e.g. OCR low-confidence regions) can be
 * added later without reshaping the API.
 */
export type HighlightKind = 'equal' | 'diff-delete' | 'diff-insert'

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
}

/**
 * Render a list of segments as a single HTML string. Empty segments are
 * dropped. Whitespace is preserved verbatim (the consumer should set
 * `white-space: pre-wrap` on the container).
 */
export function segmentsToHtml(segments: HighlightSegment[]): string {
  const parts: string[] = []
  for (const seg of segments) {
    if (seg.text.length === 0) continue
    const safe = escapeHtml(seg.text)
    const cls = CLASS_FOR_KIND[seg.kind]
    if (cls) {
      parts.push(`<mark class="${cls}">${safe}</mark>`)
    } else {
      parts.push(safe)
    }
  }
  return parts.join('')
}

/**
 * Compute the diff between two strings and return two parallel segment
 * lists — one for the "original" panel (contains equal + delete spans)
 * and one for the "corrected" panel (contains equal + insert spans).
 *
 * Exported so it can be used directly in unit tests without a Vue
 * reactive context.
 */
export function diffToSegments(
  original: string,
  corrected: string,
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

  return { originalSegments, correctedSegments }
}

/**
 * Reactive wrapper. Given refs to the original text (read-only) and the
 * corrected text (editable), returns reactive HTML strings ready to be
 * rendered with `v-html`. When `enabled` is false, the HTML output is
 * the raw text (escaped) with no highlight markup — matching what a
 * plain textarea would show.
 */
export function useDiffHighlight(
  original: Ref<string>,
  corrected: Ref<string>,
  enabled: Ref<boolean>,
) {
  const segments = computed(() => {
    // See `diffToSegments` — coerce null/undefined to empty string so
    // a malformed entry payload doesn't crash the diff render.
    const originalText = original.value ?? ''
    const correctedText = corrected.value ?? ''
    if (!enabled.value) {
      return {
        originalSegments: [{ kind: 'equal' as const, text: originalText }],
        correctedSegments: [{ kind: 'equal' as const, text: correctedText }],
      }
    }
    return diffToSegments(originalText, correctedText)
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
