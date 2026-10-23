<script lang="ts">
  import { cssColour } from '../core/colour'
  import { toFeetAndInches } from '../core/units'
  import type { Vehicle } from '../core/vehicle'

  /**
   * The vehicles an opened Layout uses that the visitor does not have.
   *
   * A Layout carries its own copies of its Vehicles (ADR 0002), so it renders and
   * edits with none of these: what is offered is not a repair but a way to take
   * somebody else's fleet on deliberately. The report says exactly which vehicles
   * are absent, and declining, like adopting, leaves the Layout exactly as it was.
   */

  interface Props {
    /** What the Layout uses and none of the visitor's collections holds. */
    missing: readonly Vehicle[]
    /** Take all of them into one new collection of the visitor's own. */
    onadopt: () => void
    /** Leave them where they are: the Layout works either way. */
    ondecline: () => void
  }

  let { missing, onadopt, ondecline }: Props = $props()

  /** Read back the way a vehicle is published, so it can be recognised at a glance. */
  function size(of: Vehicle): string {
    return `${toFeetAndInches(of.lengthInches)} x ${toFeetAndInches(of.widthInches)}`
  }
</script>

<section class="sheet" aria-label="Vehicles not in your collections">
  <div class="bar">
    <h2>Not in your collections</h2>
  </div>

  <p class="lead">
    This Layout carries its own vehicles, so it works without these. Adding them makes them yours to
    use in other Layouts.
  </p>

  <ul class="vehicles">
    {#each missing as one, index (index)}
      <li>
        <span class="swatch" style={`background: ${cssColour(one.colour)}`}></span>
        <span>{one.name}</span>
        <span class="size">{size(one)}</span>
      </li>
    {/each}
  </ul>

  <div class="bar">
    <button type="button" onclick={onadopt}>Add them to a new collection</button>
    <button type="button" onclick={ondecline}>Not now</button>
  </div>
</section>

<style>
  .lead {
    font-size: 0.75rem;
    margin: 0 0 0.5rem;
  }

  .vehicles {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
  }

  .vehicles li {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.875rem;
    gap: 0.5rem;
  }

  .vehicles li + li {
    margin-top: 0.25rem;
  }

  .vehicles li > span:nth-child(2) {
    flex: 1;
  }

  .size {
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }
</style>
