import { describe, it, expect } from 'vitest'
import { movingAverage3 } from '../moving-average'

describe('movingAverage3', () => {
  it('returns the centred 3-point mean for an interior index', () => {
    const result = movingAverage3([10, 20, 30, 40, 50])
    // index 2 → mean(20, 30, 40) = 30
    expect(result[2]).toBe(30)
  })

  it('truncates the window at the start of the series', () => {
    const result = movingAverage3([10, 20, 30])
    // index 0 has no [-1] neighbour → mean(10, 20) = 15
    expect(result[0]).toBe(15)
  })

  it('truncates the window at the end of the series', () => {
    const result = movingAverage3([10, 20, 30])
    // index 2 has no [+1] neighbour → mean(20, 30) = 25
    expect(result[2]).toBe(25)
  })

  it('skips null values in the window', () => {
    const result = movingAverage3([10, null, 30])
    // index 1: window = [10, null, 30] → mean(10, 30) = 20
    expect(result[1]).toBe(20)
  })

  it('returns null when the entire window is null', () => {
    const result = movingAverage3([null, null, null])
    expect(result).toEqual([null, null, null])
  })

  it('produces a result of the same length as the input', () => {
    expect(movingAverage3([1, 2, 3, 4, 5])).toHaveLength(5)
    expect(movingAverage3([])).toHaveLength(0)
    expect(movingAverage3([42])).toHaveLength(1)
  })

  it('handles a single value', () => {
    // index 0: window = [undefined, 42, undefined] → present = [42] → 42
    expect(movingAverage3([42])).toEqual([42])
  })
})
