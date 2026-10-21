import { describe, expect, it } from 'vitest'

import { LABEL_FONT_PIXELS, labelFor } from './label'
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
    expect(labelFor(SUV, { lengthPixels: 300, widthPixels: 60 })).toBe(SUV.name)
  })

  it('falls back to the short label when only that fits', () => {
    // The name is 26 characters, which at this font size needs about 172 px.
    expect(labelFor(SUV, { lengthPixels: 100, widthPixels: 60 })).toBe('SUV')
  })

  it('says nothing rather than spilling over a rectangle too small for any of it', () => {
    expect(labelFor(SUV, { lengthPixels: 100, widthPixels: 8 })).toBeUndefined()
    expect(labelFor(SUV, { lengthPixels: 12, widthPixels: 60 })).toBeUndefined()
  })

  it('decides in screen pixels, so one rectangle changes its mind as it grows', () => {
    // The heart of it: a vehicle covers the same metres at every zoom, but what
    // it can carry on screen does not.
    expect(labelFor(SUV, { lengthPixels: 100, widthPixels: 60 })).toBe('SUV')
    expect(labelFor(SUV, { lengthPixels: 400, widthPixels: 240 })).toBe(SUV.name)
  })

  it('wants a little more room across than the font is tall', () => {
    expect(labelFor(SUV, { lengthPixels: 400, widthPixels: LABEL_FONT_PIXELS * 1.5 })).toBe(
      SUV.name,
    )
    expect(labelFor(SUV, { lengthPixels: 400, widthPixels: LABEL_FONT_PIXELS })).toBeUndefined()
  })
})
