import type { LatLng, LatLngBounds, SiteFrame } from './geometry'
import type { Layout, Placement } from './layout'
import { vehicle, type Vehicle } from './vehicle'
import type { ArrivedCollection } from './vehicle-collection'

/**
 * The codec: how a Layout or a Collection is spelled when it leaves this app.
 *
 * Two things travel from here - a link and, through the same shape, a file
 * (issue #14) - so this knows nothing about either. It turns an artifact into
 * compact JSON and back, and nothing more; compression, base64url and the URL
 * are the link's business and live in link.ts.
 *
 * The spelling is deliberately hostile to a reader's eyes and kind to a link's
 * budget: arrays rather than objects, so no field name is paid for, and every
 * position is quantised to the centimetre - far below the ground one imagery
 * pixel covers at the sharpest zoom a Site opens at. A Layout is a plan of where
 * vehicles go, not a survey, and the quantisation costs nothing anyone can see
 * while roughly halving the link. Rotations are quantised to a tenth of a degree
 * for the same reason.
 *
 * **The one decision that cannot be retrofitted is the version field**, because
 * a shape in the wild with no version cannot be identified as anything. Every
 * artifact carries one, a reader migrates what it can, ignores fields it does
 * not know, and refuses politely - rather than misreading - a version newer than
 * itself. See ADR 0009.
 */

/** The shape this version of the app writes. Bumped whenever the wire shape changes. */
export const CODEC_VERSION = 1

/**
 * A Vehicle Collection as it travels: its name and the vehicles in it, and
 * nothing local to the browser it came from. `ArrivedCollection` is the same
 * shape the Collection core reads an import into (issue #11), so a Collection
 * arriving by link and one arriving by file are one thing.
 */
export type { ArrivedCollection }

/** What can be written out and read back whole. */
export type Artifact =
  | { readonly kind: 'layout'; readonly layout: Layout }
  | { readonly kind: 'collection'; readonly collection: ArrivedCollection }

/**
 * What reading gave back.
 *
 * Refusal is not an error: an artifact from a newer app is a normal thing to
 * meet, and the only honest answer is to say so. A result rather than a thrown
 * exception, so the caller cannot forget to handle it.
 */
export type Decoded =
  | { readonly kind: 'ok'; readonly artifact: Artifact }
  | { readonly kind: 'unreadable'; readonly message: string }
  | { readonly kind: 'too-new'; readonly message: string }

/** Said when the reader is older than whatever wrote the artifact. */
export const TOO_NEW =
  'This link was made by a newer version of the app than the one you are using. Open it in an up-to-date app, or ask the sender to share a file instead.'

/** Said when the text is not an artifact this reader can make sense of at all. */
export const UNREADABLE =
  'This does not look like a link or a file this app can open. It may be incomplete, or from an app that writes a different shape.'

/**
 * One version's fields, brought forward to the next.
 *
 * Versioned by where it starts, so `migrations[0]` lifts a version 0 artifact to
 * version 1. Reading an older artifact runs these in turn before the reader sees
 * anything, which is what keeps an old link opening after an update.
 */
export type Migration = (fields: readonly unknown[]) => readonly unknown[]

/** No migration is needed yet: this is the first shape that has ever travelled. */
export const CODEC_MIGRATIONS: readonly Migration[] = []

/**
 * How a reader is set up. Both are optional: with nothing given, no migration is
 * run and the reader names its own Placements.
 */
export interface Reading {
  readonly migrations?: readonly Migration[]
  /**
   * Makes the ids Placements need on this side. They are deliberately not on
   * the wire: an id is this session's handle on a Placement, and it saves
   * characters that nothing else can use.
   */
  readonly newId?: () => string
}

/**
 * The tuple indices the writing and the reading below have to agree about,
 * counted after the kind and the version, which are read off the front and
 * sliced away before anything else.
 */
const SITE_ID = 0
const SITE_NAME = 1
const ORIGIN = 2
const BOUNDS = 3
const FRAME = 4
const VEHICLES = 5
const PLACEMENTS = 6

const CENTIMETRES_PER_METRE = 100
const TENTHS_PER_DEGREE = 10

/**
 * The artifact as its fields, before they are spelled as text.
 *
 * A link spells these as the whole of its text; a file (issue #14) puts them
 * inside its envelope. Both hand the same fields to the same reader, which is
 * what keeps one version field and one migration chain rather than two.
 */
export function encodeArtifactFields(artifact: Artifact): readonly unknown[] {
  return artifact.kind === 'layout'
    ? layoutFields(artifact.layout)
    : collectionFields(artifact.collection)
}

/** The compact spelling of an artifact, ready to be compressed. */
export function encodeArtifact(artifact: Artifact): string {
  return JSON.stringify(encodeArtifactFields(artifact))
}

