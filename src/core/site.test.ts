import { describe, expect, it } from 'vitest'

import {
  CONTEXT_MARGIN_METRES,
  extentForSite,
  UNFRAMED_EXTENT_HALF_METRES,
  type Site,
} from './site'

const ORIGIN = { latitude: 37.32, longitude: -122.03 }

function site(overrides: Partial<Site> = {}): Site {
  return { id: 'sample', name: 'Sample', origin: ORIGIN, ...overrides }
}

describe('extentForSite', () => {
  it('surrounds a framed Site rather than cropping to its edges', () => {
    const extent = extentForSite(
      site({
        frame: {
          centre: { eastMetres: 0, northMetres: 0 },
          lengthMetres: 100,
          widthMetres: 60,
          rotationDegrees: 0,
        },
      }),
    )

    // 50 m half-length, 30 m half-width, and 150 m of context on every side.
    expect(extent.halfEastMetres).toBeCloseTo(30 + 150, 6)
    expect(extent.halfNorthMetres).toBeCloseTo(50 + 150, 6)
  })

  it('keeps the frame where it sits relative to the origin', () => {
    const extent = extentForSite(
      site({
        frame: {
          centre: { eastMetres: 40, northMetres: -25 },
          lengthMetres: 100,
          widthMetres: 60,
          rotationDegrees: 0,
        },
      }),
    )

    expect(extent.centre.eastMetres).toBeCloseTo(40, 6)
    expect(extent.centre.northMetres).toBeCloseTo(-25, 6)
  })

  it('still shows something for a Site with no frame', () => {
    const extent = extentForSite(site())

    expect(extent.centre.eastMetres).toBe(0)
    expect(extent.centre.northMetres).toBe(0)
    expect(extent.halfEastMetres).toBeCloseTo(150, 6)
    expect(extent.halfNorthMetres).toBeCloseTo(150, 6)
  })

  it('pins the two distances that are product decisions', () => {
    expect(CONTEXT_MARGIN_METRES).toBe(150)
    expect(UNFRAMED_EXTENT_HALF_METRES).toBe(150)
  })
})
