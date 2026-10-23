import { describe, expect, it } from 'vitest'

import {
  GEOCODING_IDLE,
  candidatesFrom,
  findCandidates,
  type GeocodingEffects,
  type Candidate,
} from './geocoding'

/**
 * A geocoder's answer as it arrives: positions in strings, a short name where
 * the service has one, and a full address for every record.
 */
const ANSWER = [
  {
    lat: '37.3318',
    lon: '-122.0312',
    name: 'Applebee lot',
    display_name: 'Applebee lot, 10123 N Wolfe Rd, Cupertino, California, United States',
  },
  {
    lat: 37.32,
    lon: -122.03,
    display_name: '1 Infinite Loop, Cupertino, California, United States',
  },
]

describe('candidatesFrom', () => {
  it('reads a position out of strings or numbers alike', () => {
    expect(candidatesFrom(ANSWER)).toStrictEqual([
      {
        name: 'Applebee lot',
        address: 'Applebee lot, 10123 N Wolfe Rd, Cupertino, California, United States',
        position: { latitude: 37.3318, longitude: -122.0312 },
      },
      {
        name: '1 Infinite Loop',
        address: '1 Infinite Loop, Cupertino, California, United States',
        position: { latitude: 37.32, longitude: -122.03 },
      },
    ] satisfies readonly Candidate[])
  })

  it('takes the first part of an address as the name when there is no short one', () => {
    const [candidate] = candidatesFrom([
      { lat: '37.32', lon: '-122.03', display_name: 'A street, A town, A country' },
    ])

    expect(candidate?.name).toBe('A street')
    expect(candidate?.address).toBe('A street, A town, A country')
  })

  it('lists a candidate with a name but no address, since only a Site needs no address', () => {
    const candidate = candidatesFrom([{ lat: 1, lon: 2, name: 'Somewhere' }])[0]

    expect(candidate).toStrictEqual({ name: 'Somewhere', position: { latitude: 1, longitude: 2 } })
  })

  it('answers an empty list when there is nothing in the answer', () => {
    expect(candidatesFrom([])).toStrictEqual([])
  })

  it('answers an empty list rather than failing on an answer that is not a list', () => {
    expect(candidatesFrom(null)).toStrictEqual([])
    expect(candidatesFrom({ error: 'no' })).toStrictEqual([])
    expect(candidatesFrom('unexpected')).toStrictEqual([])
    expect(candidatesFrom(undefined)).toStrictEqual([])
  })

  it('drops a record it cannot place or cannot show, keeping the rest', () => {
    const usable = { lat: '1', lon: '2', display_name: 'Somewhere' }

    expect(
      candidatesFrom([
        'not a record',
        { lon: 2, display_name: 'no position' },
        { lat: 1, display_name: 'no longitude' },
        { lat: 'north', lon: 2, display_name: 'position is not a number' },
        { lat: 'NaN', lon: 2, display_name: 'position is not a number either' },
        { lat: 91, lon: 2, display_name: 'off the earth' },
        { lat: 1, lon: 181, display_name: 'past the last meridian' },
        { lat: 1, lon: 2 },
        { lat: 1, lon: 2, name: '  ', display_name: '   ' },
        usable,
      ]),
    ).toStrictEqual([
      { name: 'Somewhere', address: 'Somewhere', position: { latitude: 1, longitude: 2 } },
    ])
  })
})

/**
 * The geocoder as the core sees it: a variable holding whatever the service is
 * to answer, and a way to make it refuse. No mocking framework, because the
 * port is one function wide.
 */
class FakeGeocoder implements GeocodingEffects {
  answer: unknown
  fails = false
  asked: string[] = []

  constructor(answer: unknown) {
    this.answer = answer
  }

  search(query: string): Promise<unknown> {
    this.asked.push(query)

    return this.fails ? Promise.reject(new Error('no')) : Promise.resolve(this.answer)
  }
}

describe('findCandidates', () => {
  it('asks for what the creator typed, tidied', async () => {
    const geocoder = new FakeGeocoder(ANSWER)

    const state = await findCandidates('  Cupertino  ', geocoder)

    expect(geocoder.asked).toStrictEqual(['Cupertino'])
    expect(state).toStrictEqual({
      status: 'found',
      candidates: [
        {
          name: 'Applebee lot',
          address: 'Applebee lot, 10123 N Wolfe Rd, Cupertino, California, United States',
          position: { latitude: 37.3318, longitude: -122.0312 },
        },
        {
          name: '1 Infinite Loop',
          address: '1 Infinite Loop, Cupertino, California, United States',
          position: { latitude: 37.32, longitude: -122.03 },
        },
      ],
    })
  })

  it('does not spend a request on an address nobody typed', async () => {
    const geocoder = new FakeGeocoder(ANSWER)

    expect(await findCandidates('   ', geocoder)).toStrictEqual({ status: 'found', candidates: [] })
    expect(geocoder.asked).toStrictEqual([])
  })

  it('reports a search that found nothing as an answer, not a failure', async () => {
    expect(await findCandidates('Nowhere at all', new FakeGeocoder([]))).toStrictEqual({
      status: 'found',
      candidates: [],
    })
  })

  it('reports a search that did not answer, rather than throwing at the form', async () => {
    const geocoder = new FakeGeocoder(ANSWER)
    geocoder.fails = true

    const state = await findCandidates('Cupertino', geocoder)

    expect(state.status).toBe('failed')
    expect(state).toStrictEqual({ status: 'failed', message: 'The place search did not answer.' })
  })

  it('reports an answer it cannot read as finding nothing', async () => {
    expect(await findCandidates('Cupertino', new FakeGeocoder({ broken: true }))).toStrictEqual({
      status: 'found',
      candidates: [],
    })
  })

  it('begins idle', () => {
    expect(GEOCODING_IDLE).toStrictEqual({ status: 'idle' })
  })
})
