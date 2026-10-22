import { describe, expect, it } from 'vitest'

import { cssColour, parseColour } from './colour'

describe('reading a colour', () => {
  it('takes any of the three shapes it is written in', () => {
    expect(parseColour('#abc')).toBe(0xaabbcc)
    expect(parseColour('#3b82f6')).toBe(0x3b82f6)
    expect(parseColour('0x3B82F6')).toBe(0x3b82f6)
    expect(parseColour('  #3b82f6  ')).toBe(0x3b82f6)
  })

  it('refuses what it cannot read rather than guessing at it', () => {
    expect(() => parseColour('blue')).toThrow()
    expect(() => parseColour('#12345')).toThrow()
    expect(() => parseColour('')).toThrow()
  })
})

describe('writing a colour', () => {
  it('writes the shape it reads, so a colour survives the round trip', () => {
    for (const written of ['#000000', '#3b82f6', '#ffffff']) {
      expect(cssColour(parseColour(written))).toBe(written)
    }
  })

  it('keeps the leading zeroes that would turn a colour into another one', () => {
    expect(cssColour(0x0000ff)).toBe('#0000ff')
    expect(cssColour(0x0f0f0f)).toBe('#0f0f0f')
  })
})
