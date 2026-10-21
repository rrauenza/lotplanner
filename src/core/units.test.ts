import { describe, expect, it } from 'vitest'

import { toFeetAndInches, toInches } from './units'

/**
 * The expected values are the published sizes of the four seeded vehicles, in
 * the feet-and-inches form they are published in, so they are arithmetic anyone
 * can check rather than numbers this code produced.
 */

describe('toInches', () => {
  it('adds the two boxes the way a vehicle is published', () => {
    // The Explorer is 16'7" long and 6'7" wide; the coach is 45' by 8'6".
    expect(toInches('16', '7')).toBe(199)
    expect(toInches('6', '7')).toBe(79)
    expect(toInches('45', '0')).toBe(540)
    expect(toInches('8', '6')).toBe(102)
  })

  it('treats a blank box as zero', () => {
    expect(toInches('5', '')).toBe(60)
    expect(toInches('  ', '3')).toBe(3)
  })

  it('allows inches past a foot, which is the same length as the other way round', () => {
    expect(toInches('0', '15')).toBe(15)
    expect(toInches('1', '3')).toBe(15)
  })

  it('refuses what is not a dimension', () => {
    expect(toInches('0', '0')).toBeUndefined()
    expect(toInches('', '')).toBeUndefined()
    expect(toInches('5.5', '0')).toBeUndefined()
    expect(toInches('-1', '0')).toBeUndefined()
    expect(toInches('five', '3')).toBeUndefined()
  })
})

describe('toFeetAndInches', () => {
  it('reads back the way the size was published', () => {
    expect(toFeetAndInches(199)).toBe(`16'7"`)
    expect(toFeetAndInches(79)).toBe(`6'7"`)
    expect(toFeetAndInches(102)).toBe(`8'6"`)
    expect(toFeetAndInches(840)).toBe(`70'0"`)
  })

  it('carries inches past a foot, so a total is never written as 15 inches', () => {
    expect(toFeetAndInches(15)).toBe(`1'3"`)
    expect(toFeetAndInches(12)).toBe(`1'0"`)
  })
})
