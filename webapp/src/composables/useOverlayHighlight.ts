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
  /**
   * When this segment is the first interval of a new chunk in a
   * chunks-mode overlay, this carries the chunk's index. The renderer
   * emits a small inline badge (`[N]`) before the segment text so the
   * user can see exactly where each chunk begins, even when a single
   * chunk covers a long run of uniform background colour.
   */
  chunkStartIndex?: number
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
 * carry a thick left border plus a saturated background so the chunk
 * boundary is unmistakable even when a single chunk covers a long
 * run of text. Token spans use a brighter background fill without
 * borders (the boundary is communicated by the alternation itself).
 *
 * **Text colour is explicit on every kind.** The HTML `<mark>` element
 * has a user-agent default `color: black` (because it's intended for
 * dark text on yellow highlighter). Without an explicit override the
 * text would be black in dark mode — unreadable against our tinted
 * backgrounds and ignoring the `text-gray-100` the overlay container
 * inherits. `text-gray-900 dark:text-white` restores the expected
 * light/dark behaviour.
 *
 * Colour strategy:
 * - Light mode uses the `200` shades with `text-gray-900` — strong
 *   enough to read against a white panel without washing out.
 * - Dark mode uses the `400` shade at 50–55% opacity with `text-white`
 *   — `sky-400` etc. are noticeably brighter than `sky-500`, and
 *   bumping the alpha into the 50s gives a properly saturated tint
 *   that the white text still punches through cleanly.
 *
 * Overlap uses `fuchsia` (not violet) because violet sits too close
 * to both sky and green in hue space — in dark mode the three tints
 * at similar lightness become hard to tell apart. Fuchsia is much
 * further from both in oklab space (warm magenta vs cool blue/green),
 * so overlap regions are unmistakable even against the dark panel.
 *
 * `sky`, `green`, and `fuchsia` are defined in the project's Tailwind
 * `@theme` palette (see `src/assets/main.css`). `emerald` is
 * deliberately avoided: the diff composable uses it but it is not
 * redefined in `@theme`, so its values are inconsistent with the
 * project's palette.
 */
const CLASS_FOR_KIND: Record<OverlayKind, string> = {
  plain: '',
  'chunk-a':
    'text-gray-900 dark:text-white bg-sky-200 dark:bg-sky-400/50 border-l-[3px] border-sky-600 dark:border-sky-300 rounded-r-[2px]',
  'chunk-b':
    'text-gray-900 dark:text-white bg-green-200 dark:bg-green-400/50 border-l-[3px] border-green-600 dark:border-green-300 rounded-r-[2px]',
  'chunk-overlap':
    'text-gray-900 dark:text-white bg-fuchsia-200 dark:bg-fuchsia-400/55 border-l-[3px] border-fuchsia-600 dark:border-fuchsia-300 rounded-r-[2px]',
  'token-a':
    'text-gray-900 dark:text-white bg-sky-200 dark:bg-sky-400/45 rounded-[1px]',
  'token-b':
    'text-gray-900 dark:text-white bg-green-200 dark:bg-green-400/45 rounded-[1px]',
}

/**
 * Inline badge prepended to the first interval of each chunk in
 * chunks mode. Small dark-on-light (inverted in dark mode) pill
 * showing the chunk's index. The badge is the primary "here is where
 * chunk N starts" marker — the alternating backgrounds reinforce it
 * but are not sufficient on their own (especially for the degenerate
 * single-chunk case where there is no alternation to see).
 */
const CHUNK_BADGE_CLASS =
  'inline-block text-[0.65rem] font-bold leading-none px-1.5 py-[2px] mr-1 rounded bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 align-[0.15em] font-mono'

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
    // Badge markup is emitted INSIDE the `<mark>` so it picks up the
    // chunk's own background tint and reads as part of the chunk. It
    // only applies when the segment is a chunk kind — plain and token
    // segments never set `chunkStartIndex`.
    const badgeHtml =
      seg.chunkStartIndex !== undefined
        ? `<span class="${CHUNK_BADGE_CLASS}" aria-label="chunk ${seg.chunkStartIndex} start">${seg.chunkStartIndex}</span>`
        : ''
    if (cls) {
      const title = seg.title ? ` title="${escapeHtml(seg.title)}"` : ''
      parts.push(`<mark class="${cls}"${title}>${badgeHtml}${safe}</mark>`)
    } else {
      parts.push(`${badgeHtml}${safe}`)
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
  // clamped to [0, text.length]. Also record which char position marks
  // the start of each chunk — the renderer prepends a `[N]` badge to
  // the first interval that begins at that position.
  const breakpoints = new Set<number>([0, text.length])
  const chunkStartAt = new Map<number, number>() // char_start -> chunk.index
  for (const c of chunks) {
    const start = Math.max(0, Math.min(text.length, c.char_start))
    const end = Math.max(0, Math.min(text.length, c.char_end))
    breakpoints.add(start)
    breakpoints.add(end)
    // If multiple chunks happen to start at the same offset, keep the
    // lowest index so the badge shown is the "earliest" chunk — this
    // matches the visual ordering the user expects.
    const existing = chunkStartAt.get(start)
    if (existing === undefined || c.index < existing) {
      chunkStartAt.set(start, c.index)
    }
  }
  const sorted = [...breakpoints].sort((a, b) => a - b)
  const consumedStart = new Set<number>()

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
    // Badge only on chunk segments — plain intervals between chunks
    // shouldn't carry a chunk label.
    let chunkStartIndex: number | undefined
    if (kind !== 'plain' && !consumedStart.has(start)) {
      const startIdx = chunkStartAt.get(start)
      if (startIdx !== undefined) {
        chunkStartIndex = startIdx
        consumedStart.add(start)
      }
    }
    segments.push({
      kind,
      text: text.slice(start, end),
      title,
      chunkStartIndex,
    })
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
