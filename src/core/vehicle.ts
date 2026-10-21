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

const MAXIMUM_NAME_LENGTH = 64
const MAXIMUM_SHORT_LABEL_LENGTH = 12

export interface Vehicle {
  readonly name: string
  readonly shortLabel: string
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
  /** `#rgb`, `#rrggbb` or `0xRRGGBB`. */
  readonly colour: string
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

/** Given, or else as much of the name as a narrow rectangle can carry. */
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

const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const SIX_DIGIT_HEX = /^(?:#|0x)([0-9a-f]{6})$/i

/** A 24-bit integer, from any of the three shapes a colour is written in. */
function parseColour(raw: string): number {
  const text = raw.trim().toLowerCase()

  const short = SHORT_HEX.exec(text)
  if (short !== null) {
    // #abc means #aabbcc, not #0a0b0c.
    const digits = short
      .slice(1)
      .map((digit) => digit + digit)
      .join('')
    return Number.parseInt(digits, 16)
  }

  const long = SIX_DIGIT_HEX.exec(text)
  if (long !== null) {
    // All six digits, not the first pair: a colour is one number.
    return Number.parseInt(long[1] ?? '', 16)
  }

  throw new Error(`A colour is #rgb, #rrggbb or 0xRRGGBB, not ${raw}.`)
}
