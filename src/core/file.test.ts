import { describe, expect, it } from 'vitest'

import { CODEC_VERSION, encodeArtifact, type Artifact } from './codec'
import { FILE_EXTENSION, FILE_FORMAT, decodeFile, encodeFile, fileNameFor } from './file'
import { boundsForExtent } from './geometry'
import type { Layout } from './layout'
import { vehicle } from './vehicle'

/**
 * The file's own half of sharing: the envelope, the name it is offered under,
 * and the reading of one back.
 *
 * A file is deliberately not a link: no deflate and no base64url, because a file
 * has no character budget to fit. What it shares with a link is the artifact's
 * one version field and the codec's migration-on-read, and those are what these
 * tests hold it to.
 */

const SEMI = vehicle({
  name: 'Semi + 53 ft trailer',
  shortLabel: 'Semi',
  widthInches: 102,
  lengthInches: 840,
  colour: '#ef4444',
})

function layout(): Layout {
  const origin = { latitude: 37.3200301, longitude: -122.0310771 }

  return {
    siteId: 'cupertino-sample',
    siteName: 'Cupertino sample',
    origin,
    bounds: boundsForExtent(origin, {
      centre: { eastMetres: 0.4, northMetres: -0.7 },
      halfEastMetres: 218.5,
      halfNorthMetres: 199,
    }),
    frame: {
      centre: { eastMetres: 0.4, northMetres: -0.7 },
      lengthMetres: 137,
      widthMetres: 98,
      rotationDegrees: 90.3,
    },
    placements: [
      {
        id: 'a',
        vehicle: SEMI,
        centre: { eastMetres: -12.34, northMetres: 5.67 },
        rotationDegrees: 90.3,
      },
    ],
  }
}

describe('a file this app made', () => {
  it('is JSON a person can open and read, not compressed characters', () => {
    const text = encodeFile({ kind: 'layout', layout: layout() }, 'Option A')
    const parsed = JSON.parse(text) as Record<string, unknown>

    // Indented, so it opens as a document rather than one line, and marked so a
    // reader can tell whose file it is without knowing the shape inside.
    expect(text).toContain('\n')
    expect(parsed['format']).toBe(FILE_FORMAT)
    expect(parsed['name']).toBe('Option A')
    expect(Array.isArray(parsed['artifact'])).toBe(true)
  })

  it('carries the same version field a link does, once', () => {
    const parsed = JSON.parse(
      encodeFile({ kind: 'layout', layout: layout() }, 'Option A'),
    ) as Record<string, unknown>
    const artifact = parsed['artifact'] as unknown[]

    expect(artifact[0]).toBe('layout')
    expect(artifact[1]).toBe(CODEC_VERSION)
  })

  it('round-trips a Layout, its name kept so it can be imported as itself', () => {
    const read = decodeFile(encodeFile({ kind: 'layout', layout: layout() }, 'Option A'))

    expect(read.kind).toBe('ok')

    if (read.kind !== 'ok' || read.artifact.kind !== 'layout') {
      throw new Error('expected a readable Layout file')
    }

    expect(read.name).toBe('Option A')

    const expected = layout()
    const back = read.artifact.layout

    expect(back.siteId).toBe(expected.siteId)
    expect(back.siteName).toBe(expected.siteName)
    expect(back.origin).toStrictEqual(expected.origin)
    expect(back.bounds).toStrictEqual(expected.bounds)
    expect(back.frame).toStrictEqual(expected.frame)
    expect(back.placements.map((each) => ({ ...each, id: '' }))).toStrictEqual(
      expected.placements.map((each) => ({ ...each, id: '' })),
    )
  })

  it('round-trips a Collection, whose own name is in the artifact', () => {
    const read = decodeFile(
      encodeFile({ kind: 'collection', collection: { name: 'Yard', vehicles: [SEMI] } }),
    )

    expect(read).toStrictEqual({
      kind: 'ok',
      artifact: { kind: 'collection', collection: { name: 'Yard', vehicles: [SEMI] } },
      name: undefined,
    })
  })

  it('names the download after what is in it, safely for a file system', () => {
    expect(fileNameFor('Option A')).toBe(`option-a${FILE_EXTENSION}`)
    expect(fileNameFor('Fleet / 2: north')).toBe(`fleet-2-north${FILE_EXTENSION}`)
    // A name that leaves nothing to name a file with still names a file.
    expect(fileNameFor('***')).toBe(`layout${FILE_EXTENSION}`)
  })
})

describe('the version discipline covers files too', () => {
  it('runs the migration a link would, because the body is the same shape', () => {
    // An older writer put the vehicle table and the placements the other way
    // round. The migration is the only thing that knows, and it must run for a
    // file exactly as it does for a link.
    const current = JSON.parse(encodeArtifact({ kind: 'layout', layout: layout() })) as unknown[]
    const older = ['layout', 0, ...current.slice(2, 7)]
    older.push(current[8], current[7])

    const read = decodeFile(JSON.stringify({ format: FILE_FORMAT, artifact: older }), {
      migrations: [
        (fields) => {
          const [siteId, siteName, origin, bounds, frame, placements, vehicles] = fields
          return [siteId, siteName, origin, bounds, frame, vehicles, placements]
        },
      ],
    })

    expect(read.kind).toBe('ok')
  })

  it('refuses politely a file from a newer writer rather than misreading it', () => {
    const ahead = JSON.parse(encodeArtifact({ kind: 'layout', layout: layout() })) as unknown[]
    ahead[1] = CODEC_VERSION + 1

    const read = decodeFile(JSON.stringify({ format: FILE_FORMAT, artifact: ahead }))

    expect(read.kind).toBe('too-new')
    expect(read.kind === 'too-new' ? read.message : '').toContain('newer version')
  })

  it('ignores an envelope field it has never heard of', () => {
    const written = JSON.parse(
      encodeFile({ kind: 'layout', layout: layout() }, 'Option A'),
    ) as Record<string, unknown>
    written['somethingTheReaderHasNeverHeardOf'] = true

    expect(decodeFile(JSON.stringify(written)).kind).toBe('ok')
  })
})

describe('a file that cannot be read', () => {
  it('says plainly that it is not one of ours, rather than failing silently', () => {
    for (const text of ['', 'not json at all', '{}', '[]', '{"format":"something-else"}']) {
      const read = decodeFile(text)

      expect(read.kind).toBe('unreadable')
      expect(read.kind === 'unreadable' ? read.message : '').toContain('lotplanner')
    }
  })

  it('says plainly when one of ours is damaged, rather than reporting a site as empty', () => {
    for (const text of [
      '{"format":"lotplanner"}',
      '{"format":"lotplanner","artifact":"nope"}',
      '{"format":"lotplanner","artifact":["layout",1]}',
    ]) {
      const read = decodeFile(text)

      expect(read.kind).toBe('unreadable')
      expect(read.kind === 'unreadable' ? read.message.length > 0 : false).toBe(true)
    }
  })

  it('never throws, whatever it is handed', () => {
    for (const text of ['{', 'nul\u0000', '1', 'true', '"a string"']) {
      expect(() => decodeFile(text)).not.toThrow()
    }
  })
})

describe('the artifact a file holds', () => {
  it('is a Layout or a Collection and nothing else', () => {
    const artifact: Artifact = { kind: 'collection', collection: { name: 'x', vehicles: [] } }

    expect(decodeFile(encodeFile(artifact)).kind).toBe('ok')
  })
})
