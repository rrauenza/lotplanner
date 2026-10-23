import { describe, expect, it } from 'vitest'

import { boundsForExtent, type LatLngBounds, type SiteFrame } from './geometry'
import { vehicle, type Vehicle } from './vehicle'
import {
  CODEC_VERSION,
  decodeArtifact,
  encodeArtifact,
  type Artifact,
  type ArrivedCollection,
} from './codec'
import { newLayout, type Layout, type Placement } from './layout'

/**
 * The codec: what a Layout or a Collection looks like when it leaves this app.
 *
 * The wire shape is tuples rather than objects - no field names, positions in
 * centimetres - because a link is a budget of characters, and the measurements
 * that pinned the shape live in the file itself. What is tested here is the
 * behaviour that has to survive: a round trip, a version bump, a field this
 * reader has never heard of, and a polite refusal rather than a misreading.
 */

const EXPLORER = vehicle({
  name: 'Car / SUV (Ford Explorer)',
  shortLabel: 'SUV',
  widthInches: 79,
  lengthInches: 199,
  colour: '#3b82f6',
})

const SEMI = vehicle({
  name: 'Semi + 53 ft trailer',
  shortLabel: 'Semi',
  widthInches: 102,
  lengthInches: 840,
  colour: '#ef4444',
})

/** A Layout whose every number is already on the codec's own grid, so a round trip is exact. */
function gridLayout(): Layout {
  const frame: SiteFrame = {
    centre: { eastMetres: 0.4, northMetres: -0.7 },
    lengthMetres: 137,
    widthMetres: 98,
    rotationDegrees: 90.3,
  }
  const origin = { latitude: 37.3200301, longitude: -122.0310771 }
  const bounds = boundsForExtent(origin, {
    centre: frame.centre,
    halfEastMetres: 218.5,
    halfNorthMetres: 199,
  })

  const placements: readonly Placement[] = [
    {
      id: 'a',
      vehicle: SEMI,
      centre: { eastMetres: -12.34, northMetres: 5.67 },
      rotationDegrees: 90.3,
    },
    {
      id: 'b',
      vehicle: SEMI,
      centre: { eastMetres: 12.34, northMetres: 5.67 },
      rotationDegrees: 90.3,
    },
    {
      id: 'c',
      vehicle: EXPLORER,
      centre: { eastMetres: 0, northMetres: -20.1 },
      rotationDegrees: 0.5,
    },
  ]

  return {
    siteId: 'cupertino-sample',
    siteName: 'Cupertino sample',
    origin,
    bounds,
    frame,
    placements,
  }
}

/** The same Layout with the Site Frame left out, as a Site before frame was drawn. */
function withoutFrame(layout: Layout): Layout {
  return {
    siteId: layout.siteId,
    siteName: layout.siteName,
    origin: layout.origin,
    bounds: layout.bounds,
    placements: layout.placements,
  }
}

