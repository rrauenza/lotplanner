import { describe, expect, it } from 'vitest'

import { systemVehicles } from './collection'

describe('the System Collection', () => {
  it('carries the published sizes of the four vehicles', () => {
    // From the spec: an Explorer, a semi with a 53 foot trailer, a 45 foot
    // coach, and a pickup with its utility trailer.
    expect(systemVehicles.map((each) => [each.lengthInches, each.widthInches])).toEqual([
      [199, 79],
      [840, 102],
      [547, 102],
      [524, 84],
    ])
  })

  it('gives every vehicle a rectangle that could be drawn', () => {
    for (const each of systemVehicles) {
      expect(each.lengthInches).toBeGreaterThan(0)
      expect(each.widthInches).toBeGreaterThan(0)
      expect(each.shortLabel.length).toBeGreaterThan(0)
      expect(each.colour).toBeGreaterThan(0x0000ff)
    }
  })

  it('names each one, and none of the names is a duplicate', () => {
    const names = systemVehicles.map((each) => each.name)

    expect(new Set(names).size).toBe(names.length)
    for (const name of names) {
      expect(name.trim()).toBe(name)
      expect(name.length).toBeGreaterThan(0)
    }
  })
})
