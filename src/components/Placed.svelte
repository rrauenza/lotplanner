<script lang="ts">
  import { cssColour } from '../core/colour'
  import { countsByVehicle, overlappingIds, type Placement } from '../core/layout'

  /**
   * The answer to the question the app is for: how many of each vehicle are on
   * the ground here, and whether any two of them are in the same place.
   *
   * Both are read off the Placements rather than off the palette, because a
   * Layout carries its own copies of the vehicles it uses (ADR 0002) and a
   * corrected one is not a value the palette holds any more. Counting what is
   * drawn is the only count that cannot contradict the picture.
   *
   * The opacity control is here rather than with the vehicles because it is a
   * way of looking at what is on the ground, not something about a vehicle. It
   * is not part of a Layout and not saved: the next visit starts out see-through
   * the same way this one did.
   */

  interface Props {
    /** What is on the ground, which is what is counted and looked over. */
    placements: readonly Placement[]
    /** How see-through every placed vehicle is drawn. */
    opacity: number
    onopacity: (opacity: number) => void
  }

  let { placements, opacity, onopacity }: Props = $props()

  const counts = $derived(countsByVehicle(placements))

  /** How many of them cover some part of another. Never one: a pair is two. */
  const colliding = $derived(overlappingIds(placements).size)
</script>

<section class="placed" aria-label="Placed vehicles">
  <h2>Placed</h2>

  {#if counts.length === 0}
    <p class="nothing">Nothing placed yet.</p>
  {:else}
    <ul>
      {#each counts as entry, index (index)}
        <li>
          <span class="swatch" style={`background: ${cssColour(entry.vehicle.colour)}`}></span>
          <span>{entry.vehicle.name}</span>
          <span class="count">{entry.count}</span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if colliding > 0}
    <!-- The vehicles that are in each other's way are outlined on the
         photograph. This says how many there are, which the outlines alone
         leave to be counted by eye. -->
    <p class="collision">{colliding} vehicles overlap.</p>
  {/if}

  <label class="opacity">
    Opacity
    <input
      type="range"
      min="0.1"
      max="1"
      step="0.05"
      value={opacity}
      oninput={(event) => {
        onopacity(Number(event.currentTarget.value))
      }}
    />
  </label>
</section>

<style>
  .placed {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  h2 {
    font-size: 0.875rem;
    font-weight: 600;
    margin: 0;
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
    display: flex;
    font-size: 0.875rem;
    gap: 0.375rem;
  }

  .count {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .nothing {
    font-size: 0.875rem;
    margin: 0;
  }

  .collision {
    font-size: 0.875rem;
    font-weight: 600;
    margin: 0;
  }

  .opacity {
    align-items: center;
    display: flex;
    font-size: 0.75rem;
    gap: 0.375rem;
  }
</style>