/** The artifact a text holds, or why it could not be read. */
export function decodeArtifact(text: string, reading: Reading = {}): Decoded {
  const parsed = parse(text)

  return parsed === undefined
    ? { kind: 'unreadable', message: UNREADABLE }
    : decodeArtifactFields(parsed, reading)
}

/**
 * The artifact some already-parsed fields hold, or why they could not be read.
 *
 * The reader itself, separate from the parsing of text, so that a file - whose
 * artifact arrives already parsed, inside its envelope - is read by this very
 * function rather than by a second one that might drift from it.
 */
export function decodeArtifactFields(parsed: readonly unknown[], reading: Reading = {}): Decoded {
  const [kind, version, ...body] = parsed

  if (typeof kind !== 'string' || typeof version !== 'number' || !Number.isInteger(version)) {
    return { kind: 'unreadable', message: UNREADABLE }
  }
  if (version > CODEC_VERSION) {
    return { kind: 'too-new', message: TOO_NEW }
  }

  const fields = migrate(body, version, reading.migrations ?? CODEC_MIGRATIONS)

  if (fields === undefined) {
    return { kind: 'unreadable', message: UNREADABLE }
  }

  const newId = reading.newId ?? countingIds()

  if (kind === 'layout') {
    const layout = readLayout(fields, newId)
    return layout === undefined
      ? { kind: 'unreadable', message: UNREADABLE }
      : { kind: 'ok', artifact: { kind: 'layout', layout } }
  }
  if (kind === 'collection') {
    const collection = readCollection(fields)
    return collection === undefined
      ? { kind: 'unreadable', message: UNREADABLE }
      : { kind: 'ok', artifact: { kind: 'collection', collection } }
  }

  return { kind: 'unreadable', message: UNREADABLE }
}

function layoutFields(layout: Layout): readonly unknown[] {
  const vehicles: Vehicle[] = []
  const indexOf = new Map<Vehicle, number>()

  const placements = layout.placements.map((placement) => {
    let index = indexOf.get(placement.vehicle)

    if (index === undefined) {
      index = vehicles.length
      vehicles.push(placement.vehicle)
      indexOf.set(placement.vehicle, index)
    }

    return [
      index,
      centimetres(placement.centre.eastMetres),
      centimetres(placement.centre.northMetres),
      tenths(placement.rotationDegrees),
    ]
  })

  return [
    'layout',
    CODEC_VERSION,
    layout.siteId,
    layout.siteName,
    [layout.origin.latitude, layout.origin.longitude],
    [
      [layout.bounds.southWest.latitude, layout.bounds.southWest.longitude],
      [layout.bounds.northEast.latitude, layout.bounds.northEast.longitude],
    ],
    layout.frame === undefined ? null : frameFields(layout.frame),
    vehicles.map(vehicleFields),
    placements,
  ]
}

function collectionFields(collection: ArrivedCollection): readonly unknown[] {
  return ['collection', CODEC_VERSION, collection.name, collection.vehicles.map(vehicleFields)]
}

function frameFields(frame: SiteFrame): readonly unknown[] {
  return [
    centimetres(frame.centre.eastMetres),
    centimetres(frame.centre.northMetres),
    centimetres(frame.lengthMetres),
    centimetres(frame.widthMetres),
    tenths(frame.rotationDegrees),
  ]
}

function vehicleFields(carried: Vehicle): readonly unknown[] {
  return [
    carried.name,
    carried.shortLabel,
    carried.widthInches,
    carried.lengthInches,
    carried.colour,
  ]
}

function readLayout(fields: readonly unknown[], newId: () => string): Layout | undefined {
  const siteId = asString(fields[SITE_ID])
  const siteName = asString(fields[SITE_NAME])
  const origin = readLatLng(fields[ORIGIN])
  const bounds = readBounds(fields[BOUNDS])

  if (
    siteId === undefined ||
    siteName === undefined ||
    origin === undefined ||
    bounds === undefined
  ) {
    return undefined
  }

  const vehicles = readVehicles(fields[VEHICLES])

  if (vehicles === undefined) {
    return undefined
  }

  const placements = readPlacements(fields[PLACEMENTS], vehicles, newId)

  if (placements === undefined) {
    return undefined
  }

  const layout: Layout = { siteId, siteName, origin, bounds, placements }

  if (fields[FRAME] === null || fields[FRAME] === undefined) {
    return layout
  }

  const frame = readFrame(fields[FRAME])

  return frame === undefined ? undefined : { ...layout, frame }
}

function readCollection(fields: readonly unknown[]): ArrivedCollection | undefined {
  const name = asString(fields[0])
  const vehicles = readVehicles(fields[1])

  return name === undefined || vehicles === undefined ? undefined : { name, vehicles }
}

