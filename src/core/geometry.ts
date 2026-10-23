/**
 * The picture is the reference, not the planet.
 *
 * This is a visualisation. What has to be right is that a 45-foot coach drawn
 * over the photograph measures the same as the coaches already in it, and keeps
 * measuring that while you zoom in. Nothing here is a survey, and a Site's
 * absolute position exists for one reason only: so the imagery service returns
 * the right photograph.
 *
 * Distances are therefore kept in **ground metres** - real metres in the world,
 * because that is the unit a vehicle's length is published in - and converted
 * only at the edges:
 *
 * - **Web Mercator metres** (EPSG:3857) - the plane the map draws in, and the
 *   plane the imagery service returns.
 * - **Degrees** (WGS84) - what a manifest and an imagery `bbox` take.
 *
 * One consequence is worth stating, because getting it wrong silently ruins
 * every rectangle: imagery must be requested in the *same* plane the map draws
 * in. Asking for degrees returns a picture whose pixels are evenly spaced in
 * degrees, which the map then stretches unevenly north to south, and nothing
 * placed over it means what it says.
 *
 * Mercator stretches its plane away from the equator by 1/cos(lat). Because it
 * is conformal that is a single factor per latitude, applying to both axes,
 * which is why one conversion covers the lot. It is exact at the scale of a
 * Site, which is the only scale anything here is asked about.
 */

const EARTH_RADIUS_METRES = 6378137
const DEGREES_TO_RADIANS = Math.PI / 180
const TILE_SIZE = 256

export interface LatLng {
  readonly latitude: number
  readonly longitude: number
}

/** A position measured from the origin of the Site it belongs to, in metres. */
export interface Offset {
  readonly eastMetres: number
  readonly northMetres: number
}

/**
 * Ground metres per screen pixel at a latitude and a zoom, for the map's tile
 * grid. This is what "true scale" means on screen: a 10 m vehicle spans
 * `10 / metresPerPixel(latitude, zoom)` pixels, and that number is the same all
 * over the screen only because Mercator is conformal.
 */
export function metresPerPixel(latitude: number, zoom: number): number {
  const worldMetresPerPixel = (2 * Math.PI * EARTH_RADIUS_METRES) / (TILE_SIZE * 2 ** zoom)
  return worldMetresPerPixel * Math.cos(latitude * DEGREES_TO_RADIANS)
}

/**
 * The zoom at which one screen pixel covers the same ground as one pixel of the
 * imagery - as sharp as the picture can honestly be shown.
 *
 * Imagery has a fixed number of pixels, so past this point zooming in magnifies
 * pixels instead of revealing detail. The map caps its zoom near here, which is
 * why the answer is fractional: the cap is a product decision, not a rounding.
 */
export function zoomAtNativeResolution(nativeMetresPerPixel: number, latitude: number): number {
  return Math.log2(metresPerPixel(latitude, 0) / nativeMetresPerPixel)
}

/**
 * How much wider the same two points are apart on the Mercator plane than on
 * the ground. At the equator it is 1; at 60 degrees north it is 2.
 */
function mercatorStretchAt(latitude: number): number {
  return 1 / Math.cos(latitude * DEGREES_TO_RADIANS)
}

function longitudeToMercatorX(longitude: number): number {
  return EARTH_RADIUS_METRES * longitude * DEGREES_TO_RADIANS
}

function latitudeToMercatorY(latitude: number): number {
  return EARTH_RADIUS_METRES * Math.log(Math.tan(Math.PI / 4 + (latitude * DEGREES_TO_RADIANS) / 2))
}

function mercatorXToLongitude(x: number): number {
  return x / EARTH_RADIUS_METRES / DEGREES_TO_RADIANS
}

function mercatorYToLatitude(y: number): number {
  return (2 * Math.atan(Math.exp(y / EARTH_RADIUS_METRES)) - Math.PI / 2) / DEGREES_TO_RADIANS
}

/**
 * Where a point sits relative to a Site's origin, in ground metres.
 *
 * A local plane rather than a geodesic: Mercator is conformal, so one stretch
 * factor from the origin's latitude applies to both axes. That is exact across
 * the few hundred metres a Site spans, which is the only range anything here is
 * asked about.
 */
