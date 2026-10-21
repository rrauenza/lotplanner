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
 * How many font sizes across a rectangle has to be before a line of text sits
 * inside it rather than across its edges.
 */
const MINIMUM_WIDTH_IN_FONT_SIZES = 1.2

/** How much room a Placement has on screen right now, along its own axes. */
export interface ScreenRectangle {
  readonly lengthPixels: number
  readonly widthPixels: number
}

/**
 * The text to write on a rectangle, or nothing when there is no room for any.
 *
 * The name first, because it says more; then the short label, which is what it
 * is for; then nothing at all, because a name spilling across its own edges says
 * less than a clean rectangle does.
 */
export function labelFor(vehicle: Vehicle, rectangle: ScreenRectangle): string | undefined {
  if (rectangle.widthPixels < LABEL_FONT_PIXELS * MINIMUM_WIDTH_IN_FONT_SIZES) {
    return undefined
  }

  const charactersThatFit =
    rectangle.lengthPixels / (LABEL_FONT_PIXELS * AVERAGE_CHARACTER_WIDTH_RATIO)

  if (vehicle.name.length <= charactersThatFit) {
    return vehicle.name
  }
  if (vehicle.shortLabel.length <= charactersThatFit) {
    return vehicle.shortLabel
  }

  return undefined
}
