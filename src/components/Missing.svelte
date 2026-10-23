<script lang="ts">
  import type { Vehicle } from '../core/vehicle'
  import VehicleSummary from './VehicleSummary.svelte'

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
        <VehicleSummary of={one} />
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
</style>
