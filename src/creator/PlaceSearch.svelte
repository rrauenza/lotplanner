<script lang="ts">
  import type { GeocodingState, Place } from '../core/geocoding'
  import type { Site } from '../core/site'

  /**
   * The creator's first step: find the place, or open one already in the list.
   *
   * Search is submitted rather than run as the address is typed. That is partly
   * the geocoder's pace - about one request a second, which typing would outrun -
   * and partly that a list churning under a half-typed address is harder to read
   * than one that appears when asked for.
   *
   * Both lists are lists of buttons, so the whole step is reachable and operable
   * by keyboard alone.
   */

  interface Props {
    /** What the search answered, or that it is still running. */
    geocoding: GeocodingState
    /** Whether a search is in flight, so the form can say so and not be asked twice. */
    busy: boolean
    /** The Sites already in the manifest, to correct rather than redraw. */
    existing: readonly Site[]
    onsearch: (query: string) => void
    onchoose: (place: Place) => void
    onexisting: (site: Site) => void
  }

  let { geocoding, busy, existing, onsearch, onchoose, onexisting }: Props = $props()

  let query = $state('')

  function submit(event: SubmitEvent): void {
    event.preventDefault()

    if (!busy) {
      onsearch(query)
    }
  }
</script>

<section aria-label="Find a place">
  <form onsubmit={submit}>
    <label>
      Address
      <input type="search" bind:value={query} placeholder="Street, town, or a name of a place" />
    </label>
    <button type="submit" disabled={busy}>Search</button>
  </form>

  {#if busy}
    <p role="status">Searching.</p>
  {:else if geocoding.status === 'failed'}
    <p role="alert">{geocoding.message}</p>
  {:else if geocoding.status === 'found'}
    {#if geocoding.places.length === 0}
      <p>Nothing matched that address.</p>
    {:else}
      <ul class="places">
        {#each geocoding.places as place, index (index)}
          <li>
            <button
              type="button"
              onclick={() => {
                onchoose(place)
              }}
            >
              <span class="name">{place.name}</span>
              {#if place.address !== undefined}
                <span class="address">{place.address}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <h3>Correct a place already listed</h3>
  {#if existing.length === 0}
    <p>The manifest has no places yet.</p>
  {:else}
    <ul class="places">
      {#each existing as site (site.id)}
        <li>
          <button
            type="button"
            onclick={() => {
              onexisting(site)
            }}
          >
            {site.name}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  form {
    align-items: flex-end;
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  label {
    display: flex;
    flex-direction: column;
    font-size: 0.75rem;
    gap: 0.125rem;
  }

  input {
    font: inherit;
    padding: 0.25rem;
    width: 20rem;
    max-width: 60vw;
  }

  h3 {
    font-size: 0.875rem;
    margin: 1rem 0 0.375rem;
  }

  .places {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .places button {
    background: none;
    border: 1px solid color-mix(in srgb, currentcolor 35%, transparent);
    border-radius: 0.25rem;
    color: inherit;
    display: block;
    font: inherit;
    padding: 0.25rem 0.5rem;
    text-align: left;
    width: 100%;
  }

  .name {
    font-weight: 600;
  }

  .address {
    display: block;
    font-size: 0.75rem;
  }
</style>