export function offsetFromLatLng(origin: LatLng, point: LatLng): Offset {
  const groundPerMercator = 1 / mercatorStretchAt(origin.latitude)

  return {
    eastMetres:
      (longitudeToMercatorX(point.longitude) - longitudeToMercatorX(origin.longitude)) *
      groundPerMercator,
    northMetres:
      (latitudeToMercatorY(point.latitude) - latitudeToMercatorY(origin.latitude)) *
      groundPerMercator,
  }
}

/** The exact inverse of `offsetFromLatLng`. */
export function latLngFromOffset(origin: LatLng, offset: Offset): LatLng {
  const mercatorPerGround = mercatorStretchAt(origin.latitude)

  return {
    longitude: mercatorXToLongitude(
      longitudeToMercatorX(origin.longitude) + offset.eastMetres * mercatorPerGround,
    ),
    latitude: mercatorYToLatitude(
      latitudeToMercatorY(origin.latitude) + offset.northMetres * mercatorPerGround,
    ),
  }
}

/**
 * An oriented rectangle on the Site's local plane: where its middle is, how long
 * and wide it is, and how far its length axis is turned clockwise from north -
 * the way someone standing in the place would describe it, rather than the way
 * mathematics does.
 *
 * A Site Frame and a vehicle laid on the ground are the same shape, which is why
 * one corner function serves both, and why the guide drawn for a frame and the
 * rectangle drawn for a vehicle cannot disagree about what a rectangle is.
 */
export interface OrientedRectangle {
  readonly centre: Offset
  readonly lengthMetres: number
  readonly widthMetres: number
  readonly rotationDegrees: number
}

/** A Site's working area. The same rectangle, under the name a Site uses for it. */
export type SiteFrame = OrientedRectangle

/**
 * An angle as an orientation, in the half turn a person reads in.
 *
 * A rectangle at 195 degrees is the same rectangle as one at 15, so anything
 * that compares angles compares these, and anything that shows one shows the
 * equivalent inside this range rather than the number it arrived as.
 */
export function orientation(rotationDegrees: number): number {
  const halfTurn = ((rotationDegrees % 180) + 180) % 180

  return halfTurn > 90 ? halfTurn - 180 : halfTurn
}

/**
 * The bearing from one point on the ground to another: degrees clockwise from
 * north, which is the convention every rotation here uses.
 *
 * A bearing rather than an angle in the mathematical sense, because it is the
 * number a person would give for the direction a row runs in.
 */
export function bearingBetween(from: Offset, to: Offset): number {
  const east = to.eastMetres - from.eastMetres
  const north = to.northMetres - from.northMetres

  return Math.atan2(east, north) * (180 / Math.PI)
}

/** An axis-aligned rectangle measured from a Site's origin, in ground metres. */
export interface Extent {
  readonly centre: Offset
  readonly halfEastMetres: number
  readonly halfNorthMetres: number
}

/** Corners in degrees, in the shape the map wants to place a picture. */
export interface LatLngBounds {
  readonly southWest: LatLng
  readonly northEast: LatLng
}

/**
 * The two directions a rectangle runs in: along its length, and across its
 * width, each a unit vector in ground metres.
 *
 * The basis everything else is built from, kept in one place so that anything
 * asked of a rectangle agrees with where the rectangle is drawn: a corner of it,
 * a duplicate beside it, the point a finger is asked to be inside, the extent
 * its picture is fetched for, the direction an overlap is looked for along. A
 * second copy of the sine and cosine would be a second opinion about which way a
 * rectangle faces.
 *
 * Kept private so that nothing outside can hold its own pair and drift from
 * these: anything that needs to read a point through a rectangle's axes asks
 * `alongAndAcrossOf` below, which is the one inverse of this basis there is.
 */
function axesOf(rectangle: OrientedRectangle): readonly [Offset, Offset] {
  const radians = rectangle.rotationDegrees * DEGREES_TO_RADIANS

  return [
    { eastMetres: Math.sin(radians), northMetres: Math.cos(radians) },
    { eastMetres: Math.cos(radians), northMetres: -Math.sin(radians) },
  ]
}

/**
 * A point measured from a rectangle's centre: so far along its length, and so
 * far across its width.
 */
export function alongAndAcross(
  rectangle: OrientedRectangle,
  alongMetres: number,
  acrossMetres: number,
): Offset {
  const [along, across] = axesOf(rectangle)

  return {
    eastMetres:
      rectangle.centre.eastMetres +
      along.eastMetres * alongMetres +
      across.eastMetres * acrossMetres,
    northMetres:
      rectangle.centre.northMetres +
      along.northMetres * alongMetres +
      across.northMetres * acrossMetres,
  }
}

