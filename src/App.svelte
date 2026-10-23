<script lang="ts">
  import { APP_TAGLINE, APP_TITLE } from './app-info'
  import { followAttribution } from './browser/attribution'
  import { imageryEffects } from './browser/imagery-store'
  import { savedEffects } from './browser/saved-store'
  import { showPicture, type ShownPicture } from './browser/picture'
  import Layouts from './components/Layouts.svelte'
  import MapView from './components/MapView.svelte'
  import Palette from './components/Palette.svelte'
  import Placed from './components/Placed.svelte'
  import VehicleEditor from './components/VehicleEditor.svelte'
  import type { Point } from './components/pointer'
  import { canRedo, canUndo, edit, redo, startEditing, undo, type Editor } from './core/editor'
  import type { Offset } from './core/geometry'
  import {
    IMAGERY_IDLE,
    IMAGERY_LOADING,
    IMAGERY_LOADING_MESSAGE,
    imageryPlanFor,
    loadImagery,
    USGS_NAIP_SERVICE_URL,
    type ImageryState,
  } from './core/imagery'
  import {
    duplicateOf,
    newLayout,
    withEditedVehicle,
    withMovedPlacement,
    withRotatedPlacement,
    withPlacement,
    withoutPlacement,
    type Layout,
    type Placement,
  } from './core/layout'
  import {
    KEPT,
    writeSaved,
    loadSaved,
    mostRecentOf,
    nextName,
    withSaved,
    withRenamed,
    savedWith,
    withoutSaved,
    type SavedLayout,
    type Saving,
  } from './core/saved'
  import type { Site } from './core/site'
  import type { Vehicle } from './core/vehicle'
  import { SITES } from './manifest'

  /** The one thing the App asks of the map: where a screen point is on the ground. */
  interface MapHandle {
    offsetAt(point: Point): Offset | undefined
  }

  let site: Site | undefined = $state(undefined)

  /**
   * The Editor: what is on the ground is always the top of it, and every change
   * goes through `change` below - so undo works for all of them without any of
   * them knowing that undo exists.
   */
  let editor = $state<Editor | undefined>(undefined)

  /** The Layout as it stands, if a Site has been opened. */
  const layout = $derived(editor?.present)

  /**
   * The Site's saved Layouts, the one worked on most recently first. This is the
   * session's own list rather than a copy of what storage holds: storage is
   * written behind it, so losing storage costs the work its future but not its
   * shape, and the list goes on working.
   */
  let savedLayouts = $state<readonly SavedLayout[]>([])

  /** Which of them is open. Nothing until an edit gives this Layout a name. */
  let openId = $state<string | undefined>(undefined)

  /** Whether what is on screen will survive the session, and what to say if not. */
  let saving = $state<Saving>(KEPT)

  /** Whether the Layouts sheet is up. */
  let layoutsUp = $state(false)

  /**
   * How see-through every placed vehicle is drawn.
   *
   * A view of this session rather than part of the work, like the map's own
   * viewport (ADR 0008): nothing records it, a reload starts here, and it is
   * never written into a Layout. It starts low enough to read an overlap
   * through, and high enough to tell one vehicle's colour from another's.
   */
  let opacity = $state(0.4)

  /**
   * How long edits settle before the Site's work is written. Long enough that
   * typing a name into the form is one write rather than one per keystroke,
   * short enough that a phone call arriving costs nothing worth noticing.
   */
  const WRITE_AFTER_MILLISECONDS = 400

  /**
   * The Site whose work is waiting to be written, and the work itself.
   *
   * Both are taken when the edit is made rather than when the write happens:
   * editing one place and choosing another is an ordinary thing to do, and the
   * first place's work must not be written under the second place's name, nor
   * lost. Each edit replaces what is waiting, so a run of edits is still one
   * write and the last state is the one that goes.
   */
  let waiting: { readonly siteId: string; readonly work: readonly SavedLayout[] } | undefined

  let writing: ReturnType<typeof setTimeout> | undefined

  /** The name of the Layout being worked on, kept or not. */
  const openName = $derived(savedWith(savedLayouts, openId)?.name ?? nextName(savedLayouts))
  let selectedId: string | undefined = $state(undefined)
  let imagery: ImageryState = $state(IMAGERY_IDLE)
  let attribution = $state('')
  let picture = $state<ShownPicture | undefined>(undefined)
  // Raw, so that putting a component instance into state does not wrap it in a
  // proxy, which a Leaflet-backed component would not enjoy.
  let mapView = $state.raw<MapHandle | undefined>(undefined)

  /** Everything about the chosen Site that arithmetic alone decides. */
  const plan = $derived(
    site === undefined ? undefined : imageryPlanFor(site, USGS_NAIP_SERVICE_URL),
  )

  /**
   * Put an edit on the Editor. Every change to a Layout goes through here, which
   * is what makes undo work for all of them at once - and what makes saving
   * automatic, since this is also where the work is kept.
   */
  function change(next: Layout): void {
    if (editor === undefined) {
      return
    }

    editor = edit(editor, next)
    remember(next)
  }

  /**
   * The open Layout as the Site's work, the moment it changes.
   *
   * In memory at once and written shortly after, rather than both on a delay: a
   * Layout is named and listed the first time it is edited, so the list is never
   * showing something that is not there yet.
   */
  function remember(next: Layout): void {
    const id = openId ?? crypto.randomUUID()

    openId = id
    savedLayouts = withSaved(savedLayouts, {
      id,
      name: savedWith(savedLayouts, id)?.name ?? nextName(savedLayouts),
      layout: next,
    })
    writeWhenSettled()
  }

  /** Write the Site's work once the edits stop arriving. */
  function writeWhenSettled(): void {
    const current = site

    if (current === undefined) {
      return
    }

    waiting = { siteId: current.id, work: savedLayouts }
    clearTimeout(writing)
    writing = setTimeout(() => {
      void write()
    }, WRITE_AFTER_MILLISECONDS)
  }

  /**
   * Write what is waiting, now.
   *
   * Called when the edits stop arriving, and again when the page is about to be
   * hidden or thrown away: the phone call this is all for can arrive in the four
   * hundred milliseconds after an edit, and a last moment does exist to write in
   * - local storage writes synchronously, so this finishes before the page goes.
   */
  async function write(): Promise<void> {
    const pending = waiting

    clearTimeout(writing)
    waiting = undefined

    if (pending === undefined) {
      return
    }

    saving = await writeSaved(pending.siteId, pending.work, savedEffects)
  }

  function leaving(): void {
    void write()
  }

  function hidden(): void {
    if (document.visibilityState === 'hidden') {
      void write()
    }
  }

  /**
   * The Site's saved work, opened where it was left.
   *
   * A Site with nothing saved starts on an empty piece of ground, which is not
   * itself saved until something is put on it.
   */
  async function choose(choice: Site): Promise<void> {
    // Choosing the place that is already open is not a reason to go back to
    // storage: an edit made moments ago would be thrown off the page, and if the
    // write had not happened yet it would be gone with it.
    if (site?.id === choice.id) {
      return
    }

    site = choice
    selectedId = undefined
    layoutsUp = false

    const loaded = await loadSaved(choice.id, savedEffects)

    // The Site may have been chosen again while storage was being asked. By id
    // rather than by identity: `$state` hands back a proxy, so the object read
    // back is never the one that was put in.
    if (site.id !== choice.id) {
      return
    }

    savedLayouts = loaded.saved
    saving = loaded.saving

    const opening = mostRecentOf(loaded.saved)

    openId = opening?.id
    editor = startEditing(opening?.layout ?? newLayout(choice))
  }

  /** Open one of the Site's saved Layouts. */
  function openLayout(id: string): void {
    const chosen = savedWith(savedLayouts, id)

    if (chosen === undefined) {
      return
    }

    openId = chosen.id
    selectedId = undefined
    layoutsUp = false
    // Opening one is working on it, so it goes to the front of the list - which
    // is what "open where I left off" means on the next visit.
    savedLayouts = withSaved(savedLayouts, chosen)
    writeWhenSettled()
    editor = startEditing(chosen.layout)
  }

  /** Start another Layout for this Site, leaving the saved ones where they are. */
  function startAnotherLayout(): void {
    const current = site

    if (current === undefined) {
      return
    }

    openId = undefined
    selectedId = undefined
    layoutsUp = false
    editor = startEditing(newLayout(current))
  }

  /** Rename the open Layout. A name that is not a name leaves the old one. */
  function renameOpen(name: string): void {
    if (openId === undefined) {
      return
    }

    savedLayouts = withRenamed(savedLayouts, openId, name)
    writeWhenSettled()
  }

  /** Open the Layouts sheet, and put it away again. */
  function showLayouts(): void {
    layoutsUp = true
  }

  function closeLayouts(): void {
    layoutsUp = false
  }

  /** Take one Layout out of the Site's saved work. */
  function deleteLayout(id: string): void {
    const current = site

    if (current === undefined) {
      return
    }

    savedLayouts = withoutSaved(savedLayouts, id)

    // Deleting the one that is open leaves the most recent of what is left, or a
    // blank Layout - which is not saved until something is put on it, so the one
    // just deleted does not come straight back.
    if (openId === id) {
      const next = mostRecentOf(savedLayouts)

      openId = next?.id
      selectedId = undefined
      editor = startEditing(next?.layout ?? newLayout(current))
      // The sheet goes with it: what it was showing is no longer there.
      layoutsUp = false
    }

    writeWhenSettled()
  }

  /** Whether there is anywhere to go back to, or forward to. */
  const undoable = $derived(editor !== undefined && canUndo(editor))
  const redoable = $derived(editor !== undefined && canRedo(editor))

  function undoEdit(): void {
    const current = editor

    if (current === undefined) {
      return
    }

    const earlier = undo(current)

    // Nowhere to go: nothing has changed, so there is nothing to keep either.
    if (earlier === current) {
      return
    }

    editor = earlier
    remember(earlier.present)
    forgetADroppedSelection()
  }

  function redoEdit(): void {
    const current = editor

    if (current === undefined) {
      return
    }

    const later = redo(current)

    if (later === current) {
      return
    }

    editor = later
    remember(later.present)
    forgetADroppedSelection()
  }

  /** A selection that is no longer on the ground is not a selection. */
  function forgetADroppedSelection(): void {
    if (selectedPlacement() === undefined) {
      selectedId = undefined
    }
  }

  /** Ctrl and Z, or Cmd and Z, with Shift to go forward again. */
  function shortcut(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') {
      return
    }

    // A box someone is typing in has its own undo, and its own idea of what Ctrl
    // and Z mean. Taking the keystroke would be taking it from what they typed.
    if (event.target instanceof HTMLElement && isTypingIn(event.target)) {
      return
    }

    event.preventDefault()

    if (event.shiftKey) {
      redoEdit()
    } else {
      undoEdit()
    }
  }

  /** Whether the thing a keystroke is aimed at takes text. */
  function isTypingIn(target: HTMLElement): boolean {
    return target.isContentEditable || target.closest('input, textarea, select') !== null
  }

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

    change(withEditedVehicle(current, selected.vehicle, corrected))
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

    change(withPlacement(current, placement))
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

  /**
   * Change how see-through the placed vehicles are.
   *
   * Deliberately not `change`: nothing about the Layout moves, so there is
   * nothing for undo to reverse and nothing to write.
   */
  function setOpacity(next: number): void {
    opacity = next
  }

  function movePlacement(id: string, centre: Offset): void {
    if (layout !== undefined) {
      change(withMovedPlacement(layout, id, centre))
    }
  }

  function rotatePlacement(id: string, rotationDegrees: number): void {
    if (layout !== undefined) {
      change(withRotatedPlacement(layout, id, rotationDegrees))
    }
  }

  /**
   * The same vehicle again, beside the one that is selected - and the copy is
   * what is selected afterwards, so that a second tap makes a third. Three buses
   * take three taps.
   */
  function duplicatePlacement(): void {
    const current = layout
    const selected = selectedPlacement()

    if (current === undefined || selected === undefined) {
      return
    }

    const copy = duplicateOf(selected, crypto.randomUUID())

    change(withPlacement(current, copy))
    selectedId = copy.id
  }

  /** Take the selected vehicle off this Layout, and let go of the selection. */
  function deletePlacement(): void {
    const current = layout
    const selected = selectedPlacement()

    if (current === undefined || selected === undefined) {
      return
    }

    change(withoutPlacement(current, selected.id))
    selectedId = undefined
  }

  $effect(() => {
    const current = plan
    if (current === undefined) {
      imagery = IMAGERY_IDLE
      return
    }

    let abandoned = false
    let shown: ShownPicture | undefined = undefined

    imagery = IMAGERY_LOADING

    void loadImagery(current.requestUrl, imageryEffects).then((next) => {
      if (abandoned) {
        return
      }
      if (next.status === 'ready') {
        shown = showPicture(next.image)
        picture = shown
      }
      imagery = next
    })

    return () => {
      abandoned = true
      shown?.release()
    }
  })

  $effect(() =>
    followAttribution(USGS_NAIP_SERVICE_URL, (text) => {
      attribution = text
    }),
  )
