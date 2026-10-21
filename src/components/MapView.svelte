<script lang="ts">
  import L from 'leaflet'
  import 'leaflet/dist/leaflet.css'

  import type { ImageryPlan } from '../core/imagery'
  import type { LatLng, LatLngBounds } from '../core/geometry'

  interface Props {
    /** An object url for the picture, already fetched. */
    imageUrl: string
    /** Where the picture belongs, how sharp it is, and how far it may be zoomed. */
    plan: ImageryPlan
    /** The Site Frame's corners, drawn as the guide it is. */
    outline: readonly LatLng[]
  }

  let { imageUrl, plan, outline }: Props = $props()

  let element: HTMLDivElement

  function toTuple(point: LatLng): L.LatLngTuple {
    return [point.latitude, point.longitude]
  }

  function toBounds(bounds: LatLngBounds): L.LatLngBounds {
    return L.latLngBounds(toTuple(bounds.southWest), toTuple(bounds.northEast))
  }

  $effect(() => {
    const map = L.map(element, {
      // The plane the imagery is fetched in, so the picture is never stretched.
      crs: L.CRS.EPSG3857,
      attributionControl: false,
      // So opening a Site can sit exactly on its frame instead of near it.
      zoomSnap: 0,
      maxZoom: plan.maxZoom,
    })

    L.imageOverlay(imageUrl, toBounds(plan.bounds)).addTo(map)

    // The frame is a guide and never a limit, which is why it is drawn as an
    // outline rather than as a mask over everything outside it.
    if (outline.length > 0) {
      const guide = L.polygon(outline.map(toTuple), {
        color: '#ffd166',
        weight: 2,
        dashArray: '6 4',
        fill: false,
        interactive: false,
      }).addTo(map)

      map.fitBounds(guide.getBounds(), { padding: [16, 16] })
    } else {
      map.fitBounds(toBounds(plan.bounds))
    }

    return () => {
      map.remove()
    }
  })
</script>

<div class="map" bind:this={element}></div>

<style>
  .map {
    /* Fills what is left of the screen, so the photograph is the point of the
       page rather than an illustration on it. */
    flex: 1;
    min-height: 20rem;
    background: #111;
  }
</style>
