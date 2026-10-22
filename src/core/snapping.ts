import { orientation } from './geometry'

/**
 * Turning a vehicle to match the space it is in.
 *
 * Nothing here is north-relative. A lot is typically not square to north, so
 * snapping to the compass would pull a vehicle off the row it is meant to match.
 * What a space offers instead is its own angle, and the vehicles already laid in
 * it: the first one in a row says where the row runs, and every one after it
 * lines up with that (ADR 0005).
 *
 * The candidates are a magnet, not a set of permitted positions. A vehicle can
 * be set to any angle at all, and setting the first one in a row by hand is the
 * ordinary case rather than a failure of the snapping.
 */

/**
 * How far a vehicle has to be turned before it is out of a candidate's reach.
 *
 * A few degrees, because a fingertip on a vehicle that is a handful of pixels
 * wide is imprecise, and because the candidates here are far apart: the space's
 * angle, and wherever the neighbours point. Nothing like the seventh of a circle
 * that a ladder of steps would have needed, which is part of why there is no
 * ladder.
 */
export const SNAP_TOLERANCE_DEGREES = 5

/** How far one angle is from another, the short way round: never over a quarter turn. */
export function angleBetween(from: number, to: number): number {
  return orientation(to - from)
}

/**
 * Every angle a vehicle may snap to: the space's own, and the angles of the
 * vehicles already on the ground in it.
 */
export function snapCandidates(
  spaceRotationDegrees: number | undefined,
  neighbours: readonly number[],
): number[] {
  return spaceRotationDegrees === undefined
    ? [...neighbours]
    : [spaceRotationDegrees, ...neighbours]
}

/**
 * The angle to turn to, or the one asked about when nothing is near enough.
 *
 * The answer is the nearest angle to the one asked about that shares a
 * candidate's orientation, rather than the candidate itself: a vehicle three
 * degrees from 270 is handed back 270, not 90, so that turning near the far side
 * of the circle does not make it jump across.
 */
export function snapAngle(
  angleDegrees: number,
  candidates: readonly number[],
  toleranceDegrees: number = SNAP_TOLERANCE_DEGREES,
): number {
  let nearest: number | undefined = undefined

  for (const candidate of candidates) {
    const delta = angleBetween(angleDegrees, candidate)

    if (nearest === undefined || Math.abs(delta) < Math.abs(nearest)) {
      nearest = delta
    }
  }

  if (nearest === undefined || Math.abs(nearest) > toleranceDegrees) {
    return angleDegrees
  }

  return angleDegrees + nearest
}
