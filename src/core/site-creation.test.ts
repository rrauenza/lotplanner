import { describe, expect, it } from 'vitest'

import { CONTEXT_MARGIN_METRES, extentForSite, type Site } from './site'
import { draftFrom, manifestEntry, manifestEntryText, siteIdFor } from './site-creation'
import type { Place } from './geocoding'

const PLACE: Place = {
  name: 'Vallco lot',
  address: '10123 N Wolfe Rd, Cupertino, California, United States',
  position: { latitude: 37.3318, longitude: -122.0312 },
}

const FRAME = {
  centre: { eastMetres: 12.34, northMetres: -3.45 },
  lengthMetres: 137.5,
  widthMetres: 98,
  rotationDegrees: 0,
}

/** The entry already in the manifest, so the round trip has the real thing to hold on to. */
const EXISTING: Site = {
  id: 'cupertino-sample',
  name: 'Cupertino sample',
  origin: { latitude: 37.32, longitude: -122.03 },
  frame: {
    centre: { eastMetres: -132, northMetres: 199 },
    lengthMetres: 137,
    widthMetres: 98,
    rotationDegrees: 90,
  },
}

describe('siteIdFor', () => {
  it('spells a name the way the manifest spells ids', () => {
    expect(siteIdFor('Cupertino sample')).toBe('cupertino-sample')
    expect(siteIdFor('  Main  St. lot! ')).toBe('main-st-lot')
    expect(siteIdFor("Bob's lot")).toBe('bob-s-lot')
  })

  it('still gives an id to a name with nothing to spell it from', () => {
    expect(siteIdFor('***')).toBe('site')
    expect(siteIdFor('   ')).toBe('site')
  })
})

describe('manifestEntry', () => {
  it('takes the place as the origin and the drawing as its frame', () => {
    const entry = manifestEntry({ place: PLACE, frame: FRAME }, [])

    expect(entry).toStrictEqual({
      id: 'vallco-lot',
      name: 'Vallco lot',
      origin: { latitude: 37.3318, longitude: -122.0312 },
      frame: FRAME,
    })
  })

  it('records an angle as a tenth of a degree, in the half turn a person reads', () => {
    const quarter = manifestEntry({ place: PLACE, frame: { ...FRAME, rotationDegrees: 32.47 } }, [])
    const turned = manifestEntry({ place: PLACE, frame: { ...FRAME, rotationDegrees: 197.53 } }, [])

    expect(quarter.frame?.rotationDegrees).toBe(32.5)
    // 197.53 is the same rectangle as 17.53, which no vehicle laid against it can tell apart.
    expect(turned.frame?.rotationDegrees).toBe(17.5)
  })

  it('records a distance to the centimetre', () => {
    const entry = manifestEntry(
      {
        place: PLACE,
        frame: {
          centre: { eastMetres: 12.3449, northMetres: -3.4551 },
          lengthMetres: 137.504,
          widthMetres: 98.0,
          rotationDegrees: 0,
        },
      },
      [],
    )

    expect(entry.frame?.centre).toStrictEqual({ eastMetres: 12.34, northMetres: -3.46 })
    expect(entry.frame?.lengthMetres).toBe(137.5)
    expect(entry.frame?.widthMetres).toBe(98)
  })

  it('stays usable by the visitor app as it stands', () => {
    const entry = manifestEntry({ place: PLACE, frame: { ...FRAME, rotationDegrees: 90 } }, [])
    const extent = extentForSite(entry)

    // A frame 137.5 long and 98 wide, turned so its length runs east: half its
    // width to the north and south, half its length east and west, and the
    // context margin the manifest's entries already get. The extent is centred
    // on the frame, which sits where the creator drew it relative to the place.
    expect(extent.halfEastMetres).toBeCloseTo(137.5 / 2 + CONTEXT_MARGIN_METRES, 6)
    expect(extent.halfNorthMetres).toBeCloseTo(98 / 2 + CONTEXT_MARGIN_METRES, 6)
    expect(extent.centre).toStrictEqual({ eastMetres: 12.34, northMetres: -3.45 })
  })

  it('leaves the frame out when none was drawn', () => {
    const entry = manifestEntry({ place: PLACE }, [])

    expect('frame' in entry).toBe(false)
    expect(entry.frame).toBeUndefined()
  })

  it('numbers a name the manifest already uses rather than repeating its id', () => {
    const taken: Site[] = [{ ...EXISTING, id: 'vallco-lot', name: 'Vallco lot' }]
    const second = manifestEntry({ place: PLACE, frame: FRAME }, taken)

    expect(second.id).toBe('vallco-lot-2')
  })

  it('keeps counting past the numbers that are taken too', () => {
    const taken: Site[] = [
      { ...EXISTING, id: 'vallco-lot' },
      { ...EXISTING, id: 'vallco-lot-2' },
    ]

    expect(manifestEntry({ place: PLACE, frame: FRAME }, taken).id).toBe('vallco-lot-3')
  })

  it('lets two places of one name differ, since only the name spells the id', () => {
    const first = manifestEntry({ place: PLACE, frame: FRAME }, [])
    const other = manifestEntry(
      { place: { ...PLACE, address: 'Elsewhere Road, Somewhere' }, frame: FRAME },
      [first],
    )

    expect(other.id).toBe('vallco-lot-2')
  })

  it('keeps the id of a Site being corrected, even when it is renamed', () => {
    const draft = { ...draftFrom(EXISTING), place: { ...PLACE, name: 'Cupertino north' } }
    const entry = manifestEntry(draft, [EXISTING])

    expect(entry.id).toBe('cupertino-sample')
    expect(entry.name).toBe('Cupertino north')
  })

  it('will not make an entry with no name, no position or a broken frame', () => {
    expect(() => manifestEntry({ place: { ...PLACE, name: '  ' } }, [])).toThrow()
    expect(() =>
      manifestEntry({ place: { ...PLACE, position: { latitude: Number.NaN, longitude: 0 } } }, []),
    ).toThrow()
    expect(() =>
      manifestEntry({ place: PLACE, frame: { ...FRAME, lengthMetres: 0 } }, []),
    ).toThrow()
    expect(() =>
      manifestEntry({ place: PLACE, frame: { ...FRAME, widthMetres: -1 } }, []),
    ).toThrow()
    expect(() =>
      manifestEntry(
        { place: PLACE, frame: { ...FRAME, centre: { eastMetres: Number.NaN, northMetres: 0 } } },
        [],
      ),
    ).toThrow()
    expect(() =>
      manifestEntry({ place: PLACE, frame: { ...FRAME, rotationDegrees: Number.NaN } }, []),
    ).toThrow()
  })
})

