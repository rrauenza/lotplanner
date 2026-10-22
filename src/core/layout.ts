import {
  boundsForExtent,
  type LatLng,
  type LatLngBounds,
  type Offset,
  type OrientedRectangle,
  type SiteFrame,
} from './geometry'
import { extentForSite, type Site } from './site'
import { inchesToMetres } from './units'
import { sameVehicle, type Vehicle } from './vehicle'

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
  /**
   * The ground the picture covers, so a Layout carries enough of its Site to be
   * drawn on its own rather than only alongside the manifest it came from.
   */
  readonly bounds: LatLngBounds
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
    bounds: boundsForExtent(site.origin, extentForSite(site)),
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
 * The same Layout with every Placement of one vehicle edited at once.
 *
 * Editing a vehicle is deliberately not an edit to one Placement. The same
 * vehicle placed four times is four arrangements of one size, and the point of
 * correcting that size is that all four are corrected - which is why this looks
 * for the vehicle it was given rather than for the placement it came from.
 *
 * The vehicle to look for is named by value rather than by where it came from,
 * because a Layout carries copies: two placements of one vehicle are two copies,
 * and after a Layout has been written out and read back they are not even the
 * same object.
 */
export function withEditedVehicle(layout: Layout, before: Vehicle, after: Vehicle): Layout {
  return {
    ...layout,
    placements: layout.placements.map((placement) =>
      sameVehicle(placement.vehicle, before) ? { ...placement, vehicle: after } : placement,
    ),
  }
}

/**
 * The same Layout with one Placement moved. Nothing else about it changes, not
 * even its angle: moving a vehicle does not turn it.
 *
 * A Placement the caller did not name comes through as the very same object, so
 * an untouched neighbour costs nothing to carry into the next state.
 */
/**
 * The same Layout with one Placement turned, and nothing else about it changed.
 *
 * Turning is not moving: a vehicle that is turned stays where it is, and a
 * vehicle that is moved keeps whatever angle it had.
 */
export function withRotatedPlacement(layout: Layout, id: string, rotationDegrees: number): Layout {
  return {
    ...layout,
    placements: layout.placements.map((placement) =>
      placement.id === id ? { ...placement, rotationDegrees } : placement,
    ),
  }
}

export function withMovedPlacement(layout: Layout, id: string, centre: Offset): Layout {
  return {
    ...layout,
    placements: layout.placements.map((placement) =>
      placement.id === id ? { ...placement, centre } : placement,
    ),
  }
}
