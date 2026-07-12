import { describe, it, expect } from 'vitest'
import { isSufficientlyVisible } from '../visibility'

describe('isSufficientlyVisible', () => {
  it('fires at 60% intersection ratio (short chapters)', () => {
    expect(isSufficientlyVisible(0.6, 100, 1000)).toBe(true)
    expect(isSufficientlyVisible(0.59, 100, 1000)).toBe(false)
  })

  it('fires when the chapter fills 60% of the viewport (tall chapters)', () => {
    // A chapter 3x the viewport height scrolled fully into view: ratio
    // maxes out around 0.33 but the visible slice fills the screen.
    expect(isSufficientlyVisible(0.33, 900, 1000)).toBe(true)
    expect(isSufficientlyVisible(0.33, 500, 1000)).toBe(false)
  })

  it('never fires with a zero viewport (defensive)', () => {
    expect(isSufficientlyVisible(0.1, 100, 0)).toBe(false)
  })
})
