<script lang="ts">
  import { APP_TAGLINE, APP_TITLE } from './app-info'
  import { loadAttribution } from './browser/attribution'
  import { imageryEffects } from './browser/imagery-store'
  import MapView from './components/MapView.svelte'
  import Palette from './components/Palette.svelte'
  import VehicleEditor from './components/VehicleEditor.svelte'
  import type { Point } from './components/pointer'
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
    withEditedVehicle,
    withMovedPlacement,
    withRotatedPlacement,
    withPlacement,
    type Layout,
    type Placement,
  } from './core/layout'
  import type { Site } from './core/site'
  import type { Vehicle } from './core/vehicle'
  import { SITES } from './manifest'

  /** The one thing the App asks of the map: where a screen point is on the ground. */
  interface MapHandle {
    offsetAt(point: Point): Offset | undefined
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

  /** The Placement that is selected, if one is. */
  function selectedPlacement(): Placement | undefined {
    return layout?.placements.find((each) => each.id === selectedId)
  }

  /** The vehicle the selected Placement is carrying, if something is selected. */
  const selectedVehicle = $derived(selectedPlacement()?.vehicle)

  /**
   * Correct the vehicle the selected Placement carries, and every Placement of
   * it in this Layout with it. A collection is never touched: a Layout keeps its
   * own copies of what it uses, so this cannot reach one.
   */
  function correctVehicle(corrected: Vehicle): void {
    const current = layout
    const selected = selectedPlacement()

    if (current === undefined || selected === undefined) {
      return
    }

    layout = withEditedVehicle(current, selected.vehicle, corrected)
  }

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
  function dropFrom(vehicle: Vehicle, point: Point): void {
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

  function rotatePlacement(id: string, rotationDegrees: number): void {
    if (layout !== undefined) {
      layout = withRotatedPlacement(layout, id, rotationDegrees)
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
    <div class="stage">
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
        onrotate={rotatePlacement}
      />
      {#if selectedVehicle !== undefined}
        <!-- A sheet over the photograph rather than a row under it, so that
             opening the form never resizes the map - which would move the ground
             under whoever has just tapped a vehicle. Keyed on what is selected,
             so correcting one vehicle and then picking another starts afresh. -->
        {#key selectedId}
          <div class="sheet">
            <VehicleEditor of={selectedVehicle} onchange={correctVehicle} />
          </div>
        {/key}
      {/if}
    </div>
    <Palette ondrop={dropFrom} onplace={placeInTheMiddle} />
    <!-- Here even before it is known, so that the credit arriving cannot resize
         the map either. -->
    <p class="credit">{attribution}</p>
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

  .stage {
    display: flex;
    /* The photograph fills the stage, and anything that belongs to a vehicle
       floats over it rather than taking room from it: a map that resizes when
       something is selected moves the ground under the finger that selected it. */
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .sheet {
    background: Canvas;
    border-radius: 0.375rem 0.375rem 0 0;
    bottom: 0;
    left: 0;
    max-height: 60%;
    overflow-y: auto;
    padding: 0.5rem 0.75rem;
    position: absolute;
    right: 0;
    /* Leaflet's panes carry z-indexes of their own and the map sets no stacking
       context, so without this the sheet is drawn behind the photograph. Above
       the panes, below the map's own controls. */
    z-index: 800;
  }

  .credit {
    color: color-mix(in srgb, currentcolor 60%, transparent);
    font-size: 0.75rem;
    margin: 0;
    /* Kept as a line whether or not it has been fetched yet, for the same
       reason: a credit arriving must not resize the map. */
    min-height: 1em;
  }
</style>
