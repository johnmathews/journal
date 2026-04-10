import { computed, type ComputedRef, type Ref } from 'vue'
import type { Chunk, TokenSpan } from '@/types/entry'

/**
 * Visualisation modes for the entry-detail overlay. `'off'` renders
 * plain (escaped) text, matching the non-overlay view. `'chunks'`
 * draws chunk boundaries from the server's persisted chunker output.
 * `'tokens'` draws per-token boundaries from the embedding model's
 * tokenizer (`cl100k_base`).
 */
export type OverlayMode = 'off' | 'chunks' | 'tokens'

/**
 * Kinds of span the overlay renderer produces. `plain` is untouched
 * text (e.g. gaps between tokens, or any text when mode is `'off'`).
 * `chunk-a` / `chunk-b` alternate per chunk index. `chunk-overlap` is
 * used for regions covered by two or more chunks (the fixed chunker's
 * overlap_tokens and the semantic chunker's weak-cut lead-ins). Token
 * kinds alternate per token index.
 */
export type OverlayKind =
  | 'plain'
  | 'chunk-a'
  | 'chunk-b'
  | 'chunk-overlap'
  | 'token-a'
  | 'token-b'

export interface OverlaySegment {
  kind: OverlayKind
  text: string
  /** Human-readable label shown on hover (title attribute). Optional. */
  title?: string
}

/**
 * Escape a string for safe insertion into innerHTML. Kept local to
 * this module so the overlay composable has no coupling to the diff
 * composable's internals.
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Tailwind classes for each overlay kind. `plain` has no class so the
 * renderer emits bare escaped text (no `<mark>` wrapper). Chunk spans
 * carry a left border so boundaries are visible even when the
 * background colours blend together. Token spans use a lighter
 * background fill without borders.
 *
 * Colour choice: `sky` and `green` are defined in the project's
 * Tailwind `@theme` palette and are currently unused elsewhere, so
 * they are safe to reserve for the overlay. `emerald` is deliberately
 * avoided — the diff composable uses it but it's not redefined in
 * `@theme`, so values are inconsistent.
 */
const CLASS_FOR_KIND: Record<OverlayKind, string> = {
  plain: '',
  'chunk-a':
    'bg-sky-100/70 dark:bg-sky-900/40 border-l-2 border-sky-500/60 rounded-r-[2px]',
  'chunk-b':
    'bg-green-100/70 dark:bg-green-900/40 border-l-2 border-green-500/60 rounded-r-[2px]',
  'chunk-overlap':
    'bg-violet-100/70 dark:bg-violet-900/40 border-l-2 border-violet-500/60 rounded-r-[2px]',
  'token-a': 'bg-sky-100/80 dark:bg-sky-900/50 rounded-[1px]',
  'token-b': 'bg-green-100/80 dark:bg-green-900/50 rounded-[1px]',
}

/**
 * Render segments to an HTML string. Empty segments are dropped. The
 * caller must render the result with `v-html` and set
 * `white-space: pre-wrap` on the container so whitespace-bearing
 * tokens survive.
 */
export function segmentsToHtml(segments: OverlaySegment[]): string {
  const parts: string[] = []
  for (const seg of segments) {
    if (seg.text.length === 0) continue
    const safe = escapeHtml(seg.text)
    const cls = CLASS_FOR_KIND[seg.kind]
    if (cls) {
      const title = seg.title ? ` title="${escapeHtml(seg.title)}"` : ''
      parts.push(`<mark class="${cls}"${title}>${safe}</mark>`)
    } else {
      parts.push(safe)
    }
  }
  return parts.join('')
}

/**
 * Build chunk-overlay segments by walking the text between a set of
 * breakpoints. Chunks may overlap (fixed-chunker `overlap_tokens`,
 * semantic-chunker weak-cut lead-ins), so for each interval we find
 * the set of chunks covering it. Intervals covered by no chunks get
 * `plain`, by one chunk get alternating `chunk-a` / `chunk-b` based on
 * that chunk's index, and by two or more chunks get `chunk-overlap`.
 *
 * Offsets outside the text are clamped defensively — a chunker bug
 * that emits an out-of-range offset should render as a warning in the
 * console via `buildChunkSegments`, not crash the view.
 */
