import { decodePayload, type Compressor } from './link'
import { decodeFile } from './file'
import type { ArrivedCollection, Reading } from './codec'
import type { Layout } from './layout'
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
 *
 * A file (issue #14) is the other way in, and it is decided here too
 * (`importedFrom`), from the same codec: the difference is only who opens it -
 * the visitor, after the app is up, through a file input rather than a fragment.
 * A Layout is a Layout whichever way it arrived; a Collection is refused by link
 * and kept by file, which is the one place the two ways in deliberately differ.
 */

export type Arrival =
  | { readonly kind: 'visitor' }
  | { readonly kind: 'creator'; readonly siteId: string | undefined }
  | { readonly kind: 'layout'; readonly layout: Layout }
  | { readonly kind: 'declined'; readonly message: string }

/** Said when a link carries something this screen has no way to show yet. */
export const COLLECTION_NOT_OPENED =
  'This link carries a Vehicle Collection. Opening a Collection is not part of this screen yet.'

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

/**
 * What an imported file is, decided the same way a link's is.
 *
 * A file arrives by an act of the visitor rather than by a page load, so it is
 * read after the app is already up rather than by `arrivalFrom` - but it is
 * decided in the same place, from the same codec, so a Layout imported from a
 * file opens with the same shape a Layout from a link opens with, manifest or no
 * manifest.
 *
 * It has one answer a link does not. A Collection that arrives by *link* is
 * refused, because opening a link must never change what the recipient has
 * (issue #13); a Collection that arrives by *file* is a deliberate import, so it
 * comes back as a Collection to keep rather than as a refusal.
 */
export type Imported =
  | { readonly kind: 'layout'; readonly layout: Layout; readonly name: string | undefined }
  | { readonly kind: 'collection'; readonly collection: ArrivedCollection }
  | { readonly kind: 'declined'; readonly message: string }

/** What a file turned out to be: a Layout to open, a Collection to keep, or why. */
export function importedFrom(text: string, reading?: Reading): Imported {
  const read = decodeFile(text, reading)

  if (read.kind !== 'ok') {
    return { kind: 'declined', message: read.message }
  }

  return read.artifact.kind === 'layout'
    ? { kind: 'layout', layout: read.artifact.layout, name: read.name }
    : { kind: 'collection', collection: read.artifact.collection }
}
