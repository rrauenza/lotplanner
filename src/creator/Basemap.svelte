<script lang="ts">
  import L from 'leaflet'
  import 'leaflet/dist/leaflet.css'

  import {
    BASEMAP_ATTRIBUTION,
    BASEMAP_MAX_ZOOM,
    BASEMAP_START_ZOOM,
    BASEMAP_TILE_URL,
  } from '../browser/basemap'
  import type { Place } from '../core/geocoding'

  /**
   * Confirming the place, on the coarse tiles.
   *
   * The first tier of the creator flow (ADR 0006): the tiles find the space, and
   * they are useless for drawing its edges because their cache stops at about z16
   * and a pixel is nearly two metres there. So this map only confirms - the
   * address found and the marker on it - and the rectangle is drawn on the
   * high-resolution image that comes next. The browser's own cache is the cache;
   * the app keeps no picture of its own for this tier.
   *
   * The tiles are OpenStreetMap's, keyless, and credited the way they ask.
   */

  interface Props {
    place: Place
    /** The place is the right one: go and fetch the picture. */
    onconfirm: () => void
    /** Back to the search. */
    onback: () => void
  }

  let { place, onconfirm, onback }: Props = $props()

  let element: HTMLDivElement

  $effect(() => {
    const created = L.map(element, {
      maxZoom: BASEMAP_MAX_ZOOM,
      minZoom: 3,
    })

    L.tileLayer(BASEMAP_TILE_URL, {
      attribution: BASEMAP_ATTRIBUTION,
      maxZoom: BASEMAP_MAX_ZOOM,
    }).addTo(created)

    // The place found, as a point rather than a marker pin: this is a spot on
    // the ground, not a destination on a road map.
    L.circleMarker([place.position.latitude, place.position.longitude], {
      radius: 7,
      color: '#1b1b1b',
      weight: 2,
      fillColor: '#ffd166',
      fillOpacity: 1,
    }).addTo(created)

    created.setView([place.position.latitude, place.position.longitude], BASEMAP_START_ZOOM)

    return () => {
      created.remove()
    }
  })
</script>

<section aria-label="Confirm the place">
  <p>
    {place.name}{#if place.address !== undefined}
      <span class="address">{place.address}</span>
    {/if}
  </p>
  <p class="hint">
    The tiles are coarse: use them to find the space, not to judge its edges. The rectangle is drawn
    on the sharp picture that comes next.
  </p>

  <!-- The tiles are a pointer-driven canvas, documented rather than left
       ambiguous: panning and zooming them are pointer-only, while the two
       buttons below are focusable and labelled. -->
  <div class="map" bind:this={element}></div>

  <div class="bar">
    <button type="button" onclick={onconfirm}>Fetch the photograph</button>
    <button type="button" onclick={onback}>Back to search</button>
  </div>
</section>

<style>
  .address {
    display: block;
    font-size: 0.75rem;
  }

  .hint {
    font-size: 0.75rem;
    margin: 0 0 0.5rem;
  }

  .map {
    background: #111;
    height: 16rem;
    margin-bottom: 0.5rem;
  }
</style>