/**
 * A point read through a rectangle's own axes: how far along its length and
 * across its width it lies, measured from the rectangle's centre.
 *
 * The one inverse of the basis above, so anything that asks where a point sits
 * relative to a rectangle - whether a finger is inside one, or how far a corner
 * was dragged along its sides - gets the same answer. A second copy of the two
 * dot products would be a second opinion about which way the rectangle faces.
 */
export function alongAndAcrossOf(
  rectangle: OrientedRectangle,
  point: Offset,
): { readonly alongMetres: number; readonly acrossMetres: number } {
  const [along, across] = axesOf(rectangle)
  const east = point.eastMetres - rectangle.centre.eastMetres
  const north = point.northMetres - rectangle.centre.northMetres

  return {
    alongMetres: east * along.eastMetres + north * along.northMetres,
    acrossMetres: east * across.eastMetres + north * across.northMetres,
  }
}

/**
 * The four corners of an oriented rectangle, as ground metres from the Site's
 * origin, in order around the perimeter.
 *
 * The order is the whole contract rather than an accident: these are handed
 * straight to a polygon, and corners in any other order are drawn as a bowtie.
 * The area enclosed is what notices.
 */
export function cornersOf(rectangle: OrientedRectangle): Offset[] {
  const halfLength = rectangle.lengthMetres / 2
  const halfWidth = rectangle.widthMetres / 2

  // In order around the perimeter, not across it. Walking one side of the
  // rectangle and then the other keeps the shape simple; enumerating one axis at
  // a time crosses it into a bowtie.
  return [
    alongAndAcross(rectangle, halfLength, halfWidth),
    alongAndAcross(rectangle, halfLength, -halfWidth),
    alongAndAcross(rectangle, -halfLength, -halfWidth),
    alongAndAcross(rectangle, -halfLength, halfWidth),
  ]
}

/**
 * Whether a point on the ground lies inside an oriented rectangle, optionally
 * with the rectangle grown by a padding first.
 *
 * The point is read through the rectangle's own axes (`alongAndAcrossOf`), then
 * compared against the two half-extents: the same basis the rectangle is drawn
 * from, read backwards, rather than a second opinion about where its edges are.
 * A hit test that disagrees with the drawing is a bug nobody sees until they try
 * to grab something.
 *
 * The padding is for fingers. A vehicle is two metres wide and a fingertip is
 * not, and none of that has to change what is drawn.
 */
export function containsPoint(
  rectangle: OrientedRectangle,
  point: Offset,
  paddingMetres = 0,
): boolean {
  const { alongMetres, acrossMetres } = alongAndAcrossOf(rectangle, point)

  return (
    Math.abs(alongMetres) <= rectangle.lengthMetres / 2 + paddingMetres &&
    Math.abs(acrossMetres) <= rectangle.widthMetres / 2 + paddingMetres
  )
}

/**
 * How close two rectangles have to be before they count as touching rather than
 * as meeting.
 *
 * A nanometre. A shared edge worked out twice - once as the far side of one
 * rectangle and once as the near side of the next - differs by a rounding error
 * of around 1e-14 m, so a rectangle laid exactly beside another comes back a
 * hair overlapping and says so to anyone looking at it. The tolerance is far
 * above that noise and far below anything the picture can show, where a screen
 * pixel is some 30 cm of ground, so it changes no answer anyone can see.
 */
const TOUCHING_METRES = 1e-9

/**
 * Whether two oriented rectangles cover any of the same ground.
 *
 * The separating-axis test: two convex shapes are clear of each other exactly
 * when one of their own directions has them on opposite sides of a gap, so that
 * is the only thing looked for. The directions and the corners both come from
 * the rectangle basis the picture is drawn from, which is what makes a pair
 * that is seen to cover and a pair that is reported as covering the same pair.
 *
 * Touching is not overlapping. Two vehicles nose to tail or parked abreast
 * share an edge and no ground, which is an arrangement that fits.
 */
export function overlaps(left: OrientedRectangle, right: OrientedRectangle): boolean {
  const leftCorners = cornersOf(left)
  const rightCorners = cornersOf(right)

  for (const rectangle of [left, right]) {
    for (const axis of axesOf(rectangle)) {
      if (apartAlong(leftCorners, rightCorners, axis)) {
        return false
      }
    }
  }

  return true
}

/**
 * Whether two sets of corners lie on opposite sides of a gap, measured along one
 * direction.
 *
 * Touching counts as apart: there may be no gap at all, and sharing an edge is
 * not covering ground.
 */