</script>

<svelte:window onkeydown={shortcut} onpagehide={leaving} onvisibilitychange={hidden} />

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
          void choose(choice)
        }}
      >
        {choice.name}
      </button>
    {/each}
  </nav>

  {#if imagery.status === 'idle'}
    <p>Pick a place to lay vehicles out in.</p>
  {:else if imagery.status === 'loading'}
    <p role="status">{IMAGERY_LOADING_MESSAGE}</p>
  {:else if imagery.status === 'failed'}
    <p role="alert">{imagery.message}</p>
  {:else if plan !== undefined && layout !== undefined}
    <div class="stage">
      <MapView
        bind:this={mapView}
        imageUrl={picture?.url ?? ''}
        {plan}
        origin={layout.origin}
        frame={layout.frame}
        placements={layout.placements}
        {selectedId}
        {opacity}
        onselect={selectPlacement}
        onmove={movePlacement}
        onrotate={rotatePlacement}
      />
      {#if !saving.kept}
        <!-- Over the photograph rather than in the column, for the reason the
             sheets are: a notice arriving must not resize the map and move the
             ground under whoever is working on it. -->
        <p class="notsaved" role="status">{saving.message}</p>
      {/if}
      {#if layoutsUp}
        <!-- The Site's saved Layouts. A sheet over the photograph for the same
             reason the vehicle form is one: a list of options for a place is
             read against the place itself, and opening it must not move the
             ground under whoever is working on it. -->
        <Layouts
          saved={savedLayouts}
          {openId}
          {openName}
          onopen={openLayout}
          onrename={renameOpen}
          ondelete={deleteLayout}
          onnew={startAnotherLayout}
          onclose={closeLayouts}
        />
      {:else if selectedVehicle !== undefined}
        <!-- A sheet over the photograph rather than a row under it, so that
             opening the form never resizes the map - which would move the ground
             under whoever has just tapped a vehicle. Keyed on what is selected,
             so correcting one vehicle and then picking another starts afresh. -->
        {#key selectedId}
          <div class="sheet">
            <!-- What can be done with the vehicle that is selected. Turning is
                 not in here: that is the handle's job, and only the handle's. -->
            <div class="bar">
              <button type="button" onclick={duplicatePlacement}>Duplicate</button>
              <button type="button" onclick={deletePlacement}>Delete</button>
            </div>
            <VehicleEditor of={selectedVehicle} onchange={correctVehicle} />
          </div>
        {/key}
      {/if}
    </div>
    <!-- Always reachable, and never inside the selection's sheet: undoing a
         delete has to be possible when nothing is selected any more. -->
    <div class="bar">
      <!-- Which Layout this is, and the way to the others. Named for what it
           opens rather than for itself, so that a screen reader is told what the
           button is as well as what it currently says. -->
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Layouts: ${openName}`}
        onclick={showLayouts}
      >
        {openName}
      </button>
      <button type="button" title="Ctrl and Z" disabled={!undoable} onclick={undoEdit}>
        Undo
      </button>
      <button type="button" title="Ctrl, Shift and Z" disabled={!redoable} onclick={redoEdit}>
        Redo
      </button>
    </div>
    <Placed placements={layout.placements} {opacity} onopacity={setOpacity} />
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

  .notsaved {
    background: Canvas;
    font-size: 0.75rem;
    left: 0;
    margin: 0;
    padding: 0.25rem 0.5rem;
    position: absolute;
    right: 0;
    top: 0;
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
