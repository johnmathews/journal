import type { Segment } from '@/types/storyline'

/**
 * Build a citation registry for one chapter.
 *
 * Walks the given segment lists in order (the chapter narrative first,
 * then each addendum). Each unique `entry_id` is assigned an
 * incrementing `[N]` in encounter order, so a chapter's footnotes read
 * 1, 2, 3 … in sequence and addenda pick up the next numbers.
 *
 * This is a pure function — callers wrap it in `computed()` when they
 * want reactive consumption.
 */
export function buildCitationRegistry(
  segmentLists: Segment[][],
): Map<number, number> {
  const registry = new Map<number, number>()
  let next = 1

  for (const segments of segmentLists) {
    for (const seg of segments) {
      if (seg.kind !== 'citation') continue
      if (registry.has(seg.entry_id)) continue
      registry.set(seg.entry_id, next)
      next += 1
    }
  }

  return registry
}
