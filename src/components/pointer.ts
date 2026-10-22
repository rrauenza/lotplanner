/**
 * The two things every drag in this app has in common.
 *
 * A drag happens in screen coordinates, because a finger is a screen thing: the
 * palette carries a vehicle to a place on the screen, and the map turns that
 * place into a piece of ground. Naming the shape once keeps both ends of that
 * handover honest about what they are passing.
 */

/** Somewhere on the screen, in the coordinates a pointer reports. */
export interface Point {
  readonly x: number
  readonly y: number
}

/**
 * Whether a press starts a drag: the first finger down, and the left button. A
 * second finger is a pinch rather than a second drag, and the right button is the
 * browser's business rather than ours.
 */
export function isDragStart(event: PointerEvent): boolean {
  return event.isPrimary && event.button === 0
}
