import { describe, expect, it } from 'vitest'
import { sparklinePoints } from './sparkline'

describe('sparklinePoints', () => {
  it('spans the full width and maps min to the bottom, max to the top', () => {
    expect(sparklinePoints([10, 20, 30], 100, 20, 0)).toBe('0,20 50,10 100,0')
  })

  it('keeps the padding at the top and bottom', () => {
    expect(sparklinePoints([1, 2], 10, 20, 2)).toBe('0,18 10,2')
  })

  it('draws a flat series through the middle', () => {
    expect(sparklinePoints([5, 5, 5], 10, 20)).toBe('0,10 5,10 10,10')
  })

  it('returns nothing when there are fewer than two points', () => {
    expect(sparklinePoints([], 10, 20)).toBe('')
    expect(sparklinePoints([5], 10, 20)).toBe('')
  })
})
