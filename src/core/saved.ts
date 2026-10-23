import type { LatLng, LatLngBounds, Offset, SiteFrame } from './geometry'
import type { Layout, Placement } from './layout'
import { isNumber } from './numbers'
import { tidy } from './text'
import { readVehicle } from './vehicle'

/**
 * Work kept between visits.
 *
 * A Site holds several **named Layouts**, so options for the same place can sit
 * side by side and be compared, and so a layout is not lost to a phone call. The
 * name and the identity belong to the saved work rather than to the arrangement:
 * a Layout is the same rectangle of ground whether it is called "Option A" or
 * nothing at all, and a link carries the arrangement without a name (ADR 0008).
 *
 * There are no timestamps anywhere. The core has no clock, and it turns out not
 * to need one: the list is kept in the order it was worked on, most recent
 * first, which is what "the one I was just in" means and survives the clock
 * changing under it.
 *
 * Storage is reached only through the effects below, so all of this - the rules,
 * the ordering, and what happens when storage is missing or full - is testable
 * against a trivial fake rather than a browser.
 */

/** The longest a Layout's name may be, which its box enforces too. */
export const MAXIMUM_LAYOUT_NAME_LENGTH = 48

/**
 * The shape this version of the app writes to storage.
 *
 * The record is versioned for the reason every artifact that leaves the app is
 * (ADR 0009): a record found in the wild has to be identifiable before it can be
 * migrated, and silently dropping what cannot be recognised would throw away
 * somebody's work the day the shape changes. The Layouts inside an old record
 * carry no version of their own, which is exactly what version 0 means here.
 */
export const SAVED_VERSION = 1

/**
 * A Site's work at rest: the record's own version, around the Layouts.
 *
 * Storage hands back plain data and does not interpret it; the version and the
 * migration live in this module, so the adapter stays a string under a key.
 */
export interface StoredWork {
  readonly version: number
  readonly layouts: readonly SavedLayout[]
}

/**
 * Whether what is on screen will still be there tomorrow.
 *
 * Not a boolean, because the bad news is the whole point of it: the visitor is
 * told plainly that nothing is being kept, and carries on working.
 */
export type Saving = { readonly kept: true } | { readonly kept: false; readonly message: string }

export const KEPT: Saving = { kept: true }

/** Said when the browser will not keep anything, which is not a reason to stop. */
export const NOTHING_KEPT =
  'Nothing will be saved: this browser is not letting the app keep anything. It still works, but closing the page will lose this layout.'

/** A named Layout as it is kept between visits. */
export interface SavedLayout {
  /** Stable across a rename, so renaming is renaming rather than replacing. */
  readonly id: string
  readonly name: string
  readonly layout: Layout
}

/**
 * What storage has to be able to do.
 *
 * `read` is deliberately untyped: what comes back is whatever was left there,
 * possibly by an older version of this app, and turning it into domain values is
 * this module's job rather than storage's.
 */
export interface SavedEffects {
  read(siteId: string): Promise<unknown>
  write(siteId: string, work: StoredWork): Promise<void>
}

/** The Layouts saved for a Site, most recently worked on first. */
export function mostRecentOf(saved: readonly SavedLayout[]): SavedLayout | undefined {
  return saved[0]
}

/** The saved Layout with this id, if the Site still holds it. */
export function savedWith(
  saved: readonly SavedLayout[],
  id: string | undefined,
): SavedLayout | undefined {
  return id === undefined ? undefined : saved.find((each) => each.id === id)
}

/**
 * The Site's saved work with this Layout kept, and moved to the front.
 *
 * Keeping a Layout that is already saved replaces it where it was rather than
 * adding a second one under the same id, which is what makes saving on every
 * edit idempotent.
 */
export function withSaved(
  saved: readonly SavedLayout[],
  entry: SavedLayout,
): readonly SavedLayout[] {
  return [entry, ...saved.filter((each) => each.id !== entry.id)]
}

/**
 * The same work with one Layout renamed, where it sits.
 *
 * A name that tidies away to nothing leaves the old one in place: a row in a
 * list has to be readable, and "untitled" is not what anyone typed.
 */