describe('a Layout on the wire', () => {
  it('round-trips to the same Layout', () => {
    const layout = gridLayout()
    const read = decodeArtifact(encodeArtifact({ kind: 'layout', layout }))

    expect(read.kind).toBe('ok')

    if (read.kind !== 'ok' || read.artifact.kind !== 'layout') {
      throw new Error('expected a readable Layout')
    }

    // The Placements' ids are this side's own - the wire carries none - so the
    // round trip is asserted on everything else, and on the ids being present
    // and distinct.
    const { placements, ...rest } = read.artifact.layout
    const { placements: before, ...restBefore } = layout

    expect(rest).toStrictEqual(restBefore)
    expect(placements.map((each) => ({ ...each, id: '' }))).toStrictEqual(
      before.map((each) => ({ ...each, id: '' })),
    )
    expect(new Set(placements.map((each) => each.id)).size).toBe(before.length)
  })

  it('round-trips a Layout with no frame, which is a Site before anyone drew one', () => {
    const layout = withoutFrame(gridLayout())
    const encoded = encodeArtifact({ kind: 'layout', layout })
    const read = decodeArtifact(encoded)

    expect(read.kind).toBe('ok')

    if (read.kind !== 'ok' || read.artifact.kind !== 'layout') {
      throw new Error('expected a readable Layout')
    }

    expect(read.artifact.layout.frame).toBeUndefined()
  })

  it('carries no field names', () => {
    const text = encodeArtifact({ kind: 'layout', layout: gridLayout() })

    expect(text).not.toContain('siteId')
    expect(text).not.toContain('rotationDegrees')
    expect(text).not.toContain('eastMetres')
    expect(text.startsWith('[')).toBe(true)
  })

  it('quantises placement positions to the centimetre', () => {
    const layout: Layout = {
      ...gridLayout(),
      placements: [
        {
          id: 'a',
          vehicle: SEMI,
          centre: { eastMetres: 1.234, northMetres: -5.678 },
          rotationDegrees: 0,
        },
      ],
    }

    const read = decodeArtifact(encodeArtifact({ kind: 'layout', layout }))

    if (read.kind !== 'ok' || read.artifact.kind !== 'layout') {
      throw new Error('expected a readable Layout')
    }

    expect(read.artifact.layout.placements[0]?.centre).toStrictEqual({
      eastMetres: 1.23,
      northMetres: -5.68,
    })
  })

  it('keeps one copy of a vehicle placed many times', () => {
    const layout = gridLayout()
    const text = encodeArtifact({ kind: 'layout', layout })
    const vehicles = JSON.parse(text) as unknown[]

    // The vehicle table is one entry per distinct vehicle, not one per placement.
    expect(vehicles[7]).toHaveLength(2)
  })

  it('dedupes by value, not by object, when a Layout has been through storage', () => {
    // The shape real data arrives in: storage rebuilds a Vehicle per Placement
    // (ADR 0002), so the two Semi placements are equal values and not the same
    // object. Identity would list the same vehicle twice and inflate the link.
    const roundTripped = JSON.parse(JSON.stringify(gridLayout())) as Layout
    const vehicles = JSON.parse(
      encodeArtifact({ kind: 'layout', layout: roundTripped }),
    ) as unknown[]

    expect(vehicles[7]).toHaveLength(2)
  })

  it('re-encodes to the very same text, so a reader cannot drift from a writer', () => {
    const layout = gridLayout()
    const once = encodeArtifact({ kind: 'layout', layout })
    const read = decodeArtifact(once)

    if (read.kind !== 'ok') {
      throw new Error('expected a readable Layout')
    }

    expect(encodeArtifact(read.artifact)).toBe(once)
  })
})

describe('a Collection on the wire', () => {
  const collection: ArrivedCollection = { name: 'Yard dump trucks', vehicles: [SEMI, EXPLORER] }

  it('round-trips with no Layout involved, because both travel the same way', () => {
    const read = decodeArtifact(encodeArtifact({ kind: 'collection', collection }))

    expect(read).toStrictEqual({ kind: 'ok', artifact: { kind: 'collection', collection } })
  })

  it('names itself on the wire so the recipient can see what arrived', () => {
    const text = encodeArtifact({ kind: 'collection', collection })

    expect(JSON.parse(text)).toStrictEqual([
      'collection',
      CODEC_VERSION,
      'Yard dump trucks',
      [
        ['Semi + 53 ft trailer', 'Semi', 102, 840, 0xef4444],
        ['Car / SUV (Ford Explorer)', 'SUV', 79, 199, 0x3b82f6],
      ],
    ])
  })
})

describe('versioning, which cannot be retrofitted', () => {
  it('writes the version into every artifact', () => {
    expect(
      (JSON.parse(encodeArtifact({ kind: 'layout', layout: gridLayout() })) as unknown[])[1],
    ).toBe(CODEC_VERSION)
    expect(
      (
        JSON.parse(
          encodeArtifact({ kind: 'collection', collection: { name: 'x', vehicles: [] } }),
        ) as unknown[]
      )[1],
    ).toBe(CODEC_VERSION)
  })

  it('runs a migration on read, so an older shape is brought forward rather than dropped', () => {
    // An older writer put the vehicle table and the placements the other way
    // round. The migration is the only thing that knows that, and it runs before
    // the reader ever sees the fields.
    const current = JSON.parse(
      encodeArtifact({ kind: 'layout', layout: gridLayout() }),
    ) as unknown[]
    const older = [current[0], 0, ...current.slice(2, 7)]
    older.push(current[8], current[7])

    const read = decodeArtifact(JSON.stringify(older), {
      migrations: [
        (fields) => {
          const [siteId, siteName, origin, bounds, frame, placements, vehicles] = fields
          return [siteId, siteName, origin, bounds, frame, vehicles, placements]
        },
      ],
    })

    expect(read.kind).toBe('ok')
  })

  it('refuses politely when the reader is older than the writer', () => {
    const ahead = JSON.parse(encodeArtifact({ kind: 'layout', layout: gridLayout() })) as unknown[]
    ahead[1] = CODEC_VERSION + 1

    const read = decodeArtifact(JSON.stringify(ahead))

    expect(read.kind).toBe('too-new')
    expect(read.kind === 'too-new' ? read.message : '').toContain('newer version')
  })

  it('tolerates a field it has never heard of, rather than refusing the whole artifact', () => {
    const wire = JSON.parse(encodeArtifact({ kind: 'layout', layout: gridLayout() })) as unknown[]
    // A later minor writer added a trailing field. The reader must read what it
    // knows and ignore the rest - a reason never to drop somebody's layout.
    wire.push({ somethingTheReaderHasNeverHeardOf: true })

    const read = decodeArtifact(JSON.stringify(wire))

    expect(read.kind).toBe('ok')
  })

  it('tolerates an unknown field inside a placement too', () => {
    const wire = JSON.parse(encodeArtifact({ kind: 'layout', layout: gridLayout() })) as unknown[]
    const placements = wire[8] as unknown[]
    ;(placements[0] as unknown[]).push('a field from the future')

    const read = decodeArtifact(JSON.stringify(wire))

    expect(read.kind).toBe('ok')
  })
})

