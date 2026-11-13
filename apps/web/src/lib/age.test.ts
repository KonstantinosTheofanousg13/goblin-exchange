import { describe, expect, it } from 'vitest'
import { formatAge } from './age'

const MIN = 60_000

describe('formatAge', () => {
  it.each([
    [0, 'just now'],
    [59_999, 'just now'],
    [MIN, '1 min ago'],
    [59 * MIN, '59 min ago'],
    [60 * MIN, '1 h ago'],
    [47 * 60 * MIN, '47 h ago'],
    [48 * 60 * MIN, '2 days ago'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatAge(ms)).toBe(expected)
  })
})
