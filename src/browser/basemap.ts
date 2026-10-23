/**
 * The coarse tiles the creator confirms a place on, and the numbers that go with
 * them.
 *
 * USGS's cached XYZ basemap (`USGSImageryOnly`), from the same service family the
 * app's imagery comes from, keyless like it. "Cached" means the tiles are
 * pre-rendered by the service and handed over as images rather than rendered on
 * demand, and that the browser keeps them in its own HTTP cache: the app keeps no
 * store of its own for this tier, exactly as it keeps none for the geocoder's
 * answers.
 *
 * This is navigation only (ADR 0006). The service's cache stops at zoom 16, where
 * a pixel is about 1.9 m of ground - ample for finding a space, and useless for
 * judging its edges by eye. That is a property of the service rather than a cap
 * chosen here, which is why the rectangle is drawn on the high-resolution image
 * that comes next.
 *
 * No key, no card, and no attribution obligation, since USGS imagery is public
 * domain, but USGS is credited anyway.
 */

export const BASEMAP_TILE_URL =
  'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'

export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.usgs.gov/programs/national-geospatial-program">USGS The National Map</a>: Orthoimagery'

export const BASEMAP_MAX_ZOOM = 16

/** Where the map opens when a place has just been found: close enough to see it. */
export const BASEMAP_START_ZOOM = 15
