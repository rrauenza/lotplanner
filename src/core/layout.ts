import type { LatLng, Offset, OrientedRectangle, SiteFrame } from './geometry'
import type { Site } from './site'
import { inchesToMetres } from './units'
import type { Vehicle } from './vehicle'

/**
 * A Layout: a Site, the frame it was worked in, and the vehicles placed on it.
 *
 * A Layout embeds its own copies of the vehicles it uses rather than pointing
 * into a collection, so it always resolves on its own and nothing done to a
 * collection can reach back into a layout someone is relying on (ADR 0002). It
 * carries its Site's name and georeference for the same reason: opening a Layout
 * does not need the manifest to still have that Site in it.
 *
 * Every change below returns a new Layout and leaves the old one exactly as it
 * was. That is the state discipline this ticket establishes: keeping an earlier
 * state costs one reference, so undo is a stack of them rather than a rewrite
 * (ADR 0004). It is why nothing here is a method and nothing is mutated - an
 * earlier state cannot be edited by accident because there is no way to reach it.
 */

/** One vehicle, laid on the ground at a position and an angle. */
export interface Placement {
  readonly id: string
  /** This Layout's own copy, so editing it here never touches a collection. */
  readonly vehicle: Vehicle
  /** Ground metres from the Site's origin: not a pixel, and not rounded to one. */
  readonly centre: Offset
  /** Clockwise from north, like every other angle here. */
  readonly rotationDegrees: number
}

export interface Layout {
  readonly siteId: string
  readonly siteName: string
  /** Where the Site's own (0, 0) is, so the Layout does not need the manifest. */
  readonly origin: LatLng
  /** The frame it was worked in, embedded whole. A guide, never a limit. */
  readonly frame?: SiteFrame
  readonly placements: readonly Placement[]
}

/** A Layout for a Site with nothing placed on it yet. */
export function newLayout(site: Site): Layout {
  const untouched: Layout = {
    siteId: site.id,
    siteName: site.name,
    origin: site.origin,
    placements: [],
  }

  if (site.frame === undefined) {
    return untouched
  }

  return { ...untouched, frame: site.frame }
}

/** The rectangle a Placement covers on the ground, in ground metres. */
export function rectangleOf(placement: Placement): OrientedRectangle {
  return {
    centre: placement.centre,
    lengthMetres: inchesToMetres(placement.vehicle.lengthInches),
    widthMetres: inchesToMetres(placement.vehicle.widthInches),
    rotationDegrees: placement.rotationDegrees,
  }
}

/** The same Layout with one more vehicle on it. */
export function withPlacement(layout: Layout, placement: Placement): Layout {
  return { ...layout, placements: [...layout.placements, placement] }
}

/**
 * The same Layout with one Placement moved. Nothing else about it changes, not
 * even its angle: moving a vehicle does not turn it.
 *
 * A Placement the caller did not name comes through as the very same object, so
 * an untouched neighbour costs nothing to carry into the next state.
 */
export function withMovedPlacement(layout: Layout, id: string, centre: Offset): Layout {
  return {
    ...layout,
    placements: layout.placements.map((placement) =>
      placement.id === id ? { ...placement, centre } : placement,
    ),
  }
}