export function buildChunkSegments(
  text: string,
  chunks: Chunk[],
): OverlaySegment[] {
  if (text.length === 0) {
    return []
  }
  if (chunks.length === 0) {
    return [{ kind: 'plain', text }]
  }

  // Collect unique breakpoints: text boundaries plus every chunk edge,
  // clamped to [0, text.length].
  const breakpoints = new Set<number>([0, text.length])
  for (const c of chunks) {
    const start = Math.max(0, Math.min(text.length, c.char_start))
    const end = Math.max(0, Math.min(text.length, c.char_end))
    breakpoints.add(start)
    breakpoints.add(end)
  }
  const sorted = [...breakpoints].sort((a, b) => a - b)

  const segments: OverlaySegment[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    if (start >= end) continue
    const covering = chunks.filter(
      (c) => c.char_start <= start && c.char_end >= end,
    )
    let kind: OverlayKind
    let title: string | undefined
    if (covering.length === 0) {
      kind = 'plain'
    } else if (covering.length === 1) {
      const only = covering[0]
      kind = only.index % 2 === 0 ? 'chunk-a' : 'chunk-b'
      title = `chunk ${only.index} — ${only.token_count} tokens`
    } else {
      kind = 'chunk-overlap'
      title = `overlap: chunks ${covering.map((c) => c.index).join(', ')}`
    }
    segments.push({ kind, text: text.slice(start, end), title })
  }
  return segments
}

/**
 * Build token-overlay segments by walking the token list in order.
 * Tokens are assumed not to overlap (they partition the text). Gaps
 * between tokens (which should not occur for well-formed tiktoken
 * output) are rendered as `plain`. Trailing text after the last
 * token's `char_end` is also rendered as `plain` rather than silently
 * dropped.
 */
export function buildTokenSegments(
  text: string,
  tokens: TokenSpan[],
): OverlaySegment[] {
  if (text.length === 0) {
    return []
  }
  if (tokens.length === 0) {
    return [{ kind: 'plain', text }]
  }

  const segments: OverlaySegment[] = []
  let cursor = 0
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const start = Math.max(0, Math.min(text.length, t.char_start))
    const end = Math.max(0, Math.min(text.length, t.char_end))
    if (start > cursor) {
      segments.push({ kind: 'plain', text: text.slice(cursor, start) })
    }
    if (end > start) {
      const kind: OverlayKind = i % 2 === 0 ? 'token-a' : 'token-b'
      segments.push({
        kind,
        text: text.slice(start, end),
        title: `token ${t.index} — id ${t.token_id}`,
      })
      cursor = end
    }
  }
  if (cursor < text.length) {
    segments.push({ kind: 'plain', text: text.slice(cursor) })
  }
  return segments
}

/**
 * Reactive wrapper. Given refs to the text, the current overlay mode,
 * and the cached chunks/tokens for the entry, returns a computed HTML
 * string ready for `v-html`. When `mode` is `'off'` or when the data
 * for the selected mode is not yet loaded, the text is rendered
 * unadorned (escaped). The caller is responsible for fetching data
 * and populating the chunk/token refs.
 */
export function useOverlayHighlight(options: {
  text: Ref<string>
  mode: Ref<OverlayMode>
  chunks: Ref<Chunk[] | null>
  tokens: Ref<TokenSpan[] | null>
}): { overlayHtml: ComputedRef<string> } {
  const { text, mode, chunks, tokens } = options

  const segments = computed<OverlaySegment[]>(() => {
    if (mode.value === 'off') {
      return [{ kind: 'plain', text: text.value }]
    }
    if (mode.value === 'chunks') {
      if (chunks.value === null) {
        return [{ kind: 'plain', text: text.value }]
      }
      return buildChunkSegments(text.value, chunks.value)
    }
    // mode === 'tokens'
    if (tokens.value === null) {
      return [{ kind: 'plain', text: text.value }]
    }
    return buildTokenSegments(text.value, tokens.value)
  })

  const overlayHtml = computed(() => segmentsToHtml(segments.value))

  return { overlayHtml }
}
