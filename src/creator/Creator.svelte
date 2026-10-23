<script lang="ts">
  import { onDestroy, onMount } from 'svelte'

  import { loadAttribution } from '../browser/attribution'
  import { geocodingEffects } from '../browser/geocoder'
  import { imageryEffects } from '../browser/imagery-store'
  import {
    findCandidates,
    GEOCODING_IDLE,
    type Candidate,
    type GeocodingState,
  } from '../core/geocoding'
  import {
    IMAGERY_IDLE,
    IMAGERY_LOADING,
    imageryPlanFor,
    imageryPlanForExtent,
    loadImagery,
    provisionalFetchArea,
    USGS_NAIP_SERVICE_URL,
    type ImageryPlan,
    type ImageryState,
  } from '../core/imagery'
  import type { SiteFrame } from '../core/geometry'
  import type { Site } from '../core/site'
  import {
    draftFrom,
    manifestEntry,
    manifestEntryText,
    type SiteDraft,
  } from '../core/site-creation'
  import { SITES } from '../manifest'
  import Basemap from './Basemap.svelte'
  import FrameSketch from './FrameSketch.svelte'
  import PlaceSearch from './PlaceSearch.svelte'

  /**
   * The hidden creator mode (ADR 0006): a candidate found by address, drawn over,
   * and emitted as the entry to paste into the manifest.
   *
   * Three steps, and only one of them shows a picture. The address search and the
   * coarse tiles are cheap; the one high-resolution image is the 15-22 second
   * wait, so it is fetched exactly once, for the provisional Fetch Area the
   * rectangle will be drawn inside, and never again while the rectangle is
   * adjusted.
   *
   * Nothing here writes anywhere. The output is text in a box, to be copied and
   * committed by hand, which is what keeps the manifest the single source of
   * truth and the deployed app free of any write path.
   *
   * It is reached by the fragment in `main.ts` and by nothing else, so no visitor
   * path leads here and the visitor's page never names it.
   */

  interface Props {
    /** The Site to correct, from the fragment, or nothing to add a new one. */
    siteId: string | undefined
  }

  let { siteId }: Props = $props()

  type Step = 'search' | 'confirm' | 'sketch'

  let step: Step = $state('search')
  let draft: SiteDraft | undefined = $state(undefined)
  let geocoding: GeocodingState = $state(GEOCODING_IDLE)
  let searching = $state(false)
  let imagery: ImageryState = $state(IMAGERY_IDLE)
  let plan: ImageryPlan | undefined = $state(undefined)
  let picture = $state('')
  let copied = $state(false)
  let problem = $state('')

  /** The photograph's source, in the service's own words, read once it is on screen. */
  let credit = $state('')

  /** Which fetch is the current one, so an abandoned one cannot overwrite a new state. */
  let fetching = 0

  const entryText = $derived(draft === undefined ? '' : entryFor(draft))

  onMount(() => {
    if (siteId === undefined) {
      return
    }

    const existing = SITES.find((each) => each.id === siteId)

    if (existing === undefined) {
      problem = `No place with the id ${siteId} is in the manifest.`
      return
    }

    void correct(existing)
  })

  onDestroy(() => {
    if (picture !== '') {
      URL.revokeObjectURL(picture)
    }
  })

  // The picture is the imagery service's either way, so it is credited here the
  // way the visitor app credits it - in the service's own words, read from it.
  $effect(() => {
    if (imagery.status !== 'ready') {
      return
    }

    let abandoned = false

    void loadAttribution(USGS_NAIP_SERVICE_URL)
      .then((text) => {
        if (!abandoned) {
          credit = text
        }
      })
      .catch(() => {
        // No credit line beats a wrong one, and the picture still shows.
      })

    return () => {
      abandoned = true
    }
  })

  async function search(query: string): Promise<void> {
    searching = true
    geocoding = await findCandidates(query, geocodingEffects)
    searching = false
  }

  function choose(candidate: Candidate): void {
    draft = { candidate }
    step = 'confirm'
  }

  /** A place already in the manifest, opened with the rectangle it was saved with. */
  async function correct(site: Site): Promise<void> {
    draft = draftFrom(site)
    step = 'sketch'
    await fetchPicture(draft)
  }

  function confirmPlace(): void {
    const current = draft

    if (current === undefined) {
      return
    }

    step = 'sketch'
    void fetchPicture(current)
  }

  function setFrame(frame: SiteFrame): void {
    if (draft === undefined) {
      return
    }

    draft = { ...draft, frame }
  }

  function rename(name: string): void {
    if (draft === undefined) {
      return
    }

    draft = { ...draft, candidate: { ...draft.candidate, name } }
  }

  function retry(): void {
    if (draft !== undefined) {
      void fetchPicture(draft)
    }
  }

  function startAgain(): void {
    fetching += 1
    dropPicture()
    draft = undefined
    step = 'search'
    geocoding = GEOCODING_IDLE
    imagery = IMAGERY_IDLE
    plan = undefined
    problem = ''
  }

  /**
   * Fetch the one picture, for the draft as it stands.
   *
   * A brand-new place has no frame yet, so the picture is planned for the
   * provisional Fetch Area (`imagery.ts`) - the largest square whose extent still
   * fits the service's pixel cap - and the creator draws inside it. A Site being
   * corrected has its frame already, or is one the visitor will fetch a default
   * square for, so the picture is planned for exactly the extent a visitor would
   * fetch, which is the one already in the cache.
   *
   * The picture is fetched through the same port and the same store the visitor
   * app uses, so the two share one cache rather than keeping a copy each.
   */
  async function fetchPicture(what: SiteDraft): Promise<void> {
    const mine = (fetching += 1)
    const wanted = planFor(what)

    plan = wanted
    imagery = IMAGERY_LOADING

    const next = await loadImagery(wanted.requestUrl, imageryEffects)

    // Something else was asked for while this was in flight, so this answer is
    // not the one on screen any more.
    if (mine !== fetching) {
      return
    }

    if (next.status === 'ready') {
      dropPicture()
      picture = URL.createObjectURL(next.image)
    }

    imagery = next
  }

  /** Everything about the picture that arithmetic decides, from the numbers the core owns. */
  function planFor(what: SiteDraft): ImageryPlan {
    const site = siteForThePicture(what)

    // Nothing to plan a frame-shaped fetch from: the candidate is brand new, so
    // the picture is for the provisional Fetch Area instead.
    return site.frame === undefined && what.id === undefined
      ? imageryPlanForExtent(site.origin, provisionalFetchArea(), USGS_NAIP_SERVICE_URL)
      : imageryPlanFor(site, USGS_NAIP_SERVICE_URL)
  }

  function siteForThePicture(what: SiteDraft): Site {
    const base: Site = {
      id: what.id ?? 'draft',
      name: what.candidate.name,
      origin: what.candidate.position,
    }

    // A Site being corrected is fetched for exactly the frame it already has, so
    // the visitor's cache entry is the one this shows. One with no frame is
    // fetched for the same default square a visitor gets.
    return what.frame === undefined ? base : { ...base, frame: what.frame }
  }

  function entryFor(what: SiteDraft): string {
    try {
      return manifestEntryText(manifestEntry(what, SITES))
    } catch {
      // The only field the form can make unusable is the name; anything else is
      // arithmetic that a drawn rectangle cannot break.
      return ''
    }
  }

  function dropPicture(): void {
    if (picture !== '') {
      URL.revokeObjectURL(picture)
      picture = ''
    }
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(entryText)
      copied = true
    } catch {
      copied = false
    }
  }
