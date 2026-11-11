/** Visibility predicate for mark-read-on-view.
 *
 * A chapter counts as "sufficiently visible" when either 60% of the
 * chapter is on screen (short chapters) or the chapter fills 60% of
 * the viewport (chapters taller than the viewport, whose
 * `intersectionRatio` can never reach 0.6 no matter how far the user
 * scrolls).
 */
export const VISIBLE_RATIO = 0.6

export function isSufficientlyVisible(
  intersectionRatio: number,
  visibleHeight: number,
  viewportHeight: number,
): boolean {
  if (intersectionRatio >= VISIBLE_RATIO) return true
  return viewportHeight > 0 && visibleHeight >= VISIBLE_RATIO * viewportHeight
}
