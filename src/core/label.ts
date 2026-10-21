import type { Vehicle } from './vehicle'

/**
 * What a rectangle says about itself.
 *
 * This is the one piece of drawing that is judgement rather than rendering, so
 * it lives in the core where it can be tested, and the view is left with drawing
 * a rotated line of text and none of the deciding.
 *
 * The decision is made against the rectangle's *screen* size, not its real one.
 * A 53 foot trailer three zoom levels out is a few pixels long, and whether a
 * name fits is a question about those pixels - which is why it is asked again as
 * the picture grows and shrinks.
 */

/** A label's font size in screen pixels, the same at every zoom. */
export const LABEL_FONT_PIXELS = 12

/**
 * Roughly how wide the average character is, as a share of the font size.
 *
 * An estimate, because the alternative is measuring text in a browser and this
 * file has no browser. Being a little wrong only decides whether a name is
 * replaced by its short label a little sooner or later, and both are readable.
 */
const AVERAGE_CHARACTER_WIDTH_RATIO = 0.55

/**
 * The angle to turn a label by, given the angle of the rectangle under it.
 *
 * The text runs along the length of what it names, and a line of text reads
 * left to right at rest while the length of a vehicle runs north, so the text is
 * a quarter turn behind the rectangle it sits on.
 */
export function labelRotationFor(rotationDegrees: number): number {
  return upright(rotationDegrees - 90)
}

/**
 * The same angle, turned as far as it takes to keep the text the right way up.
 *
 * Screen angles repeat every half turn as far as reading is concerned, so any
 * angle outside the range a person reads in can be replaced by the equivalent
 * one inside it. A name upside down is worse than no name.
 */
function upright(rotationDegrees: number): number {
  const halfTurn = ((rotationDegrees % 180) + 180) % 180

  return halfTurn > 90 ? halfTurn - 180 : halfTurn
}

/**
 * The text to write on a rectangle, or nothing when there is no room for any.
 *
 * The name first, because it says more; then the short label, which is what it
 * is for; then nothing at all, because a name spilling out past the length of
 * what it names says less than a clean rectangle does.
 *
 * What counts as room is the rectangle's length on screen, and only that. A
 * label is allowed to stand taller than the vehicle is wide, the way a street
 * name stands taller than the road it names - and here that is the only way a
 * label is ever read at all, because at 1:1 imagery a 53 foot trailer is under
 * nine pixels across.
 */
export function labelFor(vehicle: Vehicle, lengthPixels: number): string | undefined {
  const charactersThatFit = lengthPixels / (LABEL_FONT_PIXELS * AVERAGE_CHARACTER_WIDTH_RATIO)

  if (vehicle.name.length <= charactersThatFit) {
    return vehicle.name
  }
  if (vehicle.shortLabel.length <= charactersThatFit) {
    return vehicle.shortLabel
  }

  return undefined
}
