<script lang="ts">
  import { APP_TAGLINE, APP_TITLE } from './app-info'
  import { loadAttribution } from './browser/attribution'
  import { imageryEffects, serviceUrl } from './browser/imagery-store'
  import MapView from './components/MapView.svelte'
  import {
    boundsForExtent,
    frameCorners,
    latLngFromOffset,
    mercatorBoundsForExtent,
    zoomAtNativeResolution,
    type Offset,
  } from './core/geometry'
  import {
    exportImageUrl,
    IMAGERY_IDLE,
    imagerySize,
    loadImagery,
    type ImageryState,
  } from './core/imagery'
  import { extentForSite, type Site } from './core/site'
  import { SITES } from './manifest'

  /**
   * The service's own numbers: how much ground its pixels cover, and how many
   * pixels it will send in one answer. They are written here rather than read
   * from its metadata, because that would cost a request before anything can be
   * drawn.
   */
  const NATIVE_METRES_PER_PIXEL = 0.3
  const MAX_PIXELS = 4000

  const service = serviceUrl()
  const effects = imageryEffects()

  let site: Site | undefined = $state(undefined)
  let imagery: ImageryState = $state(IMAGERY_IDLE)
  let attribution = $state('')
  let picture = $state('')

  /**
   * Everything about the chosen Site that follows from arithmetic alone. The
   * only part that has to wait is the picture itself, which is why the loading
   * state and this plan are separate: the map knows how big it will be before
   * anything arrives.
   */
  const plan = $derived.by(() => {
    if (site === undefined) {
      return undefined
    }

    const origin = site.origin
    const extent = extentForSite(site)
    const size = imagerySize(extent, NATIVE_METRES_PER_PIXEL, MAX_PIXELS)

    return {
      requestUrl: exportImageUrl({
        serviceUrl: service,
        mercator: mercatorBoundsForExtent(origin, extent),
        size,
      }),
      imageBounds: boundsForExtent(origin, extent),
      outline:
        site.frame === undefined
          ? []
          : frameCorners(site.frame).map((corner: Offset) => latLngFromOffset(origin, corner)),
      maxZoom: Math.ceil(zoomAtNativeResolution(size.metresPerPixel, origin.latitude)),
    }
  })

  $effect(() => {
    const current = plan
    if (current === undefined) {
      imagery = IMAGERY_IDLE
      return
    }

    let abandoned = false
    let objectUrl = ''

    imagery = { status: 'loading' }

    void loadImagery(current.requestUrl, effects).then((next) => {
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

    void loadAttribution(service)
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
    <MapView
      imageUrl={picture}
      imageBounds={plan.imageBounds}
      outline={plan.outline}
      maxZoom={plan.maxZoom}
    />
    {#if attribution !== ''}
      <p class="credit">{attribution}</p>
    {/if}
  {/if}
</main>

<style>
  main {
    margin: 0 auto;
    max-width: 60rem;
    padding: 1rem;
  }

  header h1 {
    font-size: 1.5rem;
    margin: 0;
  }

  header p {
    margin: 0.25rem 0 1rem;
  }

  nav button {
    margin: 0 0.5rem 1rem 0;
    padding: 0.5rem 0.75rem;
  }

  nav button[aria-pressed='true'] {
    outline: 2px solid currentcolor;
    font-weight: 600;
  }

  .credit {
    color: color-mix(in srgb, currentcolor 60%, transparent);
    font-size: 0.75rem;
    margin: 0.5rem 0 0;
  }
</style>
