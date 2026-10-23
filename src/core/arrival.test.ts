import { describe, expect, it } from 'vitest'

import { arrivalFrom, importedFrom } from './arrival'
import { browserCompressor as testCompressor } from '../browser/compression'
import { CODEC_VERSION, encodeArtifact, type Artifact } from './codec'
import { encodeFile } from './file'
import { boundsForExtent } from './geometry'
import { encodePayload, toBase64Url } from './link'
import type { Layout } from './layout'
import { linkFor } from './route'
import { vehicle } from './vehicle'

/**
 * The front door, joined up: a fragment in, an answer out.
 *
 * The grammar and the codec are each tested on their own; this is the one place
 * that proves they were joined the right way round - which link lands on the
 * visitor, which opens the creator, which opens a shared arrangement, and what a
 * broken or too-new link says instead.
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
      centre: { eastMetres: 0, northMetres: 0 },
      halfEastMetres: 218.5,
      halfNorthMetres: 199,
    }),
    placements: [
      {
        id: 'a',
        vehicle: SEMI,
        centre: { eastMetres: 1.23, northMetres: -4.56 },
        rotationDegrees: 90,
      },
    ],
  }
}

describe('what a page load is', () => {
  it('is the visitor with no fragment, or a fragment that means nothing', async () => {
    expect(await arrivalFrom('', testCompressor)).toStrictEqual({ kind: 'visitor' })
    expect(await arrivalFrom('#nonsense', testCompressor)).toStrictEqual({ kind: 'visitor' })
  })

  it('is the creator for the creator fragment', async () => {
    expect(await arrivalFrom('#create', testCompressor)).toStrictEqual({
      kind: 'creator',
      siteId: undefined,
    })
  })

  it('is the shared Layout for a link that carries one', async () => {
    const artifact: Artifact = { kind: 'layout', layout: layout() }
    const payload = await encodePayload(artifact, testCompressor)
    const link = linkFor('https://example.test/app/', 'layout', payload)
    const arrived = await arrivalFrom(link.slice(link.indexOf('#')), testCompressor)

    expect(arrived.kind).toBe('layout')
    expect(arrived.kind === 'layout' ? arrived.layout.placements : []).toHaveLength(1)
    expect(arrived.kind === 'layout' ? arrived.layout.siteId : '').toBe('cupertino-sample')
  })

  it('declines a link made by a newer app rather than misreading it', async () => {
    const ahead = JSON.parse(encodeArtifact({ kind: 'layout', layout: layout() })) as unknown[]
    ahead[1] = CODEC_VERSION + 1
    const payload = toBase64Url(await testCompressor.deflate(JSON.stringify(ahead)))

    const arrived = await arrivalFrom(`#layout/${payload}`, testCompressor)

    expect(arrived.kind).toBe('declined')
    expect(arrived.kind === 'declined' ? arrived.message : '').toContain('newer version')
  })

  it('declines a broken payload rather than showing an empty map', async () => {
    const arrived = await arrivalFrom('#layout/not-actually-deflate', testCompressor)

    expect(arrived.kind).toBe('declined')
    expect(arrived.kind === 'declined' ? arrived.message.length > 0 : false).toBe(true)
  })

  it('is the shared Collection for a link that carries one, offered rather than kept', async () => {
    const payload = await encodePayload(
      { kind: 'collection', collection: { name: 'Yard', vehicles: [SEMI] } },
      testCompressor,
    )

    // Nothing of the recipient's is written by the arrival itself: it comes back
    // as a Collection to offer, and only a deliberate action keeps it.
    expect(await arrivalFrom(`#collection/${payload}`, testCompressor)).toStrictEqual({
      kind: 'collection',
      collection: { name: 'Yard', vehicles: [SEMI] },
    })
  })

  it('refuses a link whose word and payload disagree about what it is', async () => {
    // A `#layout/` word carrying a Collection's artifact: a broken link rather
    // than something to guess at.
    const payload = await encodePayload(
      { kind: 'collection', collection: { name: 'Yard', vehicles: [SEMI] } },
      testCompressor,
    )
    const arrived = await arrivalFrom(`#layout/${payload}`, testCompressor)

    expect(arrived.kind).toBe('declined')
  })
})

describe('what an imported file is', () => {
  it('is a Layout to open, under the name it was exported with', () => {
    const read = importedFrom(encodeFile({ kind: 'layout', layout: layout() }, 'Option A'), {
      newId: () => 'made-up',
    })

    expect(read.kind).toBe('layout')
    expect(read.kind === 'layout' ? read.name : '').toBe('Option A')
    expect(read.kind === 'layout' ? read.layout.placements : []).toHaveLength(1)
    expect(read.kind === 'layout' ? read.layout.siteId : '').toBe('cupertino-sample')
  })

  it('is a Collection to keep, not a Layout to show', () => {
    const read = importedFrom(
      encodeFile({ kind: 'collection', collection: { name: 'Yard', vehicles: [SEMI] } }),
    )

    expect(read).toStrictEqual({
      kind: 'collection',
      collection: { name: 'Yard', vehicles: [SEMI] },
    })
  })

  it('declines a file it cannot read, in plain words rather than throwing', () => {
    const read = importedFrom('not a file at all')

    expect(read.kind).toBe('declined')
    expect(read.kind === 'declined' ? read.message : '').toContain('lotplanner')
  })

  it('declines a file from a newer app rather than misreading it', () => {
    const ahead = JSON.parse(encodeArtifact({ kind: 'layout', layout: layout() })) as unknown[]
    ahead[1] = CODEC_VERSION + 1

    const read = importedFrom(JSON.stringify({ format: 'lotplanner', artifact: ahead }))

    expect(read.kind).toBe('declined')
    expect(read.kind === 'declined' ? read.message : '').toContain('newer version')
  })
})
