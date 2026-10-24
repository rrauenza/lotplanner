import { SYSTEM_COLLECTION_NAME, systemVehicles } from './collection'
import { countsByVehicle, type Layout } from './layout'
import { KEPT, type Saving } from './saved'
import { tidy } from './text'
import { readVehicle, sameVehicle, type Vehicle } from './vehicle'

/**
 * The visitor's own Vehicle Collections: their actual fleet, kept and reusable.
 *
 * A Vehicle Collection is a name and a set of Vehicles. It is not a reference
 * anything else holds: a Layout embeds its own copies of the Vehicles it uses
 * (ADR 0002), so deleting a Collection here can never break a saved Layout, and
 * this module never has to ask what else might be pointing at it.
 *
 * **The System Collection is not in this list.** It is conjured from the
 * vehicles that ship with the app, so "always present, never editable, never
 * deletable" is structural rather than a rule somebody has to remember: there is
 * no record of it to rename, edit or delete. What is stored, and what is edited
 * here, is only ever the visitor's own.
 *
 * There are no accounts, so a Collection that arrived from somewhere else
 * records the name it came from as descriptive provenance and nothing more:
 * a name to show, so a visitor can tell their own work from somebody else's.
 *
 * Nothing here invents an identity or a clock. An id is handed in by the shell,
 * which is the only place randomness lives.
 */

/** The System Collection's id, which no stored record may claim. */
export const SYSTEM_COLLECTION_ID = 'system'

/** The longest a Collection's name may be, which its box enforces too. */
export const MAXIMUM_COLLECTION_NAME_LENGTH = 48

/** A named, editable set of Vehicles. */
export interface VehicleCollection {
  /**
   * Stable across a rename, because renaming a Collection renames it rather
   * than replacing it. Never the System Collection's id.
   */
  readonly id: string
  readonly name: string
  readonly vehicles: readonly Vehicle[]
  /**
   * The name of the Vehicle Collection this one was received from, as it was
   * called there. Descriptive only: there is no identity behind it, because
   * there are no accounts. Absent on a Collection the visitor made themselves.
   */
  readonly source?: string
}

/** The one Vehicle Collection that ships with the app. Never stored, always here. */
export const SYSTEM_COLLECTION: VehicleCollection = {
  id: SYSTEM_COLLECTION_ID,
  name: SYSTEM_COLLECTION_NAME,
  vehicles: systemVehicles,
}

/** The System Collection first, then the visitor's own, in the order they were made. */
export function allCollections(mine: readonly VehicleCollection[]): readonly VehicleCollection[] {
  return [SYSTEM_COLLECTION, ...mine]
}

/**
 * The visitor's collections after a read that raced an edit.
 *
 * The read of what storage holds starts when the app opens; a collection made in
 * the moment before it answers is not yet in what storage holds. Taking the
 * read's answer alone would discard that collection (and the next write would
 * persist only it, losing everything stored); taking the in-memory list alone
 * would discard the stored work. So both are kept, stored work first and what
 * was made in the meantime after it, which is the order they were made in. A
 * collection storage already held is not duplicated, and the in-memory view of
 * one wins, because it is the more recent.
 */
export function mergedCollections(
  stored: readonly VehicleCollection[],
  made: readonly VehicleCollection[],
): readonly VehicleCollection[] {
  const overwritten = new Set(made.map((each) => each.id))

  return [...stored.filter((each) => !overwritten.has(each.id)), ...made]
}

/**
 * What came of a name someone typed.
 *
 * A result rather than an exception, because a refused name is an ordinary thing
 * and the reason is what the form has to show: a visitor who types the System
 * Collection's name is told whose it is, not simply ignored.
 */
export type Naming =
  | { readonly usable: true; readonly name: string }
  | { readonly usable: false; readonly reason: string }

const NEEDS_A_NAME = 'A Collection needs a name.'
const RESERVED_NAME = `${SYSTEM_COLLECTION_NAME} is the name of the System Collection, so it cannot be taken.`

/**
 * A Collection's name as the visitor meant it, or why it cannot be used.
 *
 * The System Collection's name is compared case-insensitively and after tidying,
 * because two rows that read the same are two rows nobody can tell apart - which
 * is also why an import treats such a name as taken and suffixes it.
 */
export function nameFor(raw: string): Naming {
  const name = tidy(raw).slice(0, MAXIMUM_COLLECTION_NAME_LENGTH)

  if (name === '') {
    return { usable: false, reason: NEEDS_A_NAME }
  }
  if (isTheSystemCollectionsName(name)) {
    return { usable: false, reason: RESERVED_NAME }
  }

  return { usable: true, name }
}

/** A Collection as it may arrive from a file or a link: a name and some Vehicles. */
export interface ArrivedCollection {
  readonly name: string
  readonly vehicles: readonly Vehicle[]
}

