<script lang="ts">
  import { SYSTEM_COLLECTION, allCollections } from '../core/vehicle-collection'
  import type { Vehicle } from '../core/vehicle'
  import { collections } from '../state/collections.svelte'
  import { isDragStart, type Point } from './pointer'
  import ReceivedFrom from './ReceivedFrom.svelte'
  import VehicleSummary from './VehicleSummary.svelte'

  /**
   * The palette presents the visitor's Collections, so it reads them from the
   * one module that holds them rather than being handed them through the App:
   * the tabs, the chosen one and the chips are the same list the Collections
   * sheet edits. What is left as a prop is what belongs to the Site - dropping a
   * vehicle on the map and placing one with no pointer behind it.
   */
  interface Props {
    /** A vehicle was dragged off the palette and let go here. */
    ondrop: (vehicle: Vehicle, point: Point) => void
    /** A vehicle was chosen with no pointer behind it, so it goes somewhere sensible. */
    onplace: (vehicle: Vehicle) => void
  }

  let { ondrop, onplace }: Props = $props()

  /**
   * What the palette is showing: the chosen collection, or the System Collection
   * when the choice is one that is no longer there - so the palette is never
   * empty, whichever collection was deleted underneath it.
   */
  const shown = $derived(
    allCollections(collections.mine ?? []).find((each) => each.id === collections.chosen) ??
      SYSTEM_COLLECTION,
  )

  let carried: Vehicle | undefined = $state(undefined)
  let at = $state<Point>({ x: 0, y: 0 })

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
  <!-- Which collections there are, and which one is being shown. The System
       Collection is always the first tab: it cannot be edited or deleted, and
       the palette is never empty because it is always one of the choices. -->
  <div class="collections">
    {#each allCollections(collections.mine ?? []) as collection (collection.id)}
      <button
        type="button"
        aria-pressed={collection.id === shown.id}
        onclick={() => {
          collections.choose(collection.id)
        }}
      >
        {collection.name}
      </button>
    {/each}
    <button
      type="button"
      onclick={() => {
        collections.show()
      }}>Collections</button
    >
  </div>

  <h2>{shown.name}</h2>

  {#if shown.source !== undefined}
    <!-- Where a received collection came from, said plainly so a visitor can
         tell their own work from somebody else's. A name, and nothing more:
         there are no accounts to say anything else about it. -->
    <div class="source">
      <ReceivedFrom source={shown.source} />
    </div>
  {/if}

  <ul>
    <!-- Keyed by position rather than by name, because a visitor's own
         collection can hold two vehicles that share a name, and two chips with
         the same key is a crash rather than an oddity. -->
    {#each shown.vehicles as vehicle, index (index)}
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
          <VehicleSummary of={vehicle} />
        </button>
      </li>
    {:else}
      <!-- A collection the visitor has just made has nothing in it yet, and
           saying so is kinder than an empty space under its name. -->
      <li>Nothing in this collection yet.</li>
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

  .collections {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-bottom: 0.375rem;
  }

  .collections button {
    font: inherit;
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
  }

  .collections [aria-pressed='true'] {
    font-weight: 600;
    outline: 2px solid currentcolor;
  }

  h2 {
    font-size: 0.875rem;
    font-weight: 600;
    margin: 0 0 0.375rem;
  }

  .source {
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

  li {
    font-size: 0.75rem;
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
    /* A fingertip across: this is a target for a thumb on a phone, and it is
       the only way to get a vehicle onto the ground. */
    min-height: 2.5rem;
    padding: 0.25rem 0.5rem;
    /* Without this the page scrolls under the finger instead of the chip
       coming along with it, which is the whole interaction. */
    touch-action: none;
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
