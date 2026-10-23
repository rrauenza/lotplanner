import type { SavedEffects, SavedLayout } from '../core/saved'

/**
 * Where a Site's saved work is kept between visits.
 *
 * localStorage rather than IndexedDB, because working saves are small - a Site
 * with a handful of Layouts is a few kilobytes - and because reading one never
 * needs to wait on a database before a Site can be shown. The picture, which is
 * megabytes, goes to IndexedDB instead (see imagery-store).
 *
 * Deliberately untested, along with the other adapters: a test here would be
 * testing localStorage rather than this app. What is worth testing - what
 * happens when storage refuses, and what to make of text left by an older
 * version - is tested in the core against a fake.
 */

const PREFIX = 'lotplanner:saved:'

function keyFor(siteId: string): string {
  return `${PREFIX}${siteId}`
}

/**
 * Whatever was left for this Site, as a value rather than as text.
 *
 * Text that will not parse is reported as nothing at all rather than as a
 * failure: a half-written record is a reason to start again, not a reason to
 * tell someone their browser is broken and then leave the same record there
 * every time they come back. The next save overwrites it.
 */
export function readSavedWork(siteId: string): Promise<unknown> {
  const stored = localStorage.getItem(keyFor(siteId))

  if (stored === null) {
    return Promise.resolve(undefined)
  }

  try {
    return Promise.resolve(JSON.parse(stored) as unknown)
  } catch {
    return Promise.resolve(undefined)
  }
}

/**
 * Keep the Site's work, all of it, in one record.
 *
 * One record per Site rather than one per Layout, because the order of the list
 * is part of the work - it is what "the one I was just in" means - and a second
 * record holding that order could disagree with the first.
 */
export function writeSavedWork(siteId: string, saved: readonly SavedLayout[]): Promise<void> {
  localStorage.setItem(keyFor(siteId), JSON.stringify(saved))

  return Promise.resolve()
}

export const savedEffects: SavedEffects = {
  read: readSavedWork,
  write: writeSavedWork,
}
