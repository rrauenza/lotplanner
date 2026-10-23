import { decodePayload, type Compressor } from './link'
import type { Layout } from './layout'
import type { Reading } from './codec'
import { routeOf } from './route'

/**
 * The front door: what a page load is, before anything is shown.
 *
 * Reading the fragment and decompressing its payload is three steps that have to
 * agree - the grammar, the codec, and the link - so the glue that joins them
 * lives here and is tested, rather than in `main.ts` where the bundler hides it
 * from the unit tests. A visitor with no fragment, a creator with `#create`, a
 * recipient with a shared Layout, and a broken or too-new link all come back as
 * one of the four answers below, and `main.ts` does nothing but mount.
 */

export type Arrival =
  | { readonly kind: 'visitor' }
  | { readonly kind: 'creator'; readonly siteId: string | undefined }
  | { readonly kind: 'layout'; readonly layout: Layout }
  | { readonly kind: 'declined'; readonly message: string }

/** Said when a link carries something this screen has no way to show yet. */
export const COLLECTION_NOT_OPENED =
  'This link carries a Vehicle Collection. A Collection is shared as a file, which this screen cannot open yet.'

/** What a page load turned out to be. */
export async function arrivalFrom(
  hash: string,
  compressor: Compressor,
  reading?: Reading,
): Promise<Arrival> {
  const route = routeOf(hash)

  if (route === undefined) {
    return { kind: 'visitor' }
  }
  if (route.kind === 'creator') {
    return route
  }
  if (route.artifact === 'collection') {
    // A Collection travels as a link (issue #14 will open it), but there is
    // nowhere in this screen for it to land, and guessing would be worse than
    // saying so.
    return { kind: 'declined', message: COLLECTION_NOT_OPENED }
  }

  const decoded = await decodePayload(route.payload, compressor, reading)

  if (decoded.kind !== 'ok') {
    return { kind: 'declined', message: decoded.message }
  }
  if (decoded.artifact.kind !== 'layout') {
    return { kind: 'declined', message: COLLECTION_NOT_OPENED }
  }

  return { kind: 'layout', layout: decoded.artifact.layout }
}