function apartAlong(one: readonly Offset[], other: readonly Offset[], axis: Offset): boolean {
  const [oneLeast, oneMost] = spanAlong(one, axis)
  const [otherLeast, otherMost] = spanAlong(other, axis)

  return oneMost <= otherLeast + TOUCHING_METRES || otherMost <= oneLeast + TOUCHING_METRES
}

/** How far along a direction a set of points reaches, from its least to its most. */
function spanAlong(corners: readonly Offset[], axis: Offset): readonly [number, number] {
  let least = Infinity
  let most = -Infinity

  for (const corner of corners) {
    const along = corner.eastMetres * axis.eastMetres + corner.northMetres * axis.northMetres

    least = Math.min(least, along)
    most = Math.max(most, along)
  }

  return [least, most]
}

/**
 * The rectangle to fetch imagery for: the frame grown by a margin on every side.
 *
 * The margin is measured along the frame's own axes, so it stays a real distance
 * from the frame's edges whatever angle the Site sits at. The picture itself has
 * to be axis-aligned even when the frame is not, so the result is the bounding
 * box of the grown frame - which is why an angled frame fetches slightly more
 * than it strictly needs, in the corners.
 *
 * The axes come from the same place every other rectangle is read through
 * (`axesOf`), so the box around a frame and the frame itself cannot disagree
 * about which way it is turned.
 */
export function extentAroundFrame(frame: SiteFrame, marginMetres: number): Extent {
  const [along, across] = axesOf(frame)
  const halfLength = frame.lengthMetres / 2 + marginMetres
  const halfWidth = frame.widthMetres / 2 + marginMetres

  return {
    centre: frame.centre,
    halfEastMetres:
      halfLength * Math.abs(along.eastMetres) + halfWidth * Math.abs(across.eastMetres),
    halfNorthMetres:
      halfLength * Math.abs(along.northMetres) + halfWidth * Math.abs(across.northMetres),
  }
}

/** The extent as degrees, which is how the map places the picture. */
export function boundsForExtent(origin: LatLng, extent: Extent): LatLngBounds {
  return {
    southWest: latLngFromOffset(origin, {
      eastMetres: extent.centre.eastMetres - extent.halfEastMetres,
      northMetres: extent.centre.northMetres - extent.halfNorthMetres,
    }),
    northEast: latLngFromOffset(origin, {
      eastMetres: extent.centre.eastMetres + extent.halfEastMetres,
      northMetres: extent.centre.northMetres + extent.halfNorthMetres,
    }),
  }
}

/**
 * The extent a picture covers, read back from the bounds that place it.
 *
 * The exact inverse of `boundsForExtent`, so a Layout that carries its own
 * bounding box can be drawn on the photograph it was shared with rather than on
 * one re-derived from its frame. Those two are the same only while every app
 * derives the extent the same way, which is not something a shared artifact can
 * assume.
 */
export function extentForBounds(origin: LatLng, bounds: LatLngBounds): Extent {
  const southWest = offsetFromLatLng(origin, bounds.southWest)
  const northEast = offsetFromLatLng(origin, bounds.northEast)

  return {
    centre: {
      eastMetres: (southWest.eastMetres + northEast.eastMetres) / 2,
      northMetres: (southWest.northMetres + northEast.northMetres) / 2,
    },
    halfEastMetres: Math.abs(northEast.eastMetres - southWest.eastMetres) / 2,
    halfNorthMetres: Math.abs(northEast.northMetres - southWest.northMetres) / 2,
  }
}

/** A rectangle in the Mercator plane, which is what an imagery `bbox` takes. */
export interface MercatorBounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/**
 * The extent expressed in Web Mercator metres, which is the frame both the map
 * and the imagery service draw in. Asking the service for anything else would
 * hand back a picture the map then stretches unevenly.
 */
export function mercatorBoundsForExtent(origin: LatLng, extent: Extent): MercatorBounds {
  const stretch = mercatorStretchAt(origin.latitude)

  const x = longitudeToMercatorX(origin.longitude) + extent.centre.eastMetres * stretch
  const y = latitudeToMercatorY(origin.latitude) + extent.centre.northMetres * stretch
  const halfX = extent.halfEastMetres * stretch
  const halfY = extent.halfNorthMetres * stretch

  return { minX: x - halfX, minY: y - halfY, maxX: x + halfX, maxY: y + halfY }
}
