<script lang="ts">
  import L from 'leaflet'

  import {
    bearingBetween,
    containsPoint,
    cornersOf,
    latLngFromOffset,
    type LatLng,
    type Offset,
    type SiteFrame,
  } from '../core/geometry'
  import type { ImageryPlan } from '../core/imagery'
  import { LABEL_FONT_PIXELS, labelFor, labelRotationFor } from '../core/label'
  import { overlappingIds, rectangleOf, type Placement } from '../core/layout'
  import { cssColour } from '../core/colour'
  import { snapAngle, snapCandidates } from '../core/snapping'
  import { imageryMap, toBounds, toTuple, type ImageryMap } from './imagery-map'
  import type { Point } from './pointer'

  /**
   * How far past a drawn vehicle a fingertip still counts as being on it, in
   * screen pixels rather than in metres. A vehicle is two metres across and a
   * fingertip is not, and a fixed number of metres would be invisible exactly
   * when it is needed - zoomed out, where a car is a handful of pixels.
   */
  const HIT_PADDING_PIXELS = 8

  /** The diameter of the handle a vehicle is turned by, in screen pixels. */
  const HANDLE_PIXELS = 26

  /**
   * The outline a vehicle wears when it covers part of another.
   *
   * Overlap and selection are told apart by different channels rather than by
   * one, so that a vehicle which is both is still readable as both. Overlap owns
   * the colour, and this red is it. Selection owns the width, the handle and the
   * open form. Nothing here asks the outline colour to say two things at once.
   */
  const OVERLAP_COLOUR = '#dc2626'

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
    /**
     * How see-through every placed vehicle is drawn. A view of the session
     * rather than a property of a vehicle, so it arrives here rather than being
     * kept with a Layout.
     */
    opacity: number
    onselect: (id: string | undefined) => void
    onmove: (id: string, centre: Offset) => void
    onrotate: (id: string, rotationDegrees: number) => void
  }

  let {
    imageUrl,
    plan,
    origin,
    frame,
    placements,
    selectedId,
    opacity,
    onselect,
    onmove,
    onrotate,
  }: Props = $props()

  let element: HTMLDivElement

  // Held raw, so Leaflet's own objects are never wrapped in a reactive proxy -
  // which would break them - and held in state all the same, so that drawing can
  // wait for the map to exist without guessing when that was.
  let surface = $state.raw<ImageryMap | undefined>(undefined)

  /** A move in progress: what is being carried, and where it was taken hold of. */
  let moving: { readonly id: string; readonly grab: Offset } | undefined = undefined

  /** Where a carried vehicle is this instant, before the move is committed. */
  let dragged = $state<Offset | undefined>(undefined)

  /** A turn in progress: what is being turned, and the angle it was taken hold at. */
  let turning: { readonly id: string; readonly grip: number } | undefined = undefined

  /** The angle a vehicle is being turned through, before the turn is committed. */
  let turned = $state<number | undefined>(undefined)

  /**
   * Where a point on the screen is on the ground, or nothing when it is off the
   * map. The palette asks this when a vehicle is let go over the picture; the
   * press handler asks it about its own finger.
   */
  export function offsetAt(point: Point): Offset | undefined {
    return surface?.offsetAt(point)
  }

  /**
   * What a vehicle being turned may snap to: the angle the space itself is at,
   * and the angles of the other vehicles already on the ground here. Never north.
   */
  function candidatesFor(id: string): number[] {
    return snapCandidates(
      frame?.rotationDegrees,
      placements.filter((each) => each.id !== id).map((each) => each.rotationDegrees),
    )
  }

  /**
   * Where the handle sits: just past the nose of a vehicle, along its length, a
   * fixed number of screen pixels out.
   *
   * In pixels rather than metres because the handle is a finger target at every
   * zoom, and past the nose rather than on it because turning a vehicle and
   * moving one must never be the same press.
   */
  function handlePoint(corners: readonly LatLng[]): LatLng | undefined {
    const current = surface
    if (current === undefined) {
      return undefined
    }

    const [first, second, third, fourth] = corners.map((corner) =>
      current.map.latLngToContainerPoint(toTuple(corner)),
    )

    if (
      first === undefined ||
      second === undefined ||
      third === undefined ||
      fourth === undefined
    ) {
      return undefined
    }

    // The corners arrive walking the perimeter, so the first pair is the nose
    // and the second is the tail.
    const nose = first.add(second).divideBy(2)
    const tail = third.add(fourth).divideBy(2)
    const along = nose.subtract(tail)
    const length = Math.hypot(along.x, along.y)

    if (length === 0) {
      return undefined
    }

    const at = current.map.containerPointToLatLng(
      L.point(
        nose.x + (along.x / length) * HANDLE_PIXELS,
        nose.y + (along.y / length) * HANDLE_PIXELS,
      ),
    )

    return { latitude: at.lat, longitude: at.lng }
  }

  function pressed(event: PointerEvent): void {
    const current = surface
    if (current === undefined) {
      return
    }

    // A second finger on a vehicle being handled is not a second gesture: it is
    // someone pinching, so the gesture is abandoned and the map gets both fingers.
    if (
      !current.beginsGesture(event, () => {
        stopMoving()
        stopTurning()
      })
    ) {
      return
    }

    const here = current.offsetAt({ x: event.clientX, y: event.clientY })
    if (here === undefined) {
      return
    }

    // A press on the handle turns the vehicle it belongs to, and never moves it.
    if (event.target instanceof Element && event.target.closest('.rotation-handle') !== null) {
      const chosen = placements.find((each) => each.id === selectedId)
      if (chosen === undefined) {
        return
      }

      // The grip is the angle the handle was taken hold of at, relative to the
      // vehicle's own angle, so that turning does not jump under the finger.
      turning = {
        id: chosen.id,
        grip: bearingBetween(chosen.centre, here) - chosen.rotationDegrees,
      }
      current.stopPanning()
      return
    }

    // Last drawn first, so the vehicle on top is the one that is grabbed.
    const hit = [...placements]
      .reverse()
      .find((each) =>
        containsPoint(rectangleOf(each), here, current.metresForPixels(HIT_PADDING_PIXELS)),
      )

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
    current.stopPanning()
  }

  function moved(event: PointerEvent): void {
    const current = surface
    if (current === undefined) {
      return
    }

    const here = current.offsetAt({ x: event.clientX, y: event.clientY })
    if (here === undefined) {
      return
    }

    const spin = turning
    if (spin !== undefined) {
      const chosen = placements.find((each) => each.id === spin.id)
      if (chosen === undefined) {
        return
      }

      // Snapped as it turns rather than only on release, so a vehicle can be seen
      // to settle onto the row it is being lined up with.
      turned = snapAngle(bearingBetween(chosen.centre, here) - spin.grip, candidatesFor(spin.id))
      return
    }

    const carry = moving
    if (carry === undefined) {
      return
    }

    // The vehicle keeps the grip it was taken by, so it does not jump under the
    // finger. A finger that leaves the map stops moving it and one that comes
    // back carries on from where it left off, rather than snapping to itself.
    dragged = {
      eastMetres: here.eastMetres + carry.grab.eastMetres,
      northMetres: here.northMetres + carry.grab.northMetres,
    }
  }

  function released(): void {
    const spin = turning

    if (spin !== undefined) {
      const settled = turned

      stopTurning()

      if (settled !== undefined) {
        onrotate(spin.id, settled)
      }
      return
    }

    if (moving === undefined) {
      return
    }

    const settled = dragged
    const id = moving.id

    stopMoving()

    if (settled !== undefined) {
      onmove(id, settled)
    }
  }

  function cancelled(): void {
    stopMoving()
    stopTurning()
  }

  function stopMoving(): void {
    if (moving === undefined) {
      return
    }

    moving = undefined
    dragged = undefined
    surface?.allowPanning()
  }

  function stopTurning(): void {
    if (turning === undefined) {
      return
    }

    turning = undefined
    turned = undefined
    surface?.allowPanning()
  }

  /** How long a vehicle is on screen right now, in pixels. */
  function screenLength(corners: readonly LatLng[]): number {
    const current = surface
    const [, second, third] =
      current === undefined
        ? []
        : corners.map((corner) => current.map.latLngToContainerPoint(toTuple(corner)))

    if (second === undefined || third === undefined) {
      return 0
    }

    // The corners arrive walking the perimeter, so the second edge is the one
    // running along the vehicle's length.
    return second.distanceTo(third)
  }

  function draw(
    corners: readonly LatLng[],
    placement: Placement,
    selected: boolean,
    overlapping: boolean,
  ): void {
    const into = surface?.layers
    if (into === undefined) {
      return
    }

    L.polygon(corners.map(toTuple), {
      className: `placement${selected ? ' selected' : ''}${overlapping ? ' overlapping' : ''}`,
      color: overlapping ? OVERLAP_COLOUR : selected ? '#ffffff' : '#1b1b1b',
      weight: selected ? 3 : overlapping ? 2 : 1,
      fillColor: cssColour(placement.vehicle.colour),
      // The fill's opacity is not set here: it is the view's, and reaches every
      // placement through the variable the map sets below.
      interactive: false,
    }).addTo(into)

    if (selected) {
      const at = handlePoint(corners)

      if (at !== undefined) {
        L.marker(toTuple(at), {
          icon: L.divIcon({
            className: 'rotation-handle',
            iconSize: L.point(HANDLE_PIXELS, HANDLE_PIXELS),
          }),
          // Interactive so that the element is hit-testable at all: the gesture
          // reads the event's target, and a marker that takes no pointer events
          // is a handle nobody can take hold of.
          interactive: true,
          keyboard: false,
          zIndexOffset: 1000,
        }).addTo(into)
      }
    }

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
    const created = imageryMap(element, plan, imageUrl, origin)

    if (frame === undefined) {
      created.map.fitBounds(toBounds(plan.bounds))
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
      ).addTo(created.map)

      created.map.fitBounds(guide.getBounds(), { padding: [16, 16] })
    }

    surface = created

    return () => {
      surface = undefined
      created.destroy()
    }
  })

  $effect(() => {
    const current = surface
    if (current === undefined) {
      return
    }

    const into = current.layers
    const chosen = selectedId
    const carried = dragged
    const spun = turned

    // What is drawn, which is the layout with anything in flight laid over it:
    // a vehicle being carried is where the finger is, and one being turned is at
    // the angle the finger has reached.
    const shown = placements.map((placement) => ({
      ...placement,
      ...(carried !== undefined && moving?.id === placement.id ? { centre: carried } : {}),
      ...(spun !== undefined && turning?.id === placement.id ? { rotationDegrees: spun } : {}),
    }))

    // Asked of the same placements that are about to be drawn, the ones in
    // flight included, so a vehicle carried over another is marked while it is
    // over it rather than only once the finger is lifted. The rectangles are the
    // ones drawn below, so the mark and the picture cannot disagree.
    //
    // Deliberately not the committed placements the count panel reads: that
    // panel answers how many are *placed*, which is a fact about the Layout, and
    // this answers what the picture is about to show, which follows the finger.
    // During a drag the two therefore disagree until the finger lifts, and that
    // is the point of each - a count that waited for the finger would lag, and a
    // mark that waited for the commit would not mark what is drawn.
    const overlapping = overlappingIds(shown)

    const drawAll = (): void => {
      into.clearLayers()
      for (const placement of shown) {
        draw(
          cornersOf(rectangleOf(placement)).map((corner) => latLngFromOffset(origin, corner)),
          placement,
          placement.id === chosen,
          overlapping.has(placement.id),
        )
      }
    }

    drawAll()

    // A label is measured in screen pixels, so what fits on a vehicle changes
    // with the zoom rather than with anything about the layout.
    current.map.on('zoomend', drawAll)

    return () => {
      current.map.off('zoomend', drawAll)
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
  style={`--label-font-pixels: ${String(LABEL_FONT_PIXELS)}px; --placement-opacity: ${String(
    opacity,
  )}`}
></div>

<style>
  .map {
    /* Fills what is left of the screen, so the photograph is the point of the
       page rather than an illustration on it.
       No floor of its own: the stage decides how tall the photograph may be,
       and on a short phone the map gives way to the controls below it rather
       than sitting on top of them. It was a `min-height` here that pushed the
       Layouts row and the palette off a 390x664 screen. */
    background: #111;
    flex: 1;
    min-height: 0;
  }
</style>
