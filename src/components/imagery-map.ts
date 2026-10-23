import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import {
  metresPerPixel,
  offsetFromLatLng,
  type LatLng,
  type LatLngBounds,
  type Offset,
} from '../core/geometry'
import type { ImageryPlan } from '../core/imagery'
import { isDragStart, type Point } from './pointer'

/**
 * The Leaflet map both maps are: one picture, drawn at true scale, and the few
 * things read off it.
 *
 * The visitor's map and the creator's draw different things on top and answer to
 * different gestures, but the picture beneath them is one picture in one plane,
 * and the way a screen point becomes a piece of ground is the same question in
 * both. A second copy of that is a second opinion about where a finger landed -
 * which, over a photograph, is a second opinion about what someone just drew.
 * The same is true of the drag a gesture takes from the map, and of the way both
 * are taken down.
 *
 * What each component draws on top stays with that component; this is the map,
 * the picture on it, the layer the rest goes into, and the way it is let go.
 */

/** A point in degrees, as the shape Leaflet places things by. */
export function toTuple(point: LatLng): L.LatLngTuple {
  return [point.latitude, point.longitude]
}

/** A box in degrees, as the shape Leaflet places things by. */
export function toBounds(bounds: LatLngBounds): L.LatLngBounds {
  return L.latLngBounds(toTuple(bounds.southWest), toTuple(bounds.northEast))
}

export interface ImageryMap {
  /** The map itself, for fitting a view and for reading a scale back. */
  readonly map: L.Map
  /** Where the layers a component draws belong. */
  readonly layers: L.LayerGroup
  /** Where a point on the screen is on the ground, or nothing when it is off the map. */
  offsetAt(point: Point): Offset | undefined
  /** A press in the coordinates Leaflet works in, so a handle can be hit-tested. */
  containerAt(event: PointerEvent): L.Point
  /** How much ground a number of screen pixels is at this zoom. */
  metresForPixels(pixels: number): number
  /**
   * Whether a press begins a gesture. A second finger is someone pinching rather
   * than a second drag, so it is handed back to the map through the callback and
   * the press is not a gesture.
   */
  beginsGesture(event: PointerEvent, onSecondFinger: () => void): boolean
  /** Take the drag from the map while a gesture owns the finger. */
  stopPanning(): void
  /** Give the drag back to the map. */
  allowPanning(): void
  /** Remove the map and everything in it. */
  destroy(): void
}

export function imageryMap(
  element: HTMLElement,
  plan: ImageryPlan,
  imageUrl: string,
  origin: LatLng,
): ImageryMap {
  const map = L.map(element, {
    // The plane the imagery is fetched in, so the picture is never stretched.
    crs: L.CRS.EPSG3857,
    attributionControl: false,
    // So the picture can sit exactly in the view rather than near it.
    zoomSnap: 0,
    maxZoom: plan.maxZoom,
  })

  L.imageOverlay(imageUrl, toBounds(plan.bounds)).addTo(map)

  const layers = L.layerGroup().addTo(map)

  return {
    map,
    layers,

    offsetAt(point) {
      const rect = element.getBoundingClientRect()
      if (
        point.x < rect.left ||
        point.x > rect.right ||
        point.y < rect.top ||
        point.y > rect.bottom
      ) {
        return undefined
      }

      const onTheGround = map.containerPointToLatLng(
        L.point(point.x - rect.left, point.y - rect.top),
      )

      return offsetFromLatLng(origin, {
        latitude: onTheGround.lat,
        longitude: onTheGround.lng,
      })
    },

    containerAt(event) {
      const rect = element.getBoundingClientRect()

      return L.point(event.clientX - rect.left, event.clientY - rect.top)
    },

    metresForPixels(pixels) {
      const centre = map.getCenter()

      return pixels * metresPerPixel(centre.lat, map.getZoom())
    },

    beginsGesture(event, onSecondFinger) {
      if (!event.isPrimary) {
        onSecondFinger()
        return false
      }

      return isDragStart(event)
    },

    stopPanning() {
      map.dragging.disable()
    },

    allowPanning() {
      map.dragging.enable()
    },

    destroy() {
      map.remove()
    },
  }
}
