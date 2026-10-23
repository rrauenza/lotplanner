import { describe, expect, it } from 'vitest'

import { encodeArtifact, type Artifact } from './codec'
import { testCompressor } from './deflate-for-tests'
import { boundsForExtent } from './geometry'
import { type Layout, type Placement } from './layout'
import { decodePayload, encodePayload, fromBase64Url, toBase64Url } from './link'
import { vehicle, type Vehicle } from './vehicle'

/**
 * The link's own half of sharing: compression, the spelling of the bytes, and
 * the size a link is allowed.
 *
 * Compression is an effect, so a real deflate is injected here exactly as the
 * browser's is in the app - which is what lets the size the ticket cares about
 * be measured rather than guessed. Node's raw deflate and the browser's
 * `deflate-raw` are the same algorithm, so the figure below is the figure the
 * app produces; the app's own adapter is exercised in the end-to-end suite.
 */

const SEMI = vehicle({
  name: 'Semi + 53 ft trailer',
  shortLabel: 'Semi',
  widthInches: 102,
  lengthInches: 840,
  colour: '#ef4444',
})
const COACH = vehicle({
  name: 'Coach (45 ft, MCI J4500)',
  shortLabel: 'Coach',
  widthInches: 102,
  lengthInches: 547,
  colour: '#22c55e',
})
const EXPLORER = vehicle({
  name: 'Car / SUV (Ford Explorer)',
  shortLabel: 'SUV',
  widthInches: 79,
  lengthInches: 199,
  colour: '#3b82f6',
})
const TRUCK = vehicle({
  name: 'F-250 + utility trailer',
  shortLabel: 'F-250',
  widthInches: 84,
  lengthInches: 524,
  colour: '#a855f7',
})

describe('the bytes of a link', () => {
  it('spells them unpadded base64url, with no character a URL would reserve', () => {
    // The bytes that would produce '+' and '/' in standard base64, and '=' as
    // padding, so the alphabet swap and the stripping are both exercised.
    const bytes = Uint8Array.from([0xfb, 0xff, 0xbf, 0x00, 0xff])

    expect(toBase64Url(bytes)).toBe('-_-_AP8')
    expect(toBase64Url(bytes)).not.toContain('=')
    expect(toBase64Url(bytes)).not.toContain('+')
    expect(toBase64Url(bytes)).not.toContain('/')
  })

  it('reads its own spelling back exactly', () => {
    for (const bytes of [
      Uint8Array.from([]),
      Uint8Array.from([0]),
      Uint8Array.from([0, 1]),
      Uint8Array.from([0, 1, 2]),
      Uint8Array.from({ length: 256 }, (_, at) => at),
    ]) {
      expect(fromBase64Url(toBase64Url(bytes))).toStrictEqual(bytes)
    }
  })

  it('refuses text that is not this spelling rather than inventing bytes', () => {
    expect(fromBase64Url('a b')).toBeUndefined()
    expect(fromBase64Url('abc+')).toBeUndefined()
    expect(fromBase64Url('abcd=')).toBeUndefined()
    // One leftover character cannot be a byte, so it is not a payload.
    expect(fromBase64Url('a')).toBeUndefined()
  })
})

describe('a payload a link can carry', () => {
  it('round-trips an artifact through real compression', async () => {
    const layout = crowded()
    const artifact: Artifact = { kind: 'layout', layout }
    const payload = await encodePayload(artifact, testCompressor)
    const read = await decodePayload(payload, testCompressor)

    expect(read.kind).toBe('ok')
    expect(read.kind === 'ok' ? read.artifact.kind : '').toBe('layout')
  })

  it('says so rather than throwing when the payload is not compressed text', async () => {
    expect((await decodePayload('!!!!', testCompressor)).kind).toBe('unreadable')

    // Valid base64url that is not deflate at all.
    const noise = toBase64Url(Uint8Array.from([1, 2, 3, 4, 5]))
    expect((await decodePayload(noise, testCompressor)).kind).toBe('unreadable')
  })

  it('passes the version refusal straight through, so a link can say it is too new', async () => {
    const ahead = JSON.parse(encodeArtifact({ kind: 'layout', layout: crowded() })) as unknown[]
    ahead[1] = 99

    const payload = toBase64Url(await testCompressor.deflate(JSON.stringify(ahead)))

    expect((await decodePayload(payload, testCompressor)).kind).toBe('too-new')
  })
})

describe('the size a link is allowed', () => {
  it('makes a 40-placement layout a link of about 750 characters', async () => {
    // The ticket's number. Measured with the real deflate and the real prefix a
    // deployed link wears, and asserted with room on both sides because deflate
    // output shifts a character or two between zlib versions.
    const layout = crowded()
    const payload = await encodePayload({ kind: 'layout', layout }, testCompressor)
    const link = `https://www.shroop.net/lotplanner/#layout/${payload}`

    expect(layout.placements).toHaveLength(40)
    // Measured at 672 for this fixture, prefix and all: comfortably inside the
    // roughly 750 the ticket allows, so the bound is generous on purpose.
    expect(link.length).toBeGreaterThan(550)
    expect(link.length).toBeLessThan(750)
  })
})

/** A plausible lot: four kinds of vehicle, in rows, with the small jitter a person working by eye leaves. */
function crowded(): Layout {
  const vehicles: readonly Vehicle[] = [SEMI, COACH, SEMI, TRUCK, EXPLORER, SEMI, COACH, EXPLORER]

  const placements: Placement[] = []

  for (let index = 0; index < 40; index += 1) {
    const row = Math.floor(index / 8)
    const column = index % 8

    placements.push({
      id: `p${String(index)}`,
      vehicle: vehicles[index % vehicles.length] ?? SEMI,
      centre: {
        eastMetres: Math.round((-56 + column * 16 + ((index * 7) % 5) * 0.1) * 100) / 100,
        northMetres: Math.round((-34 + row * 17 + ((index * 3) % 7) * 0.1) * 100) / 100,
      },
      rotationDegrees: Math.round((90.3 + ((index % 4) - 1) * 0.2) * 10) / 10,
    })
  }

  const origin = { latitude: 37.3200301, longitude: -122.0310771 }
  const frame = {
    centre: { eastMetres: 0.4, northMetres: -0.7 },
    lengthMetres: 137,
    widthMetres: 98,
    rotationDegrees: 90.3,
  }

  return {
    siteId: 'cupertino-sample',
    siteName: 'Cupertino sample',
    origin,
    bounds: boundsForExtent(origin, {
      centre: frame.centre,
      halfEastMetres: 218.5,
      halfNorthMetres: 199,
    }),
    frame,
    placements,
  }
}