export function withRenamed(
  saved: readonly SavedLayout[],
  id: string,
  name: string,
): readonly SavedLayout[] {
  const tidied = tidy(name).slice(0, MAXIMUM_LAYOUT_NAME_LENGTH)

  if (tidied === '') {
    return saved
  }

  return saved.map((each) => (each.id === id ? { ...each, name: tidied } : each))
}

/** The same work without one Layout, which cannot break anything else. */
export function withoutSaved(saved: readonly SavedLayout[], id: string): readonly SavedLayout[] {
  return saved.filter((each) => each.id !== id)
}

/**
 * A name for a Layout that has not got one yet, distinct from the others.
 *
 * Numbered rather than dated, because the core has no clock, and because "Layout
 * 2" says what a row of them is, which is the thing a list has to convey.
 */
export function nextName(saved: readonly SavedLayout[]): string {
  const taken = new Set(saved.map((each) => each.name))

  for (let number = saved.length + 1; ; number += 1) {
    const candidate = `Layout ${String(number)}`

    if (!taken.has(candidate)) {
      return candidate
    }
  }
}

/**
 * What an imported Layout is called here: the name it arrived under, if it is
 * free, and a suffixed one if it is not.
 *
 * An import is not a rename, so it must not take a name away from work already
 * on this Site - the same reason a received Collection is suffixed rather than
 * merged. Compared case-insensitively, because two rows that read the same are
 * not a list anyone can use, and with `nextName` for an arrival that carried no
 * name at all so that a blank row never appears.
 */
function importedName(wanted: string | undefined, saved: readonly SavedLayout[]): string {
  const tidied = tidy(wanted ?? '').slice(0, MAXIMUM_LAYOUT_NAME_LENGTH)

  if (tidied === '') {
    return nextName(saved)
  }

  const taken = new Set(saved.map((each) => each.name.toLowerCase()))

  if (!taken.has(tidied.toLowerCase())) {
    return tidied
  }

  for (let number = 2; ; number += 1) {
    const candidate = `${tidied} (${String(number)})`

    if (!taken.has(candidate.toLowerCase())) {
      return candidate
    }
  }
}

/**
 * The Site's work with an imported Layout added under its own id.
 *
 * Kept at the front like any other new work, and given the first free name for
 * what it arrived under. Everything already here is returned untouched: an
 * import adds a Layout, and has no way to replace one, because the caller hands
 * in the id of the thing being added rather than the id of anything present.
 */
export function withImported(
  saved: readonly SavedLayout[],
  layout: Layout,
  wanted: string | undefined,
  id: string,
): readonly SavedLayout[] {
  return withSaved(saved, { id, name: importedName(wanted, saved), layout })
}

/**
 * Everything readable out of what storage gave back.
 *
 * Storage is not trusted: a record can be from an older version of this app, be
 * half-written, or be something a person typed into their developer tools. None
 * of that may stop the app opening, so anything unreadable is dropped and the
 * rest is used - losing one Layout is bad, and refusing to start is worse.
 *
 * Two shapes are read here. A bare list is the record before it was versioned -
 * what this app wrote before ADR 0008's deferral was settled - and is read as
 * version 0 so that work already in the wild keeps working. A numbered record is
 * read only when it is this version: a record from a newer app is dropped rather
 * than guessed at, and a numbered record this version does not know would be one
 * whose migration has not been written. No migration has been needed yet, because
 * version 1 is the first versioned shape.
 *
 * This is also the one place where these values are built from nothing, so it
 * checks shapes rather than only casting: past here a Layout is a Layout.
 */
export function readSaved(value: unknown): readonly SavedLayout[] {
  if (Array.isArray(value)) {
    return readEntries(value)
  }

  if (!isRecord(value)) {
    return []
  }

  const { version, layouts } = value

  // Not guessed at: a record from a newer app may mean anything at all.
  if (typeof version !== 'number' || version !== SAVED_VERSION) {
    return []
  }

  return Array.isArray(layouts) ? readEntries(layouts) : []
}