</script>

<main>
  <header>
    <h1>Lot Planner: creator</h1>
    <p>
      Find a place, draw its rectangle over the photograph, and copy the manifest entry. Nothing
      here writes to the repository, and nothing here is reachable from the visitor app.
    </p>
  </header>

  {#if problem !== ''}
    <p role="alert">{problem}</p>
  {/if}

  {#if step === 'search'}
    <PlaceSearch
      {geocoding}
      busy={searching}
      existing={SITES}
      onsearch={(query: string) => {
        void search(query)
      }}
      onchoose={choose}
      onexisting={(site: Site) => {
        void correct(site)
      }}
    />
  {:else if step === 'confirm' && draft !== undefined}
    <Basemap candidate={draft.candidate} onconfirm={confirmPlace} onback={startAgain} />
  {:else if step === 'sketch' && draft !== undefined}
    {#if imagery.status === 'loading'}
      <!-- The same loading state the visitor app shows, because it is the same
           wait for the same picture. -->
      <p role="status">
        Fetching the photograph. The first visit to a place takes a few seconds; after that it is
        instant.
      </p>
    {:else if imagery.status === 'failed'}
      <p role="alert">{imagery.message}</p>
      <div class="bar">
        <button type="button" onclick={retry}>Try again</button>
        <button type="button" onclick={startAgain}>Start again</button>
      </div>
    {:else if imagery.status === 'ready' && plan !== undefined}
      <label class="name">
        Site name
        <input
          value={draft.candidate.name}
          oninput={(event) => {
            rename(event.currentTarget.value)
          }}
        />
      </label>

      <FrameSketch
        {plan}
        imageUrl={picture}
        origin={draft.candidate.position}
        frame={draft.frame}
        onframe={setFrame}
      />

      <!-- Kept as a line whether or not it has arrived, so the credit landing
           cannot move the rectangle under the finger that is drawing it. -->
      <p class="credit">{credit}</p>

      <section aria-label="Manifest entry">
        <h2>Manifest entry</h2>
        {#if entryText === ''}
          <p role="alert">Give the Site a name before copying its entry.</p>
        {:else}
          <p>
            Paste this into <code>src/manifest.ts</code>, commit it and deploy. It carries the
            place's name and position and the rectangle drawn over it, and nothing else.
          </p>
          <textarea aria-label="Manifest entry" readonly rows="12">{entryText}</textarea>
          <div class="bar">
            <button
              type="button"
              onclick={() => {
                void copy()
              }}>Copy</button
            >
            {#if copied}
              <span role="status">Copied.</span>
            {/if}
          </div>
        {/if}
      </section>

      <div class="bar">
        <button type="button" onclick={startAgain}>Start again</button>
      </div>
    {/if}
  {/if}
</main>

<style>
  main {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 100dvh;
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

  .bar {
    align-items: center;
    display: flex;
    gap: 0.5rem;
  }

  .bar button,
  .name input {
    font: inherit;
  }

  .bar button {
    padding: 0.25rem 0.75rem;
  }

  .name {
    display: flex;
    flex-direction: column;
    font-size: 0.75rem;
    gap: 0.125rem;
  }

  .name input {
    padding: 0.25rem;
    width: 20rem;
    max-width: 60vw;
  }

  h2 {
    font-size: 1rem;
    margin: 0.5rem 0 0.25rem;
  }

  .credit {
    color: color-mix(in srgb, currentcolor 60%, transparent);
    font-size: 0.75rem;
    margin: 0;
    min-height: 1em;
  }

  /* The label names the box for a screen reader; the heading above already says
     what the box is on the page. */
  textarea {
    box-sizing: border-box;
    display: block;
    font-family: ui-monospace, monospace;
    font-size: 0.8125rem;
    max-width: 100%;
    width: 40rem;
  }
</style>
