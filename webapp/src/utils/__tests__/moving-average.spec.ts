import { describe, it, expect } from 'vitest'
import { movingAverage, movingAverage3 } from '../moving-average'

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

describe('movingAverage', () => {
  it('window=3 matches movingAverage3', () => {
    const values = [10, 20, 30, 40, 50]
    expect(movingAverage(values, 3)).toEqual(movingAverage3(values))
  })

  it('window=5 averages the centred 5-point window for an interior index', () => {
    const result = movingAverage([10, 20, 30, 40, 50, 60, 70], 5)
    // index 3 → mean(20,30,40,50,60) = 40
    expect(result[3]).toBe(40)
  })

  it('window=5 truncates the half-window at the series start', () => {
    const result = movingAverage([10, 20, 30, 40, 50, 60, 70], 5)
    // index 0 → window [0-2 .. 0+2] clamped to [0..2] = mean(10,20,30) = 20
    expect(result[0]).toBe(20)
    // index 1 → [0..3] = mean(10,20,30,40) = 25
    expect(result[1]).toBe(25)
  })

  it('window=5 truncates the half-window at the series end', () => {
    const result = movingAverage([10, 20, 30, 40, 50, 60, 70], 5)
    // index 6 → [4..6] = mean(50,60,70) = 60
    expect(result[6]).toBe(60)
  })

  it('window=7 averages the centred 7-point window for an interior index', () => {
    const result = movingAverage([10, 20, 30, 40, 50, 60, 70, 80, 90], 7)
    // index 4 → mean(20,30,40,50,60,70,80) = 50
    expect(result[4]).toBe(50)
  })

  it('skips null values within the window', () => {
    // window=5, index 2: [0..4] = [10, null, 30, null, 50] → mean(10,30,50)=30
    const result = movingAverage([10, null, 30, null, 50], 5)
    expect(result[2]).toBe(30)
  })

  it('returns null when the entire window is null', () => {
    expect(movingAverage([null, null, null, null, null], 5)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ])
  })

  it('produces a result of the same length as the input', () => {
    expect(movingAverage([1, 2, 3, 4, 5], 5)).toHaveLength(5)
    expect(movingAverage([], 7)).toHaveLength(0)
  })
})
