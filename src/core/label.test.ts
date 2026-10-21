import { describe, expect, it } from 'vitest'

import { labelFor, labelRotationFor } from './label'
import { vehicle } from './vehicle'

/** The Explorer from the System Collection: 199 by 79 inches. */
const SUV = vehicle({
  name: 'Car / SUV (Ford Explorer)',
  shortLabel: 'SUV',
  widthInches: 79,
  lengthInches: 199,
  colour: '#3b82f6',
})

describe('what a rectangle says', () => {
  it('writes the name when the rectangle is long enough to hold it', () => {
    expect(labelFor(SUV, 300)).toBe(SUV.name)
  })

  it('falls back to the short label when only that fits', () => {
    // The name is 26 characters, which at this font size needs about 172 px.
    expect(labelFor(SUV, 100)).toBe('SUV')
  })

  it('says nothing rather than spilling out past a rectangle too short for any of it', () => {
    expect(labelFor(SUV, 12)).toBeUndefined()
  })

  it('decides in screen pixels, so one rectangle changes its mind as it grows', () => {
    // The heart of it: a vehicle covers the same metres at every zoom, but what
    // it can carry on screen does not.
    expect(labelFor(SUV, 100)).toBe('SUV')
    expect(labelFor(SUV, 400)).toBe(SUV.name)
  })

  it('names a vehicle that stands far taller than it is wide', () => {
    // A 53 foot trailer drawn at 1:1 imagery is about 71 px long and 9 px
    // across, so its label stands out over the photograph on either side.
    // Demanding the width instead would mean no label was ever drawn at all at
    // native resolution, which is the closest this app ever zooms.
    const semi = vehicle({
      name: 'Semi + 53 ft trailer',
      shortLabel: 'Semi',
      widthInches: 102,
      lengthInches: 840,
      colour: '#ef4444',
    })

    expect(labelFor(semi, 71)).toBe('Semi')
  })
})

describe('which way a label reads', () => {
  it('turns the text with the rectangle it names', () => {
    // A vehicle lying east-west is named by text lying east-west.
    expect(labelRotationFor(90)).toBe(0)
    // One pointing north is named along its length, which reads up the screen.
    expect(labelRotationFor(0)).toBe(90)
  })

  it('drops the half turn that would have read upside down', () => {
    // A rectangle pointing south is the same rectangle as one pointing north,
    // and its name reads the same way round either way.
    expect(labelRotationFor(180)).toBe(90)
    expect(labelRotationFor(270)).toBe(0)
    expect(labelRotationFor(-90)).toBe(0)
  })

  it('never leaves text more than a quarter turn from level', () => {
    for (let degrees = -360; degrees <= 360; degrees += 7) {
      const turned = labelRotationFor(degrees)

      expect(turned).toBeGreaterThanOrEqual(-90)
      expect(turned).toBeLessThanOrEqual(90)
    }
  })
})
