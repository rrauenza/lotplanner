<script lang="ts">
  import { APP_TAGLINE, APP_TITLE } from './app-info'
  import { loadAttribution } from './browser/attribution'
  import { imageryEffects } from './browser/imagery-store'
  import MapView from './components/MapView.svelte'
  import Palette from './components/Palette.svelte'
  import type { LatLng } from './core/geometry'
  import { cornersOf, latLngFromOffset, type Offset } from './core/geometry'
  import {
    IMAGERY_IDLE,
    IMAGERY_LOADING,
    imageryPlanFor,
    loadImagery,
    USGS_NAIP_SERVICE_URL,
    type ImageryState,
  } from './core/imagery'
  import type { Site } from './core/site'
  import { SITES } from './manifest'

  let site: Site | undefined = $state(undefined)
  let imagery: ImageryState = $state(IMAGERY_IDLE)
  let attribution = $state('')
  let picture = $state('')

  /** Everything about the chosen Site that arithmetic alone decides. */
  const plan = $derived(
    site === undefined ? undefined : imageryPlanFor(site, USGS_NAIP_SERVICE_URL),
  )

  /** The Site Frame as a shape to draw, which is a guide and never a limit. */
  const outline = $derived(outlineFor(site))

  function outlineFor(chosen: Site | undefined): LatLng[] {
    if (chosen?.frame === undefined) {
      return []
    }
    return cornersOf(chosen.frame).map((corner: Offset) => latLngFromOffset(chosen.origin, corner))
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
          site = choice
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
  {:else if plan !== undefined}
    <MapView imageUrl={picture} {plan} {outline} />
    <Palette />
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