describe('manifestEntryText', () => {
  it('writes the entry the way the entries already in the manifest are written', () => {
    const text = manifestEntryText(manifestEntry({ place: PLACE, frame: FRAME }, []))

    expect(text).toBe(
      [
        '{',
        "  id: 'vallco-lot',",
        "  name: 'Vallco lot',",
        '  origin: { latitude: 37.3318, longitude: -122.0312 },',
        '  frame: {',
        '    centre: { eastMetres: 12.34, northMetres: -3.45 },',
        '    lengthMetres: 137.5,',
        '    widthMetres: 98,',
        '    rotationDegrees: 0,',
        '  },',
        '},',
      ].join('\n'),
    )
  })

  it('leaves the frame out of a Site that has none', () => {
    const text = manifestEntryText(manifestEntry({ place: PLACE }, []))

    expect(text).toBe(
      [
        '{',
        "  id: 'vallco-lot',",
        "  name: 'Vallco lot',",
        '  origin: { latitude: 37.3318, longitude: -122.0312 },',
        '},',
      ].join('\n'),
    )
  })

  it('escapes an apostrophe rather than ending the name early', () => {
    const entry = manifestEntry({ place: { ...PLACE, name: "Bob's lot" }, frame: FRAME }, [])
    const text = manifestEntryText(entry)

    expect(text).toContain("  name: 'Bob\\'s lot',")
  })
})

describe('draftFrom', () => {
  it('opens an existing Site with the rectangle it was saved with', () => {
    expect(draftFrom(EXISTING)).toStrictEqual({
      id: 'cupertino-sample',
      place: { name: 'Cupertino sample', position: { latitude: 37.32, longitude: -122.03 } },
      frame: EXISTING.frame,
    })
  })

  it('carries a frame at an angle through whole, rather than squaring it up', () => {
    const angled: Site = {
      ...EXISTING,
      frame: {
        centre: { eastMetres: 41.2, northMetres: -87.6 },
        lengthMetres: 210,
        widthMetres: 64.5,
        rotationDegrees: 33.3,
      },
    }

    expect(draftFrom(angled).frame).toStrictEqual(angled.frame)
  })

  it('opens a Site with no frame with no frame', () => {
    const frameless: Site = {
      id: 'cupertino-sample',
      name: 'Cupertino sample',
      origin: { latitude: 37.32, longitude: -122.03 },
    }

    expect('frame' in draftFrom(frameless)).toBe(false)
  })

  it('gives back the entry it started from when a correction is emitted again', () => {
    expect(manifestEntry(draftFrom(EXISTING), [EXISTING])).toStrictEqual(EXISTING)
  })

  it('gives back a frameless entry it started from', () => {
    const frameless: Site = {
      id: 'cupertino-sample',
      name: 'Cupertino sample',
      origin: { latitude: 37.32, longitude: -122.03 },
    }

    expect(manifestEntry(draftFrom(frameless), [frameless])).toStrictEqual(frameless)
  })
})
