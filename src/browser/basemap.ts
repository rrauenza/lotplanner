/**
 * The coarse tiles the creator confirms a place on, and the numbers that go with
 * them.
 *
 * OpenStreetMap's standard XYZ tiles: keyless, already cached by the browser,
 * and the same cache the app gets for free rather than a second store of its
 * own. This is navigation only (ADR 0006): at the zoom the cache is good to,
 * about z16, a pixel is roughly 1.9 m of ground, which is ample for finding a
 * space and finding its edges by eye would be guesswork. The high-resolution
 * image is where the rectangle is drawn.
 *
 * The cap is the cache's, not the tile server's: the tiles exist beyond z16, but
 * the app deliberately stops where its own story about this tier stops, so the
 * two tiers stay what the ADR says they are.
 */

export const BASEMAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export const BASEMAP_MAX_ZOOM = 16

/** Where the map opens when a place has just been found: close enough to see it. */
export const BASEMAP_START_ZOOM = 15
