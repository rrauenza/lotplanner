import { axesOf, type Offset, type SiteFrame } from './geometry'
import { MAX_IMAGE_PIXELS, NATIVE_METRES_PER_PIXEL } from './imagery'
import { CONTEXT_MARGIN_METRES } from './site'

/**
 * The rectangle the creator draws over the imagery, as arithmetic rather than as
 * a gesture.
 *
 * Drawing a frame is a decision - where its corners are, and therefore where the
 * picture is fetched and how the space is oriented - so it is decided here and
 * the shell only has to say where a finger is. The two movements are kept apart
 * the way the visitor app keeps moving and turning apart (ADR 0005): a drag
 * draws or reshapes, and the angle is changed on its own.
 *
 * The angle is never touched by a draw or a resize. A frame is square to north
 * until the creator turns it, because that is all a corner-to-corner drag can
 * honestly say, and a resize has to keep the angle the creator has already set
 * or it would undo the turn that makes the frame match the space.
 */

/**
 * How small a rectangle may be drawn. A frame smaller than this is not a space a
 * vehicle could sit in and is far more likely to be a stray tap, so it is
 * refused rather than recorded as a Site nothing can be laid in.
 */
export const MINIMUM_FRAME_SIDE_METRES = 1

/**
 * The working area a new Site is fetched for, before the creator has drawn one.
 *
 * A picture is fetched before anything can be drawn on it, so a brand-new place
 * needs a rectangle to plan its fetch even though it has no frame yet. This is
 * the largest square whose extent - itself plus the context margin - still fits
 * the imagery service's pixel cap at the imagery's own resolution, worked out
 * from the same two numbers the fetch itself uses rather than chosen by eye. A
 * drawn frame sits inside it, so the picture the creator drew on already covers
 * the frame plus the margin the visitors will see.
 */
export const DEFAULT_FRAME_SIDE_METRES =
  MAX_IMAGE_PIXELS * NATIVE_METRES_PER_PIXEL - 2 * CONTEXT_MARGIN_METRES

/** The working area itself: square to north, centred on the place. */
export function workingFrame(): SiteFrame {
  return {
    centre: { eastMetres: 0, northMetres: 0 },
    lengthMetres: DEFAULT_FRAME_SIDE_METRES,
    widthMetres: DEFAULT_FRAME_SIDE_METRES,
    rotationDegrees: 0,
  }
}

/**
 * The frame a corner-to-corner drag describes.
 *
 * Its length runs north and its width east, because that is the shape of the
 * drag on the plane the picture is in; the creator turns the rectangle
 * afterwards to set the axes that matter. Nothing is drawn from a drag too small
 * to be a space, which is what a stray tap looks like next to a real one.
 */
export function frameFromCorners(from: Offset, to: Offset): SiteFrame | undefined {
  const widthMetres = Math.abs(to.eastMetres - from.eastMetres)
  const lengthMetres = Math.abs(to.northMetres - from.northMetres)

  if (lengthMetres < MINIMUM_FRAME_SIDE_METRES || widthMetres < MINIMUM_FRAME_SIDE_METRES) {
    return undefined
  }

  return {
    centre: {
      eastMetres: (from.eastMetres + to.eastMetres) / 2,
      northMetres: (from.northMetres + to.northMetres) / 2,
    },
    lengthMetres,
    widthMetres,
    rotationDegrees: 0,
  }
}

/**
 * The frame with one corner dragged while the one opposite it is held still.
 *
 * The drag is measured along the frame's own two directions, so a rectangle
 * already turned to match the space is reshaped along the space's edges rather
 * than along the compass - which is the whole point of having turned it. The
 * held corner does not move, so the picture can be built up from one corner the
 * creator has already placed.
 *
 * The angle is carried through untouched, and a drag that would leave either
 * side too small to be a space is refused so the last good rectangle stands.
 */
export function resizedFrame(frame: SiteFrame, held: Offset, moved: Offset): SiteFrame | undefined {
  const [along, across] = axesOf(frame)
  const east = moved.eastMetres - held.eastMetres
  const north = moved.northMetres - held.northMetres
  const lengthMetres = Math.abs(east * along.eastMetres + north * along.northMetres)
  const widthMetres = Math.abs(east * across.eastMetres + north * across.northMetres)

  if (lengthMetres < MINIMUM_FRAME_SIDE_METRES || widthMetres < MINIMUM_FRAME_SIDE_METRES) {
    return undefined
  }

  return {
    centre: {
      eastMetres: (held.eastMetres + moved.eastMetres) / 2,
      northMetres: (held.northMetres + moved.northMetres) / 2,
    },
    lengthMetres,
    widthMetres,
    rotationDegrees: frame.rotationDegrees,
  }
}
