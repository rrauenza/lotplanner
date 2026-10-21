/**
 * A stored colour as one a browser understands.
 *
 * A Vehicle keeps its colour as a 24-bit integer, which is the form that travels
 * and compares; this is the form that draws. Kept in one place because the
 * palette, the rectangle and anything else that shows a vehicle have to agree
 * about what its colour looks like.
 */
export function cssColour(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`
}
