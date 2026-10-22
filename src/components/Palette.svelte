<script lang="ts">
  import { SYSTEM_COLLECTION_NAME, systemVehicles } from '../core/collection'
  import { cssColour } from '../core/colour'
  import { toFeetAndInches } from '../core/units'
  import type { Vehicle } from '../core/vehicle'
  import { isDragStart, type Point } from './pointer'

  interface Props {
    /** A vehicle was dragged off the palette and let go here. */
    ondrop: (vehicle: Vehicle, point: Point) => void
    /** A vehicle was chosen with no pointer behind it, so it goes somewhere sensible. */
    onplace: (vehicle: Vehicle) => void
  }

  let { ondrop, onplace }: Props = $props()

  let carried: Vehicle | undefined = $state(undefined)
  let at = $state<Point>({ x: 0, y: 0 })

  /** Read back the way a vehicle is published, so it can be checked at a glance. */
  function size(of: Vehicle): string {
    return `${toFeetAndInches(of.lengthInches)} x ${toFeetAndInches(of.widthInches)}`
  }

  function picked(vehicle: Vehicle, event: PointerEvent): void {
    // One finger, one vehicle: a second finger, or anything but the left button,
    // is not a drag.
    if (!isDragStart(event)) {
      return
    }

    carried = vehicle
    at = { x: event.clientX, y: event.clientY }
  }

  function moved(event: PointerEvent): void {
    if (carried === undefined) {
      return
    }
    at = { x: event.clientX, y: event.clientY }
  }

  function released(event: PointerEvent): void {
    const vehicle = carried
    if (vehicle === undefined) {
      return
    }

    carried = undefined
    ondrop(vehicle, { x: event.clientX, y: event.clientY })
  }

  function cancelled(): void {
    carried = undefined
  }
</script>

<svelte:window onpointermove={moved} onpointerup={released} onpointercancel={cancelled} />

<aside aria-label="Vehicles">
  <!-- The panel is the vehicles; the heading names the collection they are from,
       which is the System Collection until this app has collections of its own. -->
  <h2>{SYSTEM_COLLECTION_NAME}</h2>
  <ul>
    {#each systemVehicles as vehicle (vehicle.name)}
      <li>
        <button
          type="button"
          onpointerdown={(event) => {
            picked(vehicle, event)
          }}
          onclick={(event) => {
            // A click carrying no detail came from a keyboard or a screen
            // reader rather than from a finger, and those cannot drag. The
            // vehicle goes to the middle of the frame instead of nowhere.
            if (event.detail === 0) {
              onplace(vehicle)
            }
          }}
        >
          <span class="swatch" style={`background: ${cssColour(vehicle.colour)}`}></span>
          <span>{vehicle.name}</span>
          <span class="size">{size(vehicle)}</span>
        </button>
      </li>
    {/each}
  </ul>
</aside>

{#if carried !== undefined}
  <!-- Follows the finger so a drag has something to be about, and takes no
       pointer events so that what is underneath is still what is let go over. -->
  <p class="ghost" aria-hidden="true" style={`left: ${String(at.x)}px; top: ${String(at.y)}px`}>
    {carried.name}
  </p>
{/if}

<style>
  aside {
    /* A row of chips rather than a second column, so it works one-handed on a
       phone, which is where the app is meant to be used. */
    max-height: 32vh;
    overflow-y: auto;
  }

  h2 {
    font-size: 0.875rem;
    font-weight: 600;
    margin: 0 0 0.375rem;
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  button {
    align-items: center;
    background: none;
    border: 1px solid color-mix(in srgb, currentcolor 35%, transparent);
    border-radius: 0.25rem;
    color: inherit;
    display: flex;
    font: inherit;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    /* Without this the page scrolls under the finger instead of the chip
       coming along with it, which is the whole interaction. */
    touch-action: none;
  }

  .swatch {
    border-radius: 0.125rem;
    height: 1rem;
    width: 1rem;
  }

  .size {
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }

  .ghost {
    background: #222;
    border-radius: 0.25rem;
    color: #fff;
    font-size: 0.75rem;
    margin: 0;
    padding: 0.25rem 0.5rem;
    pointer-events: none;
    position: fixed;
    transform: translate(-50%, -180%);
  }
</style>