function readVehicles(value: unknown): readonly Vehicle[] | undefined {
  const entries = asArray(value)

  if (entries === undefined) {
    return undefined
  }

  const vehicles: Vehicle[] = []

  for (const entry of entries) {
    const read = readVehicle(entry)

    if (read === undefined) {
      return undefined
    }

    vehicles.push(read)
  }

  return vehicles
}

function readVehicle(value: unknown): Vehicle | undefined {
  const fields = asArray(value)

  if (fields === undefined) {
    return undefined
  }

  const [name, shortLabel, widthInches, lengthInches, colour] = fields

  if (
    typeof name !== 'string' ||
    typeof shortLabel !== 'string' ||
    !isNumber(widthInches) ||
    !isNumber(lengthInches) ||
    !isNumber(colour)
  ) {
    return undefined
  }

  // The constructor is the only authority on what a Vehicle may be, so a record
  // that could never have been created is dropped here for the same reason.
  try {
    return vehicle({ name, shortLabel, widthInches, lengthInches, colour })
  } catch {
    return undefined
  }
}

function readPlacements(
  value: unknown,
  vehicles: readonly Vehicle[],
  newId: () => string,
): readonly Placement[] | undefined {
  const entries = asArray(value)

  if (entries === undefined) {
    return undefined
  }

  const placements: Placement[] = []

  for (const entry of entries) {
    const fields = asArray(entry)

    if (fields === undefined) {
      return undefined
    }

    const [which, eastCentimetres, northCentimetres, rotationTenths] = fields
    const carried = isNumber(which) ? vehicles[which] : undefined

    if (
      carried === undefined ||
      !isNumber(eastCentimetres) ||
      !isNumber(northCentimetres) ||
      !isNumber(rotationTenths)
    ) {
      return undefined
    }

    placements.push({
      id: newId(),
      vehicle: carried,
      centre: { eastMetres: metres(eastCentimetres), northMetres: metres(northCentimetres) },
      rotationDegrees: degrees(rotationTenths),
    })
  }

  return placements
}

function readFrame(value: unknown): SiteFrame | undefined {
  const fields = asArray(value)

  if (fields === undefined) {
    return undefined
  }

  const [eastCentimetres, northCentimetres, lengthCentimetres, widthCentimetres, rotationTenths] =
    fields

  if (
    !isNumber(eastCentimetres) ||
    !isNumber(northCentimetres) ||
    !isNumber(lengthCentimetres) ||
    !isNumber(widthCentimetres) ||
    !isNumber(rotationTenths)
  ) {
    return undefined
  }

  return {
    centre: { eastMetres: metres(eastCentimetres), northMetres: metres(northCentimetres) },
    lengthMetres: metres(lengthCentimetres),
    widthMetres: metres(widthCentimetres),
    rotationDegrees: degrees(rotationTenths),
  }
}

function readLatLng(value: unknown): LatLng | undefined {
  const fields = asArray(value)

  if (fields === undefined) {
    return undefined
  }

  const [latitude, longitude] = fields

  return isNumber(latitude) && isNumber(longitude) ? { latitude, longitude } : undefined
}

function readBounds(value: unknown): LatLngBounds | undefined {
  const fields = asArray(value)

  if (fields === undefined) {
    return undefined
  }

  const southWest = readLatLng(fields[0])
  const northEast = readLatLng(fields[1])

  return southWest === undefined || northEast === undefined ? undefined : { southWest, northEast }
}

function migrate(
  fields: readonly unknown[],
  from: number,
  migrations: readonly Migration[],
): readonly unknown[] | undefined {
  let carried = fields

  for (let version = from; version < CODEC_VERSION; version += 1) {
    const migration = migrations[version]

    if (migration === undefined) {
      return undefined
    }

    carried = migration(carried)
  }

  return carried
}

/**
 * Ids for the Placements a Layout arrived with, when nothing else was given.
 *
 * Distinct within the Layout, which is all a selection needs: a reader must not
 * ask for a clock or a random number to be pure, and these are neither.
 */
function countingIds(): () => string {
  let next = 0

  return () => {
    next += 1
    return `placement-${String(next)}`
  }
}

function centimetres(metres: number): number {
  return Math.round(metres * CENTIMETRES_PER_METRE)
}

function metres(centimetres: number): number {
  return centimetres / CENTIMETRES_PER_METRE
}

function tenths(degrees: number): number {
  return Math.round(degrees * TENTHS_PER_DEGREE)
}

function degrees(tenths: number): number {
  return tenths / TENTHS_PER_DEGREE
}

function parse(text: string): readonly unknown[] | undefined {
  try {
    const value: unknown = JSON.parse(text)

    return Array.isArray(value) ? value : undefined
  } catch {
    return undefined
  }
}

function asArray(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Finite, because a NaN that reached the map would draw nothing anywhere. */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
