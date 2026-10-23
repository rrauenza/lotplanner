<script lang="ts">
  import { cssColour } from '../core/colour'
  import { toFeetAndInches } from '../core/units'
  import type { Vehicle } from '../core/vehicle'
  import type { ArrivedCollection } from '../core/vehicle-collection'

  /**
   * A Vehicle Collection somebody shared by link.
   *
   * Opening the link is not keeping the collection: a shared link must never
   * change what the recipient has (ADR 0002), so what arrives is offered and
   * only a deliberate action forks it into a collection of their own. It is the
   * same fork a file import takes; the difference is only that this one waits to
   * be asked rather than being an act the visitor already made.
   */

  interface Props {
    /** What arrived, as it arrived: a name and some vehicles. */
    collection: ArrivedCollection
    /** Take a copy of it into the visitor's own collections. */
    onkeep: () => void
    /** Leave it: the visitor's own collections are untouched either way. */
    ondecline: () => void
  }

  let { collection, onkeep, ondecline }: Props = $props()

  /** Read back the way a vehicle is published, so it can be recognised at a glance. */
  function size(of: Vehicle): string {
    return `${toFeetAndInches(of.lengthInches)} x ${toFeetAndInches(of.widthInches)}`
  }
</script>

<section class="shared" aria-label="A shared collection">
  <div class="bar">
    <h2>A shared collection</h2>
  </div>

  <p class="lead">
    Someone shared "{collection.name}" with you. Adding it makes a copy of your own; everything you
    already have is left exactly as it is.
  </p>

  <ul class="vehicles">
    {#each collection.vehicles as one, index (index)}
      <li>
        <span class="swatch" style={`background: ${cssColour(one.colour)}`}></span>
        <span>{one.name}</span>
        <span class="size">{size(one)}</span>
      </li>
    {:else}
      <li>Nothing in this collection.</li>
    {/each}
  </ul>

  <div class="bar">
    <button type="button" onclick={onkeep}>Add to my collections</button>
    <button type="button" onclick={ondecline}>Not now</button>
  </div>
</section>

<style>
  .shared {
    background: color-mix(in srgb, CanvasText 6%, Canvas);
    border: 1px solid color-mix(in srgb, currentcolor 25%, transparent);
    border-radius: 0.375rem;
    padding: 0.5rem 0.75rem;
  }

  .lead {
    font-size: 0.875rem;
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
