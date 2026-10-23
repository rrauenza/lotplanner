import { describe, expect, it } from 'vitest'

import { arrivalFrom, COLLECTION_NOT_OPENED } from './arrival'
import { CODEC_VERSION, encodeArtifact, type Artifact } from './codec'
import { testCompressor } from './deflate-for-tests'
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

  it('declines a Collection link, which travels but has nowhere to land yet', async () => {
    const payload = await encodePayload(
      { kind: 'collection', collection: { name: 'Yard', vehicles: [SEMI] } },
      testCompressor,
    )

    expect(await arrivalFrom(`#collection/${payload}`, testCompressor)).toStrictEqual({
      kind: 'declined',
      message: COLLECTION_NOT_OPENED,
    })
  })
})
