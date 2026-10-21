import { extentAroundFrame, type Extent, type LatLng, type SiteFrame } from './geometry'

/**
 * How much of a Site's surroundings to show beyond its frame. A display choice
 * rather than a measurement: enough to see the entrances and the approach,
 * without spending the imagery budget on fields.
 */
export const CONTEXT_MARGIN_METRES = 150

/**
 * What a Site with no frame gets instead: a square working area around the
 * origin, so a Site is usable before anyone has drawn a frame on it.
 */
export const UNFRAMED_EXTENT_HALF_METRES = 150

/** A real-world place to lay vehicles out on, as the manifest describes it. */
export interface Site {
  readonly id: string
  readonly name: string
  /** Where this Site's own (0, 0) sits in the world. */
  readonly origin: LatLng
  /** The working area, once someone has drawn one. A guide, never a limit. */
  readonly frame?: SiteFrame
}

/**
 * The rectangle of imagery to fetch for a Site: its frame plus the context
 * margin, so the place appears in its surroundings rather than cropped to the
 * area of interest. A Site with no frame still gets a default square, because a
 * picture is more useful than an error.
 */
export function extentForSite(site: Site): Extent {
  if (site.frame === undefined) {
    return {
      centre: { eastMetres: 0, northMetres: 0 },
      halfEastMetres: UNFRAMED_EXTENT_HALF_METRES,
      halfNorthMetres: UNFRAMED_EXTENT_HALF_METRES,
    }
  }

  return extentAroundFrame(site.frame, CONTEXT_MARGIN_METRES)
}
