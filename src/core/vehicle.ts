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
import { tidy } from './text'

const MAXIMUM_NAME_LENGTH = 64
const MAXIMUM_SHORT_LABEL_LENGTH = 12

export interface Vehicle {
  readonly name: string
  readonly shortLabel: string
  /**
   * The published width. Whatever the specifications say it is - including
   * mirrors if that is how they say it - because it is the width this is drawn
   * at, and a rectangle here is an approximation rather than a measurement.
   */
  readonly widthInches: number
  readonly lengthInches: number
  readonly colour: number
}

export interface VehicleInput {
  readonly name: string
  /** Defaults to as much of the name as fits. */
  readonly shortLabel?: string
  readonly widthInches: number
  readonly lengthInches: number
  /** `#rgb`, `#rrggbb` or `0xRRGGBB`; a 24-bit integer is already one. */
  readonly colour: string | number
}

/** A Vehicle from loose input, canonicalised, or an error saying what is wrong. */
export function vehicle(input: VehicleInput): Vehicle {
  const name = canonicalName(input.name)

  return {
    name,
    shortLabel: canonicalShortLabel(input.shortLabel, name),
    widthInches: wholeInches(input.widthInches, 'width'),
    lengthInches: wholeInches(input.lengthInches, 'length'),
    colour: parseColour(input.colour),
  }
}

/**
 * A Vehicle read out of something not trusted: storage, or a file someone sent.
 *
 * A record can be from an older version of this app, half-written, or put there
 * by hand, so what can be read is turned into a Vehicle by the one constructor -
 * the rules about what a Vehicle may be are not repeated here - and what cannot
 * is reported as nothing. The caller decides whether that loses one vehicle or
 * the whole record it was found in.
 */
export function readVehicle(value: unknown): Vehicle | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const { name, shortLabel, widthInches, lengthInches, colour } = value as Record<string, unknown>

  if (
    typeof name !== 'string' ||
    typeof shortLabel !== 'string' ||
    !isNumber(widthInches) ||
    !isNumber(lengthInches) ||
    (typeof colour !== 'string' && !isNumber(colour))
  ) {
    return undefined
  }

  try {
    return vehicle({ name, shortLabel, widthInches, lengthInches, colour })
  } catch {
    return undefined
  }
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
    left.colour === right.colour
  )
}

/** Trimmed, with runs of whitespace collapsed, so two names that look the same are the same. */
function canonicalName(raw: string): string {
  const collapsed = tidy(raw)

  if (collapsed === '') {
    throw new Error('A vehicle needs a name.')
  }
  if (collapsed.length > MAXIMUM_NAME_LENGTH) {
    throw new Error(`A vehicle name is at most ${String(MAXIMUM_NAME_LENGTH)} characters.`)
  }

  return collapsed
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
  const collapsed = tidy(given ?? '')

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

/** Finite, because a NaN that reached the map would draw nothing anywhere. */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
