import { describe, expect, it } from 'vitest'
import { copperToGold, formatChange, formatGold, formatMoney, formatQuantity, splitCopper } from './money'

describe('money', () => {
  it('splits copper into gold, silver and copper', () => {
    expect(splitCopper('12345678')).toEqual({ gold: 1234n, silver: 56n, copper: 78n })
  })

  it.each([
    ['12345678', '1,234g 56s 78c'],
    ['10507', '1g 05s 07c'],
    ['507', '5s 07c'],
    ['7', '7c'],
    ['0', '0c'],
  ])('formats %s copper as %s', (copper, expected) => {
    expect(formatMoney(copper)).toBe(expected)
  })

  it('formats prices beyond 2^53 copper exactly (no float rounding)', () => {
    // 2^53 + 1 copper: as a JS number this would round to ...992
    expect(formatMoney('9007199254740993')).toBe('900,719,925,474g 09s 93c')
  })

  it('converts copper to gold for charts', () => {
    expect(copperToGold('12345678')).toBe(1234.5678)
  })

  it.each([
    [1234.5678, '1,235g'],
    [12.3456, '12.35g'],
    [0.0507, '0.0507g'],
  ])('formats chart value %s as %s', (gold, expected) => {
    expect(formatGold(gold)).toBe(expected)
  })

  it.each([
    [12.5, '+12.50%'],
    [-3.25, '-3.25%'],
    [0, '0.00%'],
    [null, '—'],
  ])('formats change %s as %s', (percent, expected) => {
    expect(formatChange(percent)).toBe(expected)
  })

  it.each([
    [999, '999'],
    [12_345, '12,345'],
    [180_000, '180k'],
    [1_234_567, '1.23M'],
  ])('formats quantity %s as %s', (quantity, expected) => {
    expect(formatQuantity(quantity)).toBe(expected)
  })
})
