<script lang="ts">
  import L from 'leaflet'
  import { untrack } from 'svelte'

  import { imageryMap, toBounds, toTuple, type ImageryMap } from '../components/imagery-map'
  import { frameFromCorners, resizedFrame } from '../core/frame-sketch'
  import {
    bearingBetween,
    containsPoint,
    cornersOf,
    latLngFromOffset,
    orientation,
    type LatLng,
    type Offset,
    type SiteFrame,
  } from '../core/geometry'
  import type { ImageryPlan } from '../core/imagery'

  /**
   * Drawing the Site Frame over the one high-resolution image.
   *
   * This is the creator's rectangle, not a visitor's Placement, so it borrows
   * ADR 0005's model without borrowing its code: moving and turning are never
   * the same gesture, and the angle is set on a handle of its own. What a
   * creator needs is fewer gestures and larger targets than a visitor placing a
   * car, so there is no selection step and no long-press - the rectangle is
   * always live, and its corners and its turning handle are big enough for a
   * thumb. A drag anywhere on empty ground draws a fresh rectangle, which is
   * what "draw a rectangle over the space" means, and the handles then reshape
   * what was drawn.
   *
   * The picture is never refetched here. The image is fetched for the Fetch Area
   * before this is mounted and its edge is drawn as a guide, so the creator can
   * see how far the photograph reaches. Nothing clamps the rectangle to that
   * edge: a frame sketched near it can put the visitor's extent - the frame plus
   * its context margin - past what was fetched. That is not broken, because the
   * visitor's page simply fetches that extent; it is only worth knowing before
   * sketching a frame against the edge of the open picture. Adjusting the
   * rectangle itself costs nothing but the drag.
   */

  interface Props {
    /** Where the picture belongs, how sharp it is and how far it may be zoomed. */
    plan: ImageryPlan
    /** An object url for the picture, already fetched. */
    imageUrl: string
    /** Where the Site's own (0, 0) is: the plane every offset is measured in. */
    origin: LatLng
    /** The rectangle as it stands. Absent for a Site that has none yet. */
    frame: SiteFrame | undefined
    /** The rectangle once a gesture has settled. */
    onframe: (frame: SiteFrame) => void
  }

  let { plan, imageUrl, origin, frame, onframe }: Props = $props()

  /**
   * The corner handles, in screen pixels. Larger than a vehicle's turning handle
   * (26 px) because a frame corner is dragged once and has to be got hold of at
   * any zoom, while a vehicle is turned many times in a row.
   */
  const CORNER_HANDLE_PIXELS = 30
  const ROTATION_HANDLE_PIXELS = 34
  /** How far a finger may be from a handle and still be taken to mean it. */
  const HANDLE_HIT_PIXELS = 26
  /** How far past the rectangle's end the turning handle sits. */
  const ROTATION_HANDLE_OFFSET_PIXELS = 30
  /** How far inside the edge of the rectangle a press still takes hold of it. */
  const FRAME_HIT_PADDING_PIXELS = 14

  let element: HTMLDivElement

  let surface = $state.raw<ImageryMap | undefined>(undefined)

  /** Whether a drag draws a fresh rectangle rather than takes hold of the old one. */
  let drawing = $state(untrack(() => frame === undefined))

  /** A rectangle in flight, before the finger has lifted. */
  let live = $state<SiteFrame | undefined>(undefined)

  /** What is being done to the rectangle, if anything. */
  let gesture:
    | { readonly kind: 'draw'; readonly from: Offset }
    | { readonly kind: 'move'; readonly grab: Offset }
    | { readonly kind: 'resize'; readonly held: Offset }
    | { readonly kind: 'turn'; readonly grip: number }
    | undefined = undefined

  /** The rectangle to draw: the one in flight while there is one, the settled one otherwise. */
  const shown = $derived(live ?? frame)

  /** Where the turning handle sits: a fixed number of pixels past the rectangle's end. */
  function rotationPoint(figure: SiteFrame): L.Point | undefined {
    const current = surface
    if (current === undefined) {
      return undefined
    }

    const [first, second, third, fourth] = cornersOf(figure)

    if (
      first === undefined ||
      second === undefined ||
      third === undefined ||
      fourth === undefined
    ) {
      return undefined
    }

    const toScreen = (corner: Offset): L.Point =>
      current.map.latLngToContainerPoint(toTuple(latLngFromOffset(origin, corner)))

    // The corners arrive walking the perimeter, so the first pair is the far end
    // and the second is the near end. Turning is measured from the middle out.
    const nose = toScreen(first).add(toScreen(second)).divideBy(2)
    const tail = toScreen(third).add(toScreen(fourth)).divideBy(2)
    const along = nose.subtract(tail)
    const length = Math.hypot(along.x, along.y)

    if (length === 0) {
      return undefined
    }

    return L.point(
      nose.x + (along.x / length) * ROTATION_HANDLE_OFFSET_PIXELS,
      nose.y + (along.y / length) * ROTATION_HANDLE_OFFSET_PIXELS,
    )
  }

  /** The corner under a press, with the one opposite it that a resize holds still. */
  function cornerAt(
    figure: SiteFrame,
    point: L.Point,
  ): { readonly corner: Offset; readonly held: Offset } | undefined {
    const current = surface
    if (current === undefined) {
      return undefined
    }

    const corners = cornersOf(figure)

    for (const [index, corner] of corners.entries()) {
      const onScreen = current.map.latLngToContainerPoint(toTuple(latLngFromOffset(origin, corner)))

      if (point.distanceTo(onScreen) <= HANDLE_HIT_PIXELS) {
        const held = corners[(index + 2) % corners.length]

        if (held !== undefined) {
          return { corner, held }
        }
      }
    }

    return undefined
  }

  function pressed(event: PointerEvent): void {
    const current = surface
    if (current === undefined) {
      return
    }

    // A second finger is someone pinching, not a second gesture: the drag is
    // abandoned and the map gets both fingers, which is the way to inspect the
    // picture without touching the rectangle.
    if (!current.beginsGesture(event, () => abandon())) {
      return
    }

    const here = current.offsetAt({ x: event.clientX, y: event.clientY })
    if (here === undefined) {
      return
    }

    const figure = shown

    // With nothing to take hold of yet, any drag draws a rectangle.
    if (drawing || figure === undefined) {
      gesture = { kind: 'draw', from: here }
      current.stopPanning()
      return
    }

    const at = current.containerAt(event)
    const turn = rotationPoint(figure)

    if (turn !== undefined && at.distanceTo(turn) <= HANDLE_HIT_PIXELS) {
      // The grip is where the handle was taken hold of, relative to the
      // rectangle's own angle, so turning does not jump under the finger.
      gesture = { kind: 'turn', grip: bearingBetween(figure.centre, here) - figure.rotationDegrees }
      current.stopPanning()
      return
    }

    const corner = cornerAt(figure, at)

    if (corner !== undefined) {
      gesture = { kind: 'resize', held: corner.held }
      current.stopPanning()
      return
    }

    if (containsPoint(figure, here, current.metresForPixels(FRAME_HIT_PADDING_PIXELS))) {
      gesture = {
        kind: 'move',
        grab: {
          eastMetres: figure.centre.eastMetres - here.eastMetres,
          northMetres: figure.centre.northMetres - here.northMetres,
        },
      }
      current.stopPanning()
      return
    }

    // Anywhere else is the map's own: Leaflet pans, which is how the creator
    // looks around inside the picture.
  }

  function moved(event: PointerEvent): void {
    const acting = gesture
    if (acting === undefined) {
      return
    }

    const current = surface
    if (current === undefined) {
      return
    }

    const here = current.offsetAt({ x: event.clientX, y: event.clientY })
    if (here === undefined) {
      return
    }

    if (acting.kind === 'draw') {
      live = frameFromCorners(acting.from, here)
      return
    }

    const figure = frame
    if (figure === undefined) {
      return
    }

    if (acting.kind === 'move') {
      live = {
        ...figure,
        centre: {
          eastMetres: here.eastMetres + acting.grab.eastMetres,
          northMetres: here.northMetres + acting.grab.northMetres,
        },
      }
      return
    }

    if (acting.kind === 'resize') {
      // A drag that would leave a side too small keeps the last good rectangle,
      // rather than blinking the frame away under the finger.
      live = resizedFrame(figure, acting.held, here) ?? live
      return
    }

    live = {
      ...figure,
      rotationDegrees: orientation(bearingBetween(figure.centre, here) - acting.grip),
    }
  }

  function released(): void {
    const settled = live
    const acting = gesture

    gesture = undefined
    live = undefined
    surface?.allowPanning()

    if (settled === undefined || acting === undefined) {
      return
    }

    // A draw that was too small to be a space left nothing to commit, so the
    // mode stays armed and the next drag is the one that counts.
    drawing = false
    onframe(settled)
  }

  function cancelled(): void {
    abandon()
  }

  function abandon(): void {
    gesture = undefined
    live = undefined
    surface?.allowPanning()
  }

  /** Draw a fresh rectangle, throwing the old one away if there was one. */
  function drawAgain(): void {
    live = undefined
    drawing = true
  }

  /** A handle, built as an element so a shape this small carries no stylesheet. */
  function knob(kind: 'corner' | 'turn'): HTMLSpanElement {
    const handle = document.createElement('span')

    handle.style.background = '#fff'
    handle.style.border = '3px solid #1b1b1b'
    handle.style.borderRadius = kind === 'turn' ? '50%' : '4px'
    handle.style.boxSizing = 'border-box'
    handle.style.display = 'block'
    handle.style.height = '100%'
    handle.style.width = '100%'

    return handle
  }

  $effect(() => {
    const created = imageryMap(element, plan, imageUrl, origin)

    created.map.fitBounds(toBounds(plan.bounds), { padding: [24, 24] })

    // The edge of the fetched picture, drawn so the creator can see how far the
    // photograph reaches before sketching a frame near it. It is a guide and not
    // a limit: what is outside it is simply not photographed yet.
    L.rectangle(toBounds(plan.bounds), {
      className: 'fetch-area-guide',
      color: '#9ca3af',
      weight: 1,
      dashArray: '4 4',
      fill: false,
      interactive: false,
    }).addTo(created.map)

    surface = created

    return () => {
      surface = undefined
      created.destroy()
    }
  })

  $effect(() => {
    const current = surface
    const figure = shown

    if (current === undefined) {
      return
    }

    const into = current.layers

    into.clearLayers()

    if (figure === undefined) {
      return
    }

    L.polygon(
      cornersOf(figure).map((corner) => toTuple(latLngFromOffset(origin, corner))),
      {
        className: 'frame-sketch',
        color: '#ffd166',
        weight: 3,
        fill: false,
        interactive: false,
      },
    ).addTo(into)

    if (drawing) {
      return
    }

    for (const corner of cornersOf(figure)) {
      L.marker(toTuple(latLngFromOffset(origin, corner)), {
        icon: L.divIcon({
          className: 'frame-corner',
          html: knob('corner'),
          iconSize: L.point(CORNER_HANDLE_PIXELS, CORNER_HANDLE_PIXELS),
        }),
        // Hit-tested by distance rather than by the element, so a handle catches
        // a press that lands near it even when the press is not exactly on it.
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(into)
    }

    const turn = rotationPoint(figure)
    if (turn !== undefined) {
      L.marker(current.map.containerPointToLatLng(turn), {
        icon: L.divIcon({
          className: 'frame-turn',
          html: knob('turn'),
          iconSize: L.point(ROTATION_HANDLE_PIXELS, ROTATION_HANDLE_PIXELS),
        }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(into)
    }
  })
</script>

<svelte:window onpointermove={moved} onpointerup={released} onpointercancel={cancelled} />

<!-- The image is a pointer-driven canvas. The controls around it are focusable
     and labelled; drawing, moving, resizing and turning the rectangle are
     pointer-only by design, the way the visitor's map is (ADR 0005), because
     there is no honest keyboard equivalent to dragging a corner over a
     photograph. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="map" bind:this={element} onpointerdown={pressed}></div>

<div class="tools">
  <button type="button" onclick={drawAgain}>Draw a new rectangle</button>
  <p class="hint">
    Drag over the space to draw it, drag the middle to move it, drag a corner to resize it, and drag
    the round handle to turn it.
  </p>
</div>

<style>
  .map {
    background: #111;
    flex: 1;
    min-height: 18rem;
  }

  .tools {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .tools button {
    padding: 0.25rem 0.75rem;
  }

  .hint {
    font-size: 0.75rem;
    margin: 0;
  }
</style>
