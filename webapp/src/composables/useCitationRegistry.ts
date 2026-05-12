import type { Segment, StorylineDetail } from '@/types/storyline'

/**
 * Build a shared citation registry across a storyline's panels.
 *
 * Walks the narrative panel first, then the curation panel. Each unique
 * `entry_id` is assigned an incrementing `[N]` in encounter order. The
 * narrative-first walk means narrative footnotes read 1, 2, 3 … in
 * sequence; curation-only entries pick up the next numbers, so a
 * curation row's `[N]` may be non-sequential when read top-to-bottom.
 *
 * This is a pure function — callers wrap it in `computed()` when they
 * want reactive consumption.
 */
export function buildCitationRegistry(
  panels: StorylineDetail['panels'],
): Map<number, number> {
  const registry = new Map<number, number>()
  let next = 1

  const consume = (segments: Segment[] | undefined): void => {
    if (!segments) return
    for (const seg of segments) {
      if (seg.kind !== 'citation') continue
      if (registry.has(seg.entry_id)) continue
      registry.set(seg.entry_id, next)
      next += 1
    }
  }

  consume(panels.narrative?.segments)
  consume(panels.curation?.segments)

  return registry
}
