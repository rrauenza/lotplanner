<script lang="ts">
  import { APP_TAGLINE, APP_TITLE } from './app-info'
  import { loadAttribution } from './browser/attribution'
  import { imageryEffects } from './browser/imagery-store'
  import MapView from './components/MapView.svelte'
  import Palette from './components/Palette.svelte'
  import type { Offset } from './core/geometry'
  import {
    IMAGERY_IDLE,
    IMAGERY_LOADING,
    imageryPlanFor,
    loadImagery,
    USGS_NAIP_SERVICE_URL,
    type ImageryState,
  } from './core/imagery'
  import {
    newLayout,
    withMovedPlacement,
    withPlacement,
    type Layout,
    type Placement,
  } from './core/layout'
  import type { Site } from './core/site'
  import type { Vehicle } from './core/vehicle'
  import { SITES } from './manifest'

  /** The one thing the App asks of the map: where a screen point is on the ground. */
  interface MapHandle {
    offsetAt(point: { readonly x: number; readonly y: number }): Offset | undefined
  }

  let site: Site | undefined = $state(undefined)
  let layout: Layout | undefined = $state(undefined)
  let selectedId: string | undefined = $state(undefined)
  let imagery: ImageryState = $state(IMAGERY_IDLE)
  let attribution = $state('')
  let picture = $state('')
  // Raw, so that putting a component instance into state does not wrap it in a
  // proxy, which a Leaflet-backed component would not enjoy.
  let mapView = $state.raw<MapHandle | undefined>(undefined)

  /** Everything about the chosen Site that arithmetic alone decides. */
  const plan = $derived(
    site === undefined ? undefined : imageryPlanFor(site, USGS_NAIP_SERVICE_URL),
  )

  function choose(choice: Site): void {
    site = choice
    // Nothing is stored yet, so opening a Site starts from the frame it was
    // worked in and an empty piece of ground.
    layout = newLayout(choice)
    selectedId = undefined
  }

  function place(vehicle: Vehicle, centre: Offset): void {
    const current = layout
    if (current === undefined) {
      return
    }

    const placement: Placement = {
      id: crypto.randomUUID(),
      vehicle,
      centre,
      // A space is seldom square to north, so a new rectangle starts along the
      // frame it is being laid in rather than along the compass.
      rotationDegrees: current.frame?.rotationDegrees ?? 0,
    }

    layout = withPlacement(current, placement)
    selectedId = placement.id
  }

  /** A vehicle let go over the picture lands where it was let go. */
  function dropFrom(vehicle: Vehicle, point: { readonly x: number; readonly y: number }): void {
    const at = mapView?.offsetAt(point)
    if (at !== undefined) {
      place(vehicle, at)
    }
  }

  /** A vehicle chosen without a pointer lands in the middle of the frame. */
  function placeInTheMiddle(vehicle: Vehicle): void {
    const current = layout
    if (current !== undefined) {
      place(vehicle, current.frame?.centre ?? { eastMetres: 0, northMetres: 0 })
    }
  }

  function selectPlacement(id: string | undefined): void {
    selectedId = id
  }

  function movePlacement(id: string, centre: Offset): void {
    if (layout !== undefined) {
      layout = withMovedPlacement(layout, id, centre)
    }
  }

  $effect(() => {
    const current = plan
    if (current === undefined) {
      imagery = IMAGERY_IDLE
      return
    }

    let abandoned = false
    let objectUrl = ''

    imagery = IMAGERY_LOADING

    void loadImagery(current.requestUrl, imageryEffects).then((next) => {
      if (abandoned) {
        return
      }
      if (next.status === 'ready') {
        objectUrl = URL.createObjectURL(next.image)
        picture = objectUrl
      }
      imagery = next
    })

    return () => {
      abandoned = true
      if (objectUrl !== '') {
        URL.revokeObjectURL(objectUrl)
      }
    }
  })

  $effect(() => {
    let abandoned = false

    void loadAttribution(USGS_NAIP_SERVICE_URL)
      .then((text) => {
        if (!abandoned) {
          attribution = text
        }
      })
      .catch(() => {
        // No credit line beats a wrong one, and the picture still shows.
      })

    return () => {
      abandoned = true
    }
  })
</script>

<main>
  <header>
    <h1>{APP_TITLE}</h1>
    <p>{APP_TAGLINE}</p>
  </header>

  <nav aria-label="Places">
    {#each SITES as choice (choice.id)}
      <button
        type="button"
        aria-pressed={choice.id === site?.id}
        onclick={() => {
          choose(choice)
        }}
      >
        {choice.name}
      </button>
    {/each}
  </nav>

  {#if imagery.status === 'idle'}
    <p>Pick a place to lay vehicles out in.</p>
  {:else if imagery.status === 'loading'}
    <p role="status">
      Fetching the photograph. The first visit to a place takes a few seconds; after that it is
      instant.
    </p>
  {:else if imagery.status === 'failed'}
    <p role="alert">{imagery.message}</p>
  {:else if plan !== undefined && layout !== undefined}
    <MapView
      bind:this={mapView}
      imageUrl={picture}
      {plan}
      origin={layout.origin}
      frame={layout.frame}
      placements={layout.placements}
      {selectedId}
      onselect={selectPlacement}
      onmove={movePlacement}
    />
    <Palette ondrop={dropFrom} onplace={placeInTheMiddle} />
    {#if attribution !== ''}
      <p class="credit">{attribution}</p>
    {/if}
  {/if}
</main>

<style>
  main {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    /* The photograph is the page, so it takes whatever the chrome does not. */
    height: 100dvh;
    padding: 0.75rem 1rem;
  }

  header h1 {
    font-size: 1.25rem;
    margin: 0;
  }

  header p {
    font-size: 0.875rem;
    margin: 0;
  }

  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  nav button {
    padding: 0.5rem 0.75rem;
  }

  nav button[aria-pressed='true'] {
    font-weight: 600;
    outline: 2px solid currentcolor;
  }

  .credit {
    color: color-mix(in srgb, currentcolor 60%, transparent);
    font-size: 0.75rem;
    margin: 0;
  }
</style>