/** The Layouts out of a list of entries, dropping whatever cannot be read. */
function readEntries(value: readonly unknown[]): readonly SavedLayout[] {
  const readable: SavedLayout[] = []

  for (const entry of value) {
    const one = readSavedLayout(entry)

    if (one !== undefined && !readable.some((each) => each.id === one.id)) {
      readable.push(one)
    }
  }

  return readable
}

/** What a Site's storage holds, and whether it is being kept at all. */
export async function loadSaved(
  siteId: string,
  effects: SavedEffects,
): Promise<{ readonly saved: readonly SavedLayout[]; readonly saving: Saving }> {
  try {
    return { saved: readSaved(await effects.read(siteId)), saving: KEPT }
  } catch {
    return { saved: [], saving: { kept: false, message: NOTHING_KEPT } }
  }
}

/** Keeping the Site's work, reporting plainly when it could not be kept. */
export async function writeSaved(
  siteId: string,
  saved: readonly SavedLayout[],
  effects: SavedEffects,
): Promise<Saving> {
  try {
    // Wrapped with the record's version here rather than in the adapter, so that
    // what storage holds is this module's business and the adapter stays a
    // string under a key (ADR 0008).
    await effects.write(siteId, { version: SAVED_VERSION, layouts: saved })
    return KEPT
  } catch {
    return { kept: false, message: NOTHING_KEPT }
  }
}

function readSavedLayout(value: unknown): SavedLayout | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { id, name, layout: stored } = value

  if (typeof id !== 'string' || id === '' || typeof name !== 'string' || name === '') {
    return undefined
  }

  const layout = readLayout(stored)

  return layout === undefined ? undefined : { id, name, layout }
}

function readLayout(value: unknown): Layout | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { siteId, siteName, origin: place, bounds: area, frame: room, placements: laid } = value

  if (typeof siteId !== 'string' || typeof siteName !== 'string') {
    return undefined
  }

  const origin = readLatLng(place)
  const bounds = readBounds(area)
  const placements = readPlacements(laid)

  if (origin === undefined || bounds === undefined || placements === undefined) {
    return undefined
  }

  const read: Layout = { siteId, siteName, origin, bounds, placements }

  if (room === undefined) {
    return read
  }

  const frame = readFrame(room)

  return frame === undefined ? undefined : { ...read, frame }
}

function readPlacements(value: unknown): readonly Placement[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const placements: Placement[] = []

  for (const entry of value) {
    const placement = readPlacement(entry)

    if (placement === undefined) {
      return undefined
    }

    placements.push(placement)
  }

  return placements
}

function readPlacement(value: unknown): Placement | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { id, vehicle: moving, centre: at, rotationDegrees } = value

  if (typeof id !== 'string') {
    return undefined
  }

  // A Vehicle read out of a record is subject to the Vehicle's own rules, so a
  // value that is not a rectangle this app could have drawn - a zero width, no
  // name - takes the whole Placement with it.
  const vehicle = readVehicle(moving)
  const centre = readOffset(at)

  if (vehicle === undefined || centre === undefined || !isNumber(rotationDegrees)) {
    return undefined
  }

  return { id, vehicle, centre, rotationDegrees }
}

function readOffset(value: unknown): Offset | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { eastMetres, northMetres } = value

  if (!isNumber(eastMetres) || !isNumber(northMetres)) {
    return undefined
  }

  return { eastMetres, northMetres }
}

function readLatLng(value: unknown): LatLng | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { latitude, longitude } = value

  if (!isNumber(latitude) || !isNumber(longitude)) {
    return undefined
  }

  return { latitude, longitude }
}

function readBounds(value: unknown): LatLngBounds | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { southWest: one, northEast: other } = value
  const southWest = readLatLng(one)
  const northEast = readLatLng(other)

  return southWest === undefined || northEast === undefined ? undefined : { southWest, northEast }
}

function readFrame(value: unknown): SiteFrame | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { centre: at, lengthMetres, widthMetres, rotationDegrees } = value
  const centre = readOffset(at)

  if (
    centre === undefined ||
    !isNumber(lengthMetres) ||
    !isNumber(widthMetres) ||
    !isNumber(rotationDegrees)
  ) {
    return undefined
  }

  return { centre, lengthMetres, widthMetres, rotationDegrees }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
