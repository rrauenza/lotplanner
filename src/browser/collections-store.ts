import type { CollectionEffects, VehicleCollection } from '../core/vehicle-collection'

/**
 * Where the visitor's own Vehicle Collections are kept between visits.
 *
 * The same choice as the Site's saved work, for the same reason (ADR 0008): a
 * few kilobytes that have to be readable the moment the app opens, so a string
 * under a key rather than a database. One record for the whole list, because the
 * order of the list is part of it - the order they were made - and a second
 * record holding that order could disagree with the first.
 *
 * There is no Site in the key, because a collection is not about a place: it is
 * the visitor's, wherever they are working.
 *
 * Deliberately untested, along with the other adapters: a test here would be
 * testing localStorage rather than this app. What is worth testing - what
 * happens when storage refuses, and what to make of text left by an older
 * version - is tested in the core against a fake.
 */

const KEY = 'lotplanner:collections'

/**
 * Whatever was left, as a value rather than as text.
 *
 * Text that will not parse is reported as nothing at all rather than as a
 * failure, for the reason the saved work's reader gives: a half-written record
 * is a reason to start again, not a reason to leave the same broken record there
 * every time someone comes back. The next save overwrites it.
 */
export function readStoredCollections(): Promise<unknown> {
  const stored = localStorage.getItem(KEY)

  if (stored === null) {
    return Promise.resolve(undefined)
  }

  try {
    return Promise.resolve(JSON.parse(stored) as unknown)
  } catch {
    return Promise.resolve(undefined)
  }
}

export function writeStoredCollections(collections: readonly VehicleCollection[]): Promise<void> {
  localStorage.setItem(KEY, JSON.stringify(collections))

  return Promise.resolve()
}

export const collectionEffects: CollectionEffects = {
  read: readStoredCollections,
  write: writeStoredCollections,
}
