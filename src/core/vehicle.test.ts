import { describe, expect, it } from 'vitest'

import { sameVehicle, vehicle, type VehicleInput } from './vehicle'

function make(overrides: Partial<VehicleInput> = {}): ReturnType<typeof vehicle> {
  return vehicle({
    name: 'Ford Explorer',
    widthInches: 79,
    lengthInches: 199,
    colour: '#3b82f6',
    ...overrides,
  })
}

describe('vehicle', () => {
  it('collapses a name that was typed sloppily', () => {
    expect(make({ name: '  Ford   Explorer  ' }).name).toBe('Ford Explorer')
  })

  it('removes control characters rather than letting them pass as whitespace', () => {
    // Removed, not turned into a space, so a name cannot be split in two by one.
    expect(make({ name: 'Ford\u0007Explorer' }).name).toBe('FordExplorer')
    // A real space beside one is kept, though.
    expect(make({ name: 'Ford\u0000 Explorer' }).name).toBe('Ford Explorer')
  })

  it('composes a name, so two that look identical are identical', () => {
    // A combining acute is a different string from a composed one.
    expect(make({ name: 'Cafe\u0301' }).name).toBe('Caf\u00e9')
  })

  it('refuses a name that is empty, or longer than a name needs to be', () => {
    expect(() => make({ name: '   ' })).toThrow()
    expect(() => make({ name: 'x'.repeat(65) })).toThrow()
  })

  it('takes a short label, or as much of the name as a rectangle can carry', () => {
    expect(make({ shortLabel: ' SUV ' }).shortLabel).toBe('SUV')
    expect(make({ name: 'Semi + 53 ft trailer' }).shortLabel).toBe('Semi + 53 ft')
    expect(() => make({ shortLabel: 'thirteen char' })).toThrow()
  })

  it('holds a colour as one number, and refuses what is not a colour', () => {
    // The shapes a colour is written in belong to the colour module; what
    // matters here is that a Vehicle keeps the number and rejects the rest.
    expect(make({ colour: '#3b82f6' }).colour).toBe(0x3b82f6)
    expect(() => make({ colour: 'blue' })).toThrow()
  })

  it('refuses a dimension that is not a whole positive number of inches', () => {
    expect(() => make({ widthInches: 0 })).toThrow()
    expect(() => make({ lengthInches: 199.5 })).toThrow()
  })

  it('records a width including mirrors, and refuses one narrower than the body', () => {
    // The body is 79 inches wide, so mirrors can only add to it.
    expect(make({ mirrorsWidthInches: 79 }).mirrorsWidthInches).toBe(79)
    expect(() => make({ mirrorsWidthInches: 78 })).toThrow()
    expect(() => make({ mirrorsWidthInches: 79.5 })).toThrow()
  })

  it('leaves out a width including mirrors that nobody has looked up', () => {
    expect(make().mirrorsWidthInches).toBeUndefined()
  })
})

describe('sameVehicle', () => {
  it('calls two copies of one vehicle the same vehicle', () => {
    expect(sameVehicle(make(), make())).toBe(true)
  })

  it('tells two vehicles apart when they differ in any field at all', () => {
    expect(sameVehicle(make(), make({ name: 'Other' }))).toBe(false)
    expect(sameVehicle(make(), make({ shortLabel: 'X' }))).toBe(false)
    expect(sameVehicle(make(), make({ widthInches: 80 }))).toBe(false)
    expect(sameVehicle(make(), make({ lengthInches: 200 }))).toBe(false)
    expect(sameVehicle(make(), make({ colour: '#000000' }))).toBe(false)
    expect(sameVehicle(make(), make({ mirrorsWidthInches: 102 }))).toBe(false)
  })
})
