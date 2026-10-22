<script lang="ts">
  import L from 'leaflet'
  import 'leaflet/dist/leaflet.css'

  import {
    containsPoint,
    cornersOf,
    latLngFromOffset,
    metresPerPixel,
    offsetFromLatLng,
    type LatLng,
    type LatLngBounds,
    type Offset,
    type SiteFrame,
  } from '../core/geometry'
  import type { ImageryPlan } from '../core/imagery'
  import { LABEL_FONT_PIXELS, labelFor, labelRotationFor } from '../core/label'
  import { rectangleOf, type Placement } from '../core/layout'
  import { cssColour } from '../core/colour'
  import { isDragStart, type Point } from './pointer'

  /**
   * How far past a drawn vehicle a fingertip still counts as being on it, in
   * screen pixels rather than in metres. A vehicle is two metres across and a
   * fingertip is not, and a fixed number of metres would be invisible exactly
   * when it is needed - zoomed out, where a car is a handful of pixels.
   */
  const HIT_PADDING_PIXELS = 8

  interface Props {
    /** An object url for the picture, already fetched. */
    imageUrl: string
    /** Where the picture belongs, how sharp it is, and how far it may be zoomed. */
    plan: ImageryPlan
    /** Where the Site's own (0, 0) is: the plane every offset is measured in. */
    origin: LatLng
    /** The frame, drawn as the guide it is. A Site need not have one. */
    frame: SiteFrame | undefined
    placements: readonly Placement[]
    /** The Placement that is selected, if one is. */
    selectedId: string | undefined
    onselect: (id: string | undefined) => void
    onmove: (id: string, centre: Offset) => void
  }

  let { imageUrl, plan, origin, frame, placements, selectedId, onselect, onmove }: Props = $props()

  let element: HTMLDivElement

  // Held raw, so Leaflet's own objects are never wrapped in a reactive proxy -
  // which would break them - and held in state all the same, so that drawing can
  // wait for the map to exist without guessing when that was.
  let map = $state.raw<L.Map | undefined>(undefined)
  let shapes = $state.raw<L.LayerGroup | undefined>(undefined)

  /** A move in progress: what is being carried, and where it was taken hold of. */
  let moving: { readonly id: string; readonly grab: Offset } | undefined = undefined

  /** Where a carried vehicle is this instant, before the move is committed. */
  let dragged = $state<Offset | undefined>(undefined)

  /**
   * Where a point on the screen is on the ground, or nothing when it is off the
   * map. The palette asks this when a vehicle is let go over the picture; the
   * press handler asks it about its own finger.
   */
  export function offsetAt(point: Point): Offset | undefined {
    const current = map
    if (current === undefined) {
      return undefined
    }

    const rect = element.getBoundingClientRect()
    if (
      point.x < rect.left ||
      point.x > rect.right ||
      point.y < rect.top ||
      point.y > rect.bottom
    ) {
      return undefined
    }

    const onTheGround = current.containerPointToLatLng(
      L.point(point.x - rect.left, point.y - rect.top),
    )

    return offsetFromLatLng(origin, {
      latitude: onTheGround.lat,
      longitude: onTheGround.lng,
    })
  }

  function toTuple(point: LatLng): L.LatLngTuple {
    return [point.latitude, point.longitude]
  }

  function toBounds(bounds: LatLngBounds): L.LatLngBounds {
    return L.latLngBounds(toTuple(bounds.southWest), toTuple(bounds.northEast))
  }

  /**
   * The padding above, in ground metres, which is the only form `containsPoint`
   * can use and which changes with the zoom. The map's own scale answers it,
   * from the same core function that decides what true scale means.
   */
  function hitPaddingMetres(): number {
    const current = map
    if (current === undefined) {
      return 0
    }

    const centre = current.getCenter()

    return HIT_PADDING_PIXELS * metresPerPixel(centre.lat, current.getZoom())
  }

  function pressed(event: PointerEvent): void {
    const current = map
    if (current === undefined) {
      return
    }

    // A second finger on a vehicle being moved is not a second move: it is
    // someone pinching, so the move is abandoned and the map gets both fingers.
    if (!event.isPrimary) {
      stopMoving(current)
      return
    }
    if (!isDragStart(event)) {
      return
    }

    const here = offsetAt({ x: event.clientX, y: event.clientY })
    if (here === undefined) {
      return
    }

    // Last drawn first, so the vehicle on top is the one that is grabbed.
    const hit = [...placements]
      .reverse()
      .find((each) => containsPoint(rectangleOf(each), here, hitPaddingMetres()))

    if (hit === undefined) {
      onselect(undefined)
      return
    }

    onselect(hit.id)
    moving = {
      id: hit.id,
      grab: {
        eastMetres: hit.centre.eastMetres - here.eastMetres,
        northMetres: hit.centre.northMetres - here.northMetres,
      },
    }

    // A press on a vehicle moves the vehicle rather than the picture. Leaflet
    // starts its own drag from mousedown, which arrives after this, so stopping
    // it here is in time. Everything not on a vehicle is left alone.
    current.dragging.disable()
  }

  function moved(event: PointerEvent): void {
    if (moving === undefined) {
      return
    }

    const here = offsetAt({ x: event.clientX, y: event.clientY })
    if (here === undefined) {
      return
    }

    // The vehicle keeps the grip it was taken by, so it does not jump under the
    // finger. A finger that leaves the map stops moving it and one that comes
    // back carries on from where it left off, rather than snapping to itself.
    dragged = {
      eastMetres: here.eastMetres + moving.grab.eastMetres,
      northMetres: here.northMetres + moving.grab.northMetres,
    }
  }

  function released(): void {
    if (moving === undefined) {
      return
    }

    const settled = dragged
    const id = moving.id

    stopMoving(map)

    if (settled !== undefined) {
      onmove(id, settled)
    }
  }

  function cancelled(): void {
    stopMoving(map)
  }

  function stopMoving(current: L.Map | undefined): void {
    if (moving === undefined) {
      return
    }

    moving = undefined
    dragged = undefined
    current?.dragging.enable()
  }

  /** How long a vehicle is on screen right now, in pixels. */
  function screenLength(corners: readonly LatLng[]): number {
    const current = map
    const [, second, third] =
      current === undefined
        ? []
        : corners.map((corner) => current.latLngToContainerPoint(toTuple(corner)))

    if (second === undefined || third === undefined) {
      return 0
    }

    // The corners arrive walking the perimeter, so the second edge is the one
    // running along the vehicle's length.
    return second.distanceTo(third)
  }

  function draw(corners: readonly LatLng[], placement: Placement, selected: boolean): void {
    const into = shapes
    if (into === undefined) {
      return
    }

    L.polygon(corners.map(toTuple), {
      className: selected ? 'placement selected' : 'placement',
      color: selected ? '#ffffff' : '#1b1b1b',
      weight: selected ? 3 : 1,
      fillColor: cssColour(placement.vehicle.colour),
      fillOpacity: selected ? 0.6 : 0.4,
      interactive: false,
    }).addTo(into)

    const text = labelFor(placement.vehicle, screenLength(corners))
    if (text === undefined) {
      return
    }

    // Built as an element rather than as markup, because a name is whatever
    // someone typed and this way it is never anything but text.
    const label = document.createElement('span')
    label.className = 'placement-label'
    label.textContent = text
    label.style.transform = `translate(-50%, -50%) rotate(${String(
      labelRotationFor(placement.rotationDegrees),
    )}deg)`

    L.marker(toTuple(latLngFromOffset(origin, placement.centre)), {
      icon: L.divIcon({ className: 'placement-label-anchor', html: label, iconSize: [0, 0] }),
      interactive: false,
      keyboard: false,
    }).addTo(into)
  }

  $effect(() => {
    const created = L.map(element, {
      // The plane the imagery is fetched in, so the picture is never stretched.
      crs: L.CRS.EPSG3857,
      attributionControl: false,
      // So opening a Site can sit exactly on its frame instead of near it.
      zoomSnap: 0,
      maxZoom: plan.maxZoom,
    })

    L.imageOverlay(imageUrl, toBounds(plan.bounds)).addTo(created)

    if (frame === undefined) {
      created.fitBounds(toBounds(plan.bounds))
    } else {
      // A guide and never a limit, which is why it is drawn as an outline rather
      // than as a mask over everything outside it.
      const guide = L.polygon(
        cornersOf(frame).map((corner) => toTuple(latLngFromOffset(origin, corner))),
        {
          className: 'frame-guide',
          color: '#ffd166',
          weight: 2,
          dashArray: '6 4',
          fill: false,
          interactive: false,
        },
      ).addTo(created)

      created.fitBounds(guide.getBounds(), { padding: [16, 16] })
    }

    shapes = L.layerGroup().addTo(created)
    map = created

    return () => {
      map = undefined
      shapes = undefined
      created.remove()
    }
  })

  $effect(() => {
    const current = map
    const into = shapes
    if (current === undefined || into === undefined) {
      return
    }

    const chosen = selectedId
    const carried = dragged

    const shown = placements.map((placement) =>
      carried !== undefined && moving?.id === placement.id
        ? { ...placement, centre: carried }
        : placement,
    )

    const drawAll = (): void => {
      into.clearLayers()
      for (const placement of shown) {
        draw(
          cornersOf(rectangleOf(placement)).map((corner) => latLngFromOffset(origin, corner)),
          placement,
          placement.id === chosen,
        )
      }
    }

    drawAll()

    // A label is measured in screen pixels, so what fits on a vehicle changes
    // with the zoom rather than with anything about the layout.
    current.on('zoomend', drawAll)

    return () => {
      current.off('zoomend', drawAll)
    }
  })
</script>

<svelte:window onpointermove={moved} onpointerup={released} onpointercancel={cancelled} />

<!-- The map is a pointer-driven canvas. The spec exempts it from the
     accessibility baseline and asks for that to be documented rather than left
     ambiguous, so this is the documentation: buttons, the palette and the
     photograph's credit line are all focusable and labelled, and the palette is
     operable by keyboard, while moving and turning a vehicle are pointer-only
     by design. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="map"
  bind:this={element}
  onpointerdown={pressed}
  style={`--label-font-pixels: ${String(LABEL_FONT_PIXELS)}px`}
></div>

<style>
  .map {
    /* Fills what is left of the screen, so the photograph is the point of the
       page rather than an illustration on it. */
    flex: 1;
    min-height: 20rem;
    background: #111;
  }
</style>