describe('what cannot be read', () => {
  it('says so rather than throwing when the text is not an artifact at all', () => {
    expect(decodeArtifact('not json').kind).toBe('unreadable')
    expect(decodeArtifact('{}').kind).toBe('unreadable')
    expect(decodeArtifact('["something",1]').kind).toBe('unreadable')
  })

  it('declines an older version with no migration to bring it forward', () => {
    const current = JSON.parse(
      encodeArtifact({ kind: 'layout', layout: gridLayout() }),
    ) as unknown[]
    current[1] = CODEC_VERSION - 1

    expect(decodeArtifact(JSON.stringify(current)).kind).toBe('unreadable')
  })

  it('drops a Layout whose numbers are not numbers', () => {
    const wire = JSON.parse(encodeArtifact({ kind: 'layout', layout: gridLayout() })) as unknown[]
    wire[4] = [Number.NaN, -122]

    expect(decodeArtifact(JSON.stringify(wire)).kind).toBe('unreadable')
  })

  it('drops a vehicle the domain would never have built', () => {
    const wire = JSON.parse(
      encodeArtifact({ kind: 'collection', collection: { name: 'x', vehicles: [SEMI] } }),
    ) as unknown[]
    ;(wire[3] as unknown[])[0] = [SEMI.name, SEMI.shortLabel, 0, -1, SEMI.colour]

    expect(decodeArtifact(JSON.stringify(wire)).kind).toBe('unreadable')
  })
})

describe('the size a link is allowed', () => {
  it('describes a 40-placement layout in well under four thousand characters', () => {
    // The real measurement - compressed and base64url'd - is in link.test.ts and
    // in the ticket's notes. This is the uncompressed sanity check: no field
    // names, and tuples, or the compressed figure below would never hold.
    const layout = crowded()
    const text = encodeArtifact({ kind: 'layout', layout })

    expect(layout.placements).toHaveLength(40)
    expect(text.length).toBeLessThan(2000)
  })
})

/** A plausible lot: rows of semis and a few shorter vehicles. */
function crowded(): Layout {
  const vehicles: readonly Vehicle[] = [SEMI, EXPLORER]
  const placements: Placement[] = []

  for (let index = 0; index < 40; index += 1) {
    placements.push({
      id: `p${String(index)}`,
      vehicle: vehicles[index % 7 === 6 ? 1 : 0] ?? SEMI,
      centre: {
        eastMetres: -56 + (index % 8) * 16,
        northMetres: -34 + Math.floor(index / 8) * 17,
      },
      rotationDegrees: 90.3,
    })
  }

  return { ...gridLayout(), placements }
}

describe('bounds travel with the Layout', () => {
  it('keeps the bounding box rather than making the reader re-derive it', () => {
    const layout = gridLayout()
    const read = decodeArtifact(encodeArtifact({ kind: 'layout', layout }))

    if (read.kind !== 'ok' || read.artifact.kind !== 'layout') {
      throw new Error('expected a readable Layout')
    }

    const expected: LatLngBounds = layout.bounds

    expect(read.artifact.layout.bounds).toStrictEqual(expected)
  })
})

describe('newLayout is the shape the codec assumes', () => {
  it('round-trips a Layout straight out of newLayout', () => {
    const layout = newLayout({
      id: 'cupertino-sample',
      name: 'Cupertino sample',
      origin: { latitude: 37.3200301, longitude: -122.0310771 },
      frame: {
        centre: { eastMetres: 0, northMetres: 0 },
        lengthMetres: 137,
        widthMetres: 98,
        rotationDegrees: 90,
      },
    })
    const read = decodeArtifact(encodeArtifact({ kind: 'layout', layout }))

    expect(read.kind).toBe('ok')
  })
})

describe('the artifact kind the codec takes', () => {
  it('is a Layout or a Collection and nothing else', () => {
    const artifact: Artifact = { kind: 'collection', collection: { name: 'x', vehicles: [] } }

    expect(decodeArtifact(encodeArtifact(artifact)).kind).toBe('ok')
  })
})
