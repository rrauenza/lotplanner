import type { GeocodingEffects } from '../core/geocoding'

/**
 * Finding a place by its address, for the creator mode alone.
 *
 * OpenStreetMap's Nominatim, which is keyless and answers the shape the core
 * reads: a list of records with a position, a display name and often a short
 * name. It is the only service the app reaches that is not USGS's, and the
 * module is only ever loaded by the creator's own chunk, so a visitor neither
 * reaches it nor downloads it.
 *
 * The usage policy is met without a key or a made-up identity. Identification:
 * a cross-origin request carries the page's `Referer` under the browser's
 * default referrer policy, which is this app's origin and nothing more - the
 * page and its path are stripped - so it names who is asking without naming
 * where in the app they are. That is enough for a keyless service, and no header
 * is grafted on to say more. Pacing: the policy asks for at most about one
 * request a second, and the caller searches on submit rather than as someone
 * types, so a person cannot outpace it by typing. The core decides that pacing
 * is the caller's job (`GeocodingEffects`), and the creator form is the only
 * caller there is.
 *
 * Deliberately untested, along with the other adapters: a test here would be a
 * test of Nominatim and of `fetch`, and a real request would spend the shared
 * service's goodwill on a test suite. What an answer *means* is decided in the
 * core and covered there.
 */

const SEARCH_URL = 'https://nominatim.openstreetmap.org/search'

/** A short list, because the choice is between a handful of nearby candidates. */
const RESULT_LIMIT = 8

export const geocodingEffects: GeocodingEffects = {
  async search(query: string): Promise<unknown> {
    const url = new URL(SEARCH_URL)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', String(RESULT_LIMIT))
    url.searchParams.set('q', query)

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`The geocoder answered ${String(response.status)}`)
    }

    return await response.json()
  },
}
