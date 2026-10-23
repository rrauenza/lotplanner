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

  /**
   * How many of them cover some part of another. Never one: a pair is two.
   *
   * Read from the committed Placements, unlike the outline the map draws, which
   * is read from the placements it is about to draw - in-flight ones and all.
   * The two therefore disagree during a drag, until the finger lifts and the
   * move is committed. That is deliberate: this panel answers how many are
   * *placed*, a fact about the Layout, while the map marks what is on the screen
   * right then.
   */
  const overlapping = $derived(overlappingIds(placements).size)
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

  {#if overlapping > 0}
    <!-- The vehicles that are in each other's way are outlined on the
         photograph. This says how many there are, which the outlines alone
         leave to be counted by eye. -->
    <p class="overlap">{overlapping} vehicles overlap.</p>
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
    /*
     * Capped the way the palette caps itself. The photograph is the point of the
     * page, and this panel is a row of chips under it that grows one line per
     * distinct vehicle; without a cap a phone with a dozen vehicles placed wraps
     * the list into several rows and eats the height the ground is being judged
     * against. It scrolls rather than shrinks when it reaches that height.
     */
    max-height: 32vh;
    overflow-y: auto;
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

  .overlap {
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