/** What an arrival is called when it arrived without a name at all. */
const RECEIVED_COLLECTION_NAME = 'Received collection'

/**
 * A received Collection as a **new** Collection of the visitor's own.
 *
 * An import is always a fork: a new id, the arrived Vehicles copied in, and the
 * arrived name recorded as provenance. It never merges into anything and never
 * overwrites anything, and it never refuses - a name that is already taken, the
 * System Collection's included, is **suffixed** (`Fleet A` becomes `Fleet A (2)`),
 * because arriving with a name somebody here already used is not a reason to lose
 * the vehicles.
 *
 * The id is given rather than made here: inventing an identity is the shell's job.
 */
export function received(
  mine: readonly VehicleCollection[],
  arrived: ArrivedCollection,
  id: string,
): VehicleCollection {
  const asArrived = tidy(arrived.name).slice(0, MAXIMUM_COLLECTION_NAME_LENGTH)
  const wanted = asArrived === '' ? RECEIVED_COLLECTION_NAME : asArrived
  const forked = forkedCollection(mine, wanted, arrived.vehicles, id)

  // Nothing to say about where it came from when it did not say: better a
  // collection with no provenance than one claiming a source that is blank.
  return asArrived === '' ? forked : { ...forked, source: asArrived }
}

/**
 * A Collection of the visitor's own holding these Vehicles, under a free name.
 *
 * The fork both routes take - an arrival from a file or a link, and a Layout's
 * vehicles promoted on request. It makes a new Collection every time and reads
 * what the visitor has only for the names it has taken, which is what makes
 * "never merges, never overwrites" structural rather than a rule to remember.
 */
function forkedCollection(
  mine: readonly VehicleCollection[],
  wanted: string,
  vehicles: readonly Vehicle[],
  id: string,
): VehicleCollection {
  return { id, name: freeName(wanted, [SYSTEM_COLLECTION, ...mine]), vehicles: [...vehicles] }
}

/**
 * The Vehicles a Layout uses that are in none of the visitor's Collections.
 *
 * **By value, not by identity.** A Layout carries copies of its Vehicles
 * (ADR 0002), and after a round trip through storage two of them are not even
 * the same object, so comparing references would call every vehicle missing
 * every time. The System Collection counts as one of the visitor's collections,
 * because a vehicle dragged from the palette is never absent - which is what
 * makes this report mean something rather than appear for every Layout.
 *
 * Listed once each, in the order the Layout first uses them, so "exactly which"
 * is a set rather than one line per Placement.
 */
export function missingFrom(
  mine: readonly VehicleCollection[],
  layout: Layout,
): readonly Vehicle[] {
  const known = allCollections(mine).flatMap((each) => each.vehicles)
  const missing: Vehicle[] = []

  // Counted from the Placements, which is what is drawn: a corrected vehicle is
  // a value no collection holds, and it is still standing on the ground.
  for (const { vehicle: used } of countsByVehicle(layout.placements)) {
    if (!known.some((one) => sameVehicle(one, used))) {
      missing.push(used)
    }
  }

  return missing
}

/**
 * The missing Vehicles adopted into a **new** Collection of the visitor's own.
 *
 * A fork, exactly as an import is: the vehicles go into a Collection that did
 * not exist a moment ago, and nothing the visitor already has is merged into or
 * overwritten (ADR 0002). The copies are taken as they are, which is the point -
 * a Layout's copy is frozen and may differ from anything in a Collection, so
 * what is adopted is what the Layout renders.
 *
 * Named by `nextCollectionName` because the core cannot know what a fleet is
 * for, and the visitor renames it as soon as it appears. There is no provenance,
 * because no one sent it: it came off the ground in front of them.
 */
export function adopted(
  mine: readonly VehicleCollection[],
  vehicles: readonly Vehicle[],
  id: string,
): VehicleCollection {
  return forkedCollection(mine, nextCollectionName(mine), vehicles, id)
}

/**
 * The name to use, given one that may already be taken.
 *
 * Numbered rather than dated, because the core has no clock, and because the
 * number is only there to make the name free rather than to say when it arrived.
 * Compared case-insensitively for the reason the reserved name is: two rows that
 * read the same are not a list anyone can use.
 */
function freeName(name: string, taken: readonly VehicleCollection[]): string {
  const used = new Set(taken.map((each) => each.name.toLowerCase()))

  if (!used.has(name.toLowerCase())) {
    return name
  }

  for (let number = 2; ; number += 1) {
    const candidate = `${name} (${String(number)})`

    if (!used.has(candidate.toLowerCase())) {
      return candidate
    }
  }
}

