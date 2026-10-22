/**
 * A vehicle type: a name, a short label, a width, a length and a colour.
 *
 * One Vehicle may describe a combination - a pickup towing a utility trailer is
 * a single rectangle, not two - because what has to fit in a space is the whole
 * thing that arrives in it.
 *
 * There is no height. This is a plan view, and whether something fits under a
 * bridge is a question it cannot answer.
 *
 * Dimensions are whole inches (ADR 0003) and the colour is a 24-bit integer, so
 * a Vehicle is a plain value that can be stored and shared with no parser.
 */

import { parseColour } from './colour'

const MAXIMUM_NAME_LENGTH = 64
const MAXIMUM_SHORT_LABEL_LENGTH = 12

export interface Vehicle {
  readonly name: string
  readonly shortLabel: string
  readonly widthInches: number
  readonly lengthInches: number
  /**
   * The width with the mirrors out, when someone has looked it up. Not the width
   * it is drawn at: this is the worst case, kept so that it can be asked about
   * when the question is whether something squeezes through.
   */
  readonly mirrorsWidthInches?: number
  readonly colour: number
}

export interface VehicleInput {
  readonly name: string
  /** Defaults to as much of the name as fits. */
  readonly shortLabel?: string
  readonly widthInches: number
  readonly lengthInches: number
  /** At least the body's width, because mirrors do not make a vehicle narrower. */
  readonly mirrorsWidthInches?: number
  /** `#rgb`, `#rrggbb` or `0xRRGGBB`; a 24-bit integer is already one. */
  readonly colour: string | number
}

/** A Vehicle from loose input, canonicalised, or an error saying what is wrong. */
export function vehicle(input: VehicleInput): Vehicle {
  const name = canonicalName(input.name)
  const widthInches = wholeInches(input.widthInches, 'width')

  const built: Vehicle = {
    name,
    shortLabel: canonicalShortLabel(input.shortLabel, name),
    widthInches,
    lengthInches: wholeInches(input.lengthInches, 'length'),
    colour: parseColour(input.colour),
  }

  if (input.mirrorsWidthInches === undefined) {
    return built
  }

  const withMirrors = wholeInches(input.mirrorsWidthInches, 'width including mirrors')

  if (withMirrors < widthInches) {
    throw new Error('A width including mirrors cannot be narrower than the vehicle.')
  }

  return { ...built, mirrorsWidthInches: withMirrors }
}

/**
 * Whether two Vehicles are the same one, field for field.
 *
 * A Layout keeps its vehicles as copies rather than as references to anything, so
 * "the same vehicle" has to mean "the same values". That is also what survives a
 * Layout being written out and read back, where two placements of one vehicle
 * stop being the same object even though they are still one vehicle.
 */
export function sameVehicle(left: Vehicle, right: Vehicle): boolean {
  return (
    left.name === right.name &&
    left.shortLabel === right.shortLabel &&
    left.widthInches === right.widthInches &&
    left.lengthInches === right.lengthInches &&
    left.mirrorsWidthInches === right.mirrorsWidthInches &&
    left.colour === right.colour
  )
}

/**
 * Trimmed, with runs of whitespace collapsed to single spaces, so two names that
 * look the same are the same.
 *
 * Control characters go first, or they survive as whitespace and turn one name
 * into two. Composing after decomposing is what the spec asks for and is simply
 * NFC, which is the form that compares equal.
 */
function canonicalName(raw: string): string {
  const collapsed = strippedOfControlCharacters(raw).trim().replace(/\s+/g, ' ')

  if (collapsed === '') {
    throw new Error('A vehicle needs a name.')
  }
  if (collapsed.length > MAXIMUM_NAME_LENGTH) {
    throw new Error(`A vehicle name is at most ${String(MAXIMUM_NAME_LENGTH)} characters.`)
  }

  return collapsed
}

/**
 * Control characters go before anything else, or they survive as whitespace and
 * turn one name into two. Composing after decomposing is what the spec asks for
 * and is simply NFC, which is the form that compares equal.
 */
function strippedOfControlCharacters(raw: string): string {
  // eslint-disable-next-line no-control-regex -- removing them is the point
  const withoutControlCharacters = raw.replace(/[\u0000-\u001f\u007f]/g, '')

  return withoutControlCharacters.normalize('NFD').normalize('NFC')
}

/**
 * Given, or else as much of the name as a narrow rectangle can carry.
 *
 * The spec asks for a short label that is optional, at most twelve characters,
 * and defaults to the name - which cannot all be true of a name that is sixty
 * characters long. The reading taken is the useful one: with no label given, as
 * much of the name as the cap allows is kept, so that a long name still has a
 * short stand-in for the places where the whole of it will not fit.
 */
function canonicalShortLabel(given: string | undefined, name: string): string {
  const collapsed = (given ?? '').trim().replace(/\s+/g, ' ')

  if (collapsed === '') {
    return name.slice(0, MAXIMUM_SHORT_LABEL_LENGTH)
  }
  if (collapsed.length > MAXIMUM_SHORT_LABEL_LENGTH) {
    throw new Error(`A short label is at most ${String(MAXIMUM_SHORT_LABEL_LENGTH)} characters.`)
  }

  return collapsed
}

function wholeInches(value: number, what: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`A vehicle ${what} has to be a whole number of inches.`)
  }
  return value
}
