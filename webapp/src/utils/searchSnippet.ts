/**
 * Render an FTS5 snippet string as safe HTML with matched terms
 * wrapped in `<mark>` tags.
 *
 * The server-side `search_text_with_snippets` repository method uses
 * SQLite FTS5's `snippet()` aux function with ASCII `\x02` (STX) and
 * `\x03` (ETX) control characters as start/end markers. These
 * characters never appear in normal journal text and survive JSON
 * serialisation (JSON escapes them as `\u0002` / `\u0003`).
 *
 * This function:
 *
 * 1. Splits the snippet at marker boundaries into alternating
 *    plain / highlighted segments. Segments are discovered by
 *    scanning for the next marker in order so a missing close marker
 *    degrades to "everything after the open marker is highlighted"
 *    rather than throwing.
 * 2. HTML-escapes every segment's text so the output is safe for
 *    `v-html` rendering.
 * 3. Wraps highlighted segments in `<mark class="...">...</mark>`
 *    using the same Tailwind palette pattern as the chunk overlay
 *    (yellow, since search highlights are semantically a different
 *    thing from chunk boundaries and should not collide visually).
 *
 * If the snippet contains no markers at all, the function returns
 * the escaped input unchanged — the caller can still render it with
 * `v-html` and the output will be plain text.
 */

const STX = '\x02'
const ETX = '\x03'

const MARK_CLASS =
  'bg-yellow-200 dark:bg-yellow-400/55 text-gray-900 dark:text-white rounded-sm px-0.5'

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderSnippetHtml(snippet: string): string {
  if (snippet.length === 0) return ''
  if (!snippet.includes(STX)) return escapeHtml(snippet)

  const parts: string[] = []
  let i = 0
  while (i < snippet.length) {
    const openIdx = snippet.indexOf(STX, i)
    if (openIdx === -1) {
      // Tail after the last close marker (or a fully plain suffix).
      parts.push(escapeHtml(snippet.slice(i)))
      break
    }
    // Plain text up to the open marker.
    if (openIdx > i) {
      parts.push(escapeHtml(snippet.slice(i, openIdx)))
    }
    // Find the matching close marker. If missing, treat everything
    // from the open marker to end-of-string as the highlighted span.
    const closeIdx = snippet.indexOf(ETX, openIdx + 1)
    const highlightEnd = closeIdx === -1 ? snippet.length : closeIdx
    const highlighted = snippet.slice(openIdx + 1, highlightEnd)
    if (highlighted.length > 0) {
      parts.push(
        `<mark class="${MARK_CLASS}">${escapeHtml(highlighted)}</mark>`,
      )
    }
    i = closeIdx === -1 ? snippet.length : closeIdx + 1
  }
  return parts.join('')
}