/**
 * A fingerprint of what is in a Collection.
 *
 * **A duplicate hint, and nothing else.** Nothing here depends on it being
 * right: an import is forked whether this says the arrival is already here or
 * not, so a collision, a stale value or a changed hash is a missed - or
 * over-eager - hint rather than a wrong decision. The canonical text is sorted,
 * because the same fleet in a different order is the same fleet.
 *
 * FNV-1a rather than anything from `crypto`, because the core has no platform
 * APIs and this is not a security boundary.
 *
 * Nothing outside this module's tests calls this or `samenessHint` yet. They are
 * here because a Collection import is allowed to offer a duplicate hint (issue
 * #11, ADR 0002) and this is where that hint would be computed; an import that
 * used it would still fork, so
 * a wrong hint costs a sentence rather than a decision. If no import ever offers
 * one, these and their tests can go together.
 */
export function contentHash(vehicles: readonly Vehicle[]): string {
  const canonical = vehicles
    .map(
      (each) =>
        `${each.name}\u0000${each.shortLabel}\u0000${String(each.widthInches)}\u0000${String(each.lengthInches)}\u0000${String(each.colour)}`,
    )
    .sort()
    .join('\u0001')

  let hash = 0x811c9dc5

  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash.toString(16).padStart(8, '0')
}

/**
 * A Collection the visitor already has that looks like this one, if any.
 *
 * A hint to offer someone, never a reason to do anything: `received` has no way
 * to be given one and never consults this, so whatever it says, the arrival is
 * still forked. Nothing calls it yet; `contentHash` above says why it is here.
 */
export function samenessHint(
  mine: readonly VehicleCollection[],
  arrived: ArrivedCollection,
): VehicleCollection | undefined {
  const hash = contentHash(arrived.vehicles)

  return mine.find((each) => contentHash(each.vehicles) === hash)
}

/**
 * A name for a new Collection that nothing has taken.
 *
 * Numbered because the core has no clock, and the visitor renames it as soon as
 * it appears - the name is a placeholder that has to be a name, not a guess at
 * what this fleet is for.
 */
export function nextCollectionName(mine: readonly VehicleCollection[]): string {
  const used = new Set(mine.map((each) => each.name.toLowerCase()))

  for (let number = 1; ; number += 1) {
    const candidate = `Collection ${String(number)}`

    if (!used.has(candidate.toLowerCase())) {
      return candidate
    }
  }
}

/**
 * The visitor's Collections with one more in them.
 *
 * Kept in the order they were made rather than most-recent-first: this is a
 * library rather than a place someone was just working, and a tab that moves
 * when another is added is a tab nobody can find twice.
 *
 * A Collection under the System Collection's name is refused, so the reserved
 * name cannot be taken by the one route that would write a name down.
 */
export function withCreated(
  mine: readonly VehicleCollection[],
  collection: VehicleCollection,
): readonly VehicleCollection[] {
  if (!nameFor(collection.name).usable) {
    return mine
  }
  if (mine.some((each) => each.id === collection.id)) {
    return mine
  }

  return [...mine, collection]
}

/**
 * The same Collections with one renamed, where it sits.
 *
 * A name that cannot be used leaves the old one in place: a row in a list has to
 * be readable, and a name the System Collection already has cannot be taken even
 * by somebody asking twice.
 */
export function withRenamedCollection(
  mine: readonly VehicleCollection[],
  id: string,
  name: string,
): readonly VehicleCollection[] {
  const named = nameFor(name)

  if (!named.usable) {
    return mine
  }

  return mine.map((each) => (each.id === id ? { ...each, name: named.name } : each))
}

/**
 * The same Collections without one.
 *
 * Only ever the visitor's own, because the System Collection is not in the list
 * this is given: deleting it is not refused, it is not possible.
 */
export function withoutCollection(
  mine: readonly VehicleCollection[],
  id: string,
): readonly VehicleCollection[] {
  return mine.filter((each) => each.id !== id)
}

/** The same Collections with one Vehicle added to one of them. */
export function withVehicle(
  mine: readonly VehicleCollection[],
  id: string,
  vehicle: Vehicle,
): readonly VehicleCollection[] {
  return mine.map((each) =>
    each.id === id && !each.vehicles.some((one) => sameVehicle(one, vehicle))
      ? { ...each, vehicles: [...each.vehicles, vehicle] }
      : each,
  )
}

/**
 * The same Collections with one Vehicle corrected in one of them.
 *
 * The Vehicle is named by value rather than by where it came from, because a
 * Collection's Vehicles are plain values: two of them are two copies, and after
 * a trip through storage they are not even the same object.
 */
