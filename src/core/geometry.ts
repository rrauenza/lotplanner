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
 * The four corners of an oriented rectangle, as ground metres from the Site's
 * origin, in order around the perimeter.
 *
 * The order is the whole contract rather than an accident: these are handed
 * straight to a polygon, and corners in any other order are drawn as a bowtie.
 * The area enclosed is what notices.
 */
export function cornersOf(rectangle: OrientedRectangle): Offset[] {
  const radians = rectangle.rotationDegrees * DEGREES_TO_RADIANS
  const halfLength = rectangle.lengthMetres / 2
  const halfWidth = rectangle.widthMetres / 2

  // Along the rotation and across it. At zero the length runs north.
  const alongEast = Math.sin(radians)
  const alongNorth = Math.cos(radians)
  const acrossEast = Math.cos(radians)
  const acrossNorth = -Math.sin(radians)

  // In order around the perimeter, not across it. Walking one side of the
  // rectangle and then the other keeps the shape simple; enumerating one axis at
  // a time crosses it into a bowtie.
  const walk: readonly (readonly [number, number])[] = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ]

  return walk.map(([lengthSign, widthSign]) => ({
    eastMetres:
      rectangle.centre.eastMetres +
      lengthSign * halfLength * alongEast +
      widthSign * halfWidth * acrossEast,
    northMetres:
      rectangle.centre.northMetres +
      lengthSign * halfLength * alongNorth +
      widthSign * halfWidth * acrossNorth,
  }))
}

/**
 * Whether a point on the ground lies inside an oriented rectangle, optionally
 * with the rectangle grown by a padding first.
 *
 * The point is turned back by the rotation and then compared against the two
 * half-extents: the same arithmetic as drawing the rectangle, read backwards,
 * rather than a second opinion about where its edges are. A hit test that
 * disagrees with the drawing is a bug nobody sees until they try to grab
 * something.
 *
 * The padding is for fingers. A vehicle is two metres wide and a fingertip is
 * not, and none of that has to change what is drawn.
 */
export function containsPoint(
  rectangle: OrientedRectangle,
  point: Offset,
  paddingMetres = 0,
): boolean {
  const radians = rectangle.rotationDegrees * DEGREES_TO_RADIANS
  const east = point.eastMetres - rectangle.centre.eastMetres
  const north = point.northMetres - rectangle.centre.northMetres

  const along = east * Math.sin(radians) + north * Math.cos(radians)
  const across = east * Math.cos(radians) - north * Math.sin(radians)

  return (
    Math.abs(along) <= rectangle.lengthMetres / 2 + paddingMetres &&
    Math.abs(across) <= rectangle.widthMetres / 2 + paddingMetres
  )
}

/**
 * The rectangle to fetch imagery for: the frame grown by a margin on every side.
 *
 * The margin is measured along the frame's own axes, so it stays a real distance
 * from the frame's edges whatever angle the Site sits at. The picture itself has
 * to be axis-aligned even when the frame is not, so the result is the bounding
 * box of the grown frame - which is why an angled frame fetches slightly more
 * than it strictly needs, in the corners.
 */
export function extentAroundFrame(frame: SiteFrame, marginMetres: number): Extent {
  const radians = frame.rotationDegrees * DEGREES_TO_RADIANS
  const halfLength = frame.lengthMetres / 2 + marginMetres
  const halfWidth = frame.widthMetres / 2 + marginMetres

  return {
    centre: frame.centre,
    halfEastMetres:
      halfLength * Math.abs(Math.sin(radians)) + halfWidth * Math.abs(Math.cos(radians)),
    halfNorthMetres:
      halfLength * Math.abs(Math.cos(radians)) + halfWidth * Math.abs(Math.sin(radians)),
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
