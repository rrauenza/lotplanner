/**
 * Feet and inches: the two integer boxes a dimension is typed into, and the
 * single integer it is stored as.
 *
 * The world publishes vehicle dimensions in feet and inches - "a 45 foot
 * coach", "a 53 foot trailer" - so this is the only place that converts, and
 * the only place that would ever change if that stopped being true.
 */

const INCHES_PER_FOOT = 12
const METRES_PER_INCH = 0.0254

/**
 * What a pair of boxes means, in total inches, or nothing if they do not mean a
 * dimension.
 *
 * A blank box counts as zero, so five feet and a blank is five feet. The two are
 * added into one number rather than kept apart, because `0 ft 15 in` and
 * `1 ft 3 in` are the same length and nothing downstream should have to know it.
 *
 * Refused: anything that is not a whole number of feet and inches, anything
 * negative, and a total of zero - a vehicle with no length is a mistake rather
 * than a small vehicle.
 */
export function toInches(feet: string, inches: string): number | undefined {
  const wholeFeet = wholeNumber(feet)
  const extraInches = wholeNumber(inches)

  if (wholeFeet === undefined || extraInches === undefined) {
    return undefined
  }

  const total = wholeFeet * INCHES_PER_FOOT + extraInches

  return total > 0 ? total : undefined
}

/**
 * `5'3"`, with the inches carrying into feet, so fifteen inches reads as `1'3"`.
 *
 * The inches are always shown even when there are none: `45'0"` reads as a
 * measurement, where `45'` reads as a rough description of one.
 */
export function toFeetAndInches(totalInches: number): string {
  const feet = Math.floor(totalInches / INCHES_PER_FOOT)
  const inches = totalInches - feet * INCHES_PER_FOOT

  return `${String(feet)}'${String(inches)}"`
}

/**
 * Inches as ground metres, which is where a published size becomes a rectangle.
 *
 * The world publishes a vehicle in feet and inches; the map, the drawings and
 * everything measured off the photograph are in metres. This is the one step
 * between them.
 */
export function inchesToMetres(inches: number): number {
  return inches * METRES_PER_INCH
}

function wholeNumber(text: string): number | undefined {
  const trimmed = text.trim()

  if (trimmed === '') {
    return 0
  }
  // Digits only, so a negative, a fraction or a word is refused rather than
  // silently truncated into something plausible.
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined
}