export function withEditedCollectionVehicle(
  mine: readonly VehicleCollection[],
  id: string,
  before: Vehicle,
  after: Vehicle,
): readonly VehicleCollection[] {
  return mine.map((each) =>
    each.id === id
      ? {
          ...each,
          vehicles: each.vehicles.map((one) => (sameVehicle(one, before) ? after : one)),
        }
      : each,
  )
}

/** The same Collections with one Vehicle taken out of one of them. */
export function withoutVehicle(
  mine: readonly VehicleCollection[],
  id: string,
  vehicle: Vehicle,
): readonly VehicleCollection[] {
  return mine.map((each) =>
    each.id === id
      ? { ...each, vehicles: each.vehicles.filter((one) => !sameVehicle(one, vehicle)) }
      : each,
  )
}

/** Said when the browser will not keep the visitor's collections. */
export const COLLECTIONS_NOT_KEPT =
  'Nothing will be saved: this browser is not letting the app keep anything. It still works, but closing the page will lose your collections.'

/**
 * What storage has to be able to do.
 *
 * A sibling of the saved work's port rather than a widening of it, because a
 * Collection is not about a Site: a Layout's work is keyed by the place it was
 * made for, and a Collection belongs to the whole browser. `read` is deliberately
 * untyped for the same reason as there: what comes back is whatever was left,
 * possibly by an older version of this app.
 */
export interface CollectionEffects {
  read(): Promise<unknown>
  write(collections: readonly VehicleCollection[]): Promise<void>
}

/** The visitor's Collections, and whether they are being kept at all. */
export async function loadCollections(
  effects: CollectionEffects,
): Promise<{ readonly collections: readonly VehicleCollection[]; readonly saving: Saving }> {
  try {
    return { collections: readCollections(await effects.read()), saving: KEPT }
  } catch {
    return { collections: [], saving: { kept: false, message: COLLECTIONS_NOT_KEPT } }
  }
}

/** Keeping the visitor's Collections, reporting plainly when they were not kept. */
export async function writeCollections(
  collections: readonly VehicleCollection[],
  effects: CollectionEffects,
): Promise<Saving> {
  try {
    await effects.write(collections)
    return KEPT
  } catch {
    return { kept: false, message: COLLECTIONS_NOT_KEPT }
  }
}

/**
 * Everything readable out of what storage gave back.
 *
 * Storage is not trusted, for the reasons the saved work's reader gives: a record
 * can be from an older version of this app, half-written, or put there by hand,
 * and none of that may stop the app opening.
 *
 * Two rules of this module are enforced on the way in, because a record that
 * broke them would break the list rather than only itself:
 *
 * - a record claiming the System Collection's id is dropped, because an identity
 *   that the app already has would make one of the two unreachable;
 * - a record claiming the System Collection's name is renamed, keeping its
 *   Vehicles, because the name cannot be taken and what is worth keeping is the
 *   fleet. Names the visitor typed twice are left as they are: they were allowed
 *   to type them, and taking one away in the dark would be worse than two rows.
 */
export function readCollections(value: unknown): readonly VehicleCollection[] {
  if (!Array.isArray(value)) {
    return []
  }

  const readable: VehicleCollection[] = []

  for (const entry of value) {
    const one = readCollection(entry, readable)

    if (one !== undefined && !readable.some((each) => each.id === one.id)) {
      readable.push(one)
    }
  }

  return readable
}

function readCollection(
  value: unknown,
  kept: readonly VehicleCollection[],
): VehicleCollection | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { id, name, vehicles: stored, source } = value

  if (
    typeof id !== 'string' ||
    id === '' ||
    id === SYSTEM_COLLECTION_ID ||
    typeof name !== 'string'
  ) {
    return undefined
  }

  const tidied = tidy(name).slice(0, MAXIMUM_COLLECTION_NAME_LENGTH)

  // A nameless row has nothing to show, so the record cannot be read at all.
  if (tidied === '') {
    return undefined
  }

  const vehicles = readVehicles(stored)

  if (vehicles === undefined) {
    return undefined
  }

  const read: VehicleCollection = {
    id,
    name: isTheSystemCollectionsName(tidied)
      ? freeName(tidied, [SYSTEM_COLLECTION, ...kept])
      : tidied,
    vehicles,
  }

  const from = typeof source === 'string' ? tidy(source) : ''

  return from === '' ? read : { ...read, source: from.slice(0, MAXIMUM_COLLECTION_NAME_LENGTH) }
}

function readVehicles(value: unknown): readonly Vehicle[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const vehicles: Vehicle[] = []

  for (const entry of value) {
    const one = readVehicle(entry)

    if (one === undefined) {
      return undefined
    }

    vehicles.push(one)
  }

  return vehicles
}

function isTheSystemCollectionsName(name: string): boolean {
  return name.toLowerCase() === SYSTEM_COLLECTION_NAME.toLowerCase()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
