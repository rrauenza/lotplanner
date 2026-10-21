<script lang="ts">
  import { systemVehicles } from '../core/collection'
  import { toFeetAndInches } from '../core/units'
  import type { Vehicle } from '../core/vehicle'

  function cssColour(colour: number): string {
    return `#${colour.toString(16).padStart(6, '0')}`
  }

  /** Read back the way a vehicle is published, so it can be checked at a glance. */
  function size(of: Vehicle): string {
    return `${toFeetAndInches(of.lengthInches)} x ${toFeetAndInches(of.widthInches)}`
  }
</script>

<aside aria-label="Vehicles">
  <h2>Vehicles</h2>
  <ul>
    {#each systemVehicles as vehicle (vehicle.name)}
      <li>
        <span class="swatch" style={`background: ${cssColour(vehicle.colour)}`}></span>
        <span>{vehicle.name}</span>
        <span class="size">{size(vehicle)}</span>
      </li>
    {/each}
  </ul>
</aside>

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

  li {
    align-items: center;
    border: 1px solid color-mix(in srgb, currentcolor 35%, transparent);
    border-radius: 0.25rem;
    display: flex;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
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
</style>
