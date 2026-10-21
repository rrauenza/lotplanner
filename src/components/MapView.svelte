<script lang="ts">
  import L from 'leaflet'
  import 'leaflet/dist/leaflet.css'

  import type { LatLng, LatLngBounds } from '../core/geometry'

  interface Props {
    /** An object url for the picture, already fetched. */
    imageUrl: string
    /** Where that picture belongs, in degrees. */
    imageBounds: LatLngBounds
    /** The Site Frame's corners, drawn as the guide it is. */
    outline: readonly LatLng[]
    /** Past this the picture would be magnified rather than revealing more. */
    maxZoom: number
  }

  let { imageUrl, imageBounds, outline, maxZoom }: Props = $props()

  let element: HTMLDivElement
  let zoom = $state(0)

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
      maxZoom,
    })

    L.imageOverlay(imageUrl, toBounds(imageBounds)).addTo(map)

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
      map.fitBounds(toBounds(imageBounds))
    }

    const report = (): void => {
      zoom = map.getZoom()
    }
    map.on('zoomend', report)
    report()

    return () => {
      map.remove()
    }
  })
</script>

<div class="map" bind:this={element} data-testid="map" data-zoom={zoom}></div>

<style>
  .map {
    /* Enough to work in on a phone without the page scrolling away from it. */
    height: 70vh;
    min-height: 20rem;
    background: #111;
  }
</style>
