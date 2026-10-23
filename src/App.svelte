<script lang="ts">
  import { APP_TAGLINE, APP_TITLE } from './app-info'
  import { followAttribution } from './browser/attribution'
  import { collectionEffects } from './browser/collections-store'
  import { browserCompressor } from './browser/compression'
  import { downloadFile, readFile } from './browser/files'
  import { imageryEffects } from './browser/imagery-store'
  import { savedEffects } from './browser/saved-store'
  import { offerLink } from './browser/share'
  import { showPicture, type ShownPicture } from './browser/picture'
  import Collections from './components/Collections.svelte'
  import Layouts from './components/Layouts.svelte'
  import MapView from './components/MapView.svelte'
  import Missing from './components/Missing.svelte'
  import Palette from './components/Palette.svelte'
  import Placed from './components/Placed.svelte'
  import SharedCollection from './components/SharedCollection.svelte'
  import VehicleEditor from './components/VehicleEditor.svelte'
  import type { Point } from './components/pointer'
  import { type Arrival, importedFrom } from './core/arrival'
  import { canRedo, canUndo, edit, redo, startEditing, undo, type Editor } from './core/editor'
  import type { ArrivedCollection } from './core/codec'
  import { extentForBounds, type Offset } from './core/geometry'
  import { encodeFile, fileNameFor } from './core/file'
  import { encodePayload } from './core/link'
  import { linkFor } from './core/route'
  import {
    IMAGERY_IDLE,
    IMAGERY_LOADING,
    IMAGERY_LOADING_MESSAGE,
    imageryPlanFor,
    imageryPlanForExtent,
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
    withImported,
    savedWith,
    withoutSaved,
    type SavedLayout,
    type Saving,
  } from './core/saved'
  import type { Site } from './core/site'
  import type { Vehicle } from './core/vehicle'
  import {
    SYSTEM_COLLECTION,
    adopted,
    loadCollections,
    mergedCollections,
    missingFrom,
    nextCollectionName,
    received,
    withCreated,
    withEditedCollectionVehicle,
    withRenamedCollection,
    withVehicle,
    withoutCollection,
    withoutVehicle,
    writeCollections,
    type VehicleCollection,
  } from './core/vehicle-collection'
  import { SITES } from './manifest'

  /** The one thing the App asks of the map: where a screen point is on the ground. */
  interface MapHandle {
    offsetAt(point: Point): Offset | undefined
  }

  /**
   * What the page load was, when it was more than a visit: a shared Layout to
   * open, or a link this screen could not. The visitor's own page is the default,
   * so a plain visit needs no prop at all.
   */
  let { arrival = { kind: 'visitor' } }: { arrival?: Arrival } = $props()

  /** Why a link that arrived could not be opened, or nothing when none did. */
  const declined = $derived(arrival.kind === 'declined' ? arrival.message : '')

  /**
   * A Collection that arrived in a link, waiting to be kept or left.
   *
   * Opening the link is not keeping it: a shared link must never change what the
   * recipient has (ADR 0002), so what arrives is offered, and only "Add to my
   * collections" - the same fork a file import takes - writes anything. Answering
   * either way puts the offer away.
   */
  let offerAnswered = $state(false)
  const offered = $derived(
    !offerAnswered && arrival.kind === 'collection' ? arrival.collection : undefined,
  )

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

  /**
   * Whether the Site on screen arrived - from a shared link or an imported file -
   * rather than being chosen from the manifest.
   *
   * Choosing that same place again is then a request to see one's own saved work
   * for it, which the guard in `choose` would otherwise mistake for a repeat.
   */
  let openedFromALink = $state(false)

  /** The link just made, kept on screen so it can always be copied by hand. */
  let sharedLink = $state('')

  /** What became of a share: handed to the system, copied, or neither. */
  let sharing = $state('')

  /**
   * What became of an import, or what went wrong with one, in plain words.
   *
   * Kept after the work is done rather than only while it happens: an import
   * that silently did nothing is the one outcome worth ruling out, so the answer
   * stays on screen whether it was success or a refusal.
   */
  let importNotice = $state('')

  /** Whether what is on screen will survive the session, and what to say if not. */
  let saving = $state<Saving>(KEPT)

  /** Whether the Layouts sheet is up. */
  let layoutsUp = $state(false)

  /**
   * The visitor's own Vehicle Collections, or undefined until they have been
   * read.
   *
   * Undefined rather than an empty list, so that the palette does not offer to
   * make one before the read has finished - a collection made in that moment
   * would be written over by the read's own answer.
   */
  let collections = $state<readonly VehicleCollection[] | undefined>(undefined)

  /** Whether they will survive the session, and what to say if not. */
  let collectionsSaving = $state<Saving>(KEPT)

  /**
   * Which collection the palette is showing, and which the Collections sheet is
   * open on. A view of this session, like the opacity: nothing records it, and a
   * reload starts on the System Collection.
   */
  let chosenCollection = $state(SYSTEM_COLLECTION.id)

  /** Whether the Collections sheet is up. */
  let collectionsUp = $state(false)

  /**
   * Whether the adoption offer has been put away for the Layout now open.
   *
   * A view of the session, like the chosen collection: nothing records it. It
   * goes back to false whenever a Layout is opened, because opening one reports
   * what is missing; an edit leaves it alone, so declining is a decision that
   * stands until the next time the Layout is opened.
   */
  let adoptionDeclined = $state(false)

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
   * Whether every vehicle is frozen, so that every gesture pans the picture.
   *
   * A view of this session like the opacity, and not part of the work: nothing
   * records it, a reload starts unlocked, and nothing about it is written into a
   * Layout (ADR 0008). It is not an edit either, so undo does not reach it.
   */
  let locked = $state(false)

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

  /** The same, for the visitor's collections: one write once the edits stop. */
  let collectionsWriting: ReturnType<typeof setTimeout> | undefined

  /** The name of the Layout being worked on, kept or not. */
  const openName = $derived(savedWith(savedLayouts, openId)?.name ?? nextName(savedLayouts))
  let selectedId: string | undefined = $state(undefined)
  let imagery: ImageryState = $state(IMAGERY_IDLE)
  let attribution = $state('')
  let picture = $state<ShownPicture | undefined>(undefined)
  // Raw, so that putting a component instance into state does not wrap it in a
  // proxy, which a Leaflet-backed component would not enjoy.
  let mapView = $state.raw<MapHandle | undefined>(undefined)

  /**
   * The hidden file input behind the Import button.
   *
   * An `<input type="file">` is the only way a page may ask for a file, and it
   * cannot be opened except by a click the visitor made, so the visible button
   * clicks this one. It is in the header rather than beside Share because a file
   * may bring its own Site, and so has to be importable before any is open.
   */
  let importInput = $state<HTMLInputElement | undefined>(undefined)

  /**
   * Everything about the chosen Site that arithmetic alone decides.
   *
   * A Site that arrived - by link or file - is planned from the Layout's own
   * bounding box rather than from its frame plus a margin. The artifact carries
   * the box precisely so the recipient sees the photograph the sender saw; using
   * it is what makes "the same photograph" true rather than true only while both
   * apps derive the extent identically. A Site from the manifest has no carried
   * box, so it is planned as it always was.
   */
  const plan = $derived(
    site === undefined
      ? undefined
      : openedFromALink && layout !== undefined
        ? imageryPlanForExtent(
            layout.origin,
            extentForBounds(layout.origin, layout.bounds),
            USGS_NAIP_SERVICE_URL,
          )
        : imageryPlanFor(site, USGS_NAIP_SERVICE_URL),
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
    void writeCollectionsNow()
  }

  function hidden(): void {
    if (document.visibilityState === 'hidden') {
      void write()
      void writeCollectionsNow()
    }
  }

  /**
   * The visitor's collections, read once when the app opens.
   *
   * The read may have raced a collection made in the moment before it answered.
   * Merging rather than replacing keeps both: replacing would discard stored
   * work, and the next write would then persist only the new collection, losing
   * everything that was there. The saving state is taken only when nothing has
   * been made yet, so a late read cannot overwrite the success or refusal a write
   * has already reported.
   */
  async function openCollections(): Promise<void> {
    const loaded = await loadCollections(collectionEffects)

    if (collections === undefined) {
      collections = loaded.collections
      collectionsSaving = loaded.saving
      return
    }

    collections = mergedCollections(loaded.collections, collections)
  }

  /**
   * Whether there is a change to the collections that has not been written.
   *
   * `pagehide` and `visibilitychange` fire on every tab switch and every
   * navigation, and writing on each one would write the same list again for
   * nothing. It also lets a late read's saving state overwrite the state a write
   * had just set; guarding on this means a write happens only when there is
   * something to write.
   */
  let collectionsChanged = false

  /**
   * The visitor's collections as they now stand, written shortly after.
   *
   * Kept in memory in the meantime, like a Layout's save: the same
   * write-when-the-edits-stop shape, for the same reason - the phone call this
   * is all for can arrive in the moment after an edit.
   */
  function keepCollections(next: readonly VehicleCollection[]): void {
    collections = next
    collectionsChanged = true
    clearTimeout(collectionsWriting)
    collectionsWriting = setTimeout(() => {
      void writeCollectionsNow()
    }, WRITE_AFTER_MILLISECONDS)
  }

  async function writeCollectionsNow(): Promise<void> {
    clearTimeout(collectionsWriting)

    if (collections === undefined || !collectionsChanged) {
      return
    }

    collectionsChanged = false
    collectionsSaving = await writeCollections(collections, collectionEffects)
  }

  /**
   * A new collection, named for now and renamed as soon as it appears.
   *
   * The name is a placeholder that has to be a name: nothing here can guess what
   * a fleet is for, and the box is right there next to the new row.
   */
  function createCollection(): void {
    const made: VehicleCollection = {
      id: crypto.randomUUID(),
      name: nextCollectionName(collections ?? []),
      vehicles: [],
    }

    keepCollections(withCreated(collections ?? [], made))
    // Shown at once, so the palette and the sheet are looking at the new one
    // rather than at whatever was chosen before it.
    chosenCollection = made.id
  }

  function renameCollection(id: string, name: string): void {
    keepCollections(withRenamedCollection(collections ?? [], id, name))
  }

  function deleteCollection(id: string): void {
    keepCollections(withoutCollection(collections ?? [], id))

    // The palette cannot show a collection that is not there any more.
    if (chosenCollection === id) {
      chosenCollection = SYSTEM_COLLECTION.id
    }
  }

  function addVehicleToCollection(id: string, added: Vehicle): void {
    keepCollections(withVehicle(collections ?? [], id, added))
  }

  function editVehicleInCollection(id: string, before: Vehicle, after: Vehicle): void {
    keepCollections(withEditedCollectionVehicle(collections ?? [], id, before, after))
  }

  function removeVehicleFromCollection(id: string, removed: Vehicle): void {
    keepCollections(withoutVehicle(collections ?? [], id, removed))
  }

  /**
   * Take the open Layout's missing vehicles into one new collection.
   *
   * The vehicles become living copies of the visitor's own, and the Layout they
   * came from is not touched: adopting is not a repair, because a Layout carries
   * what it renders (ADR 0002). Choosing the new collection shows it in the
   * palette at once, beside the name box it is renamed in.
   */
  function adoptMissing(): void {
    const current = collections
    const absent = missing

    if (current === undefined || absent.length === 0) {
      return
    }

    const made = adopted(current, absent, crypto.randomUUID())

    keepCollections(withCreated(current, made))
    chosenCollection = made.id
  }

  /** Put the offer away. The Layout renders and edits the same either way. */
  function declineAdoption(): void {
    adoptionDeclined = true
  }

  function chooseCollection(id: string): void {
    chosenCollection = id
  }

  function showCollections(): void {
    collectionsUp = true
  }

  function closeCollections(): void {
    collectionsUp = false
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
    // write had not happened yet it would be gone with it. The exception is a
    // place opened from a shared link, where "choose this place" is a real
    // request to see one's own saved work for it instead of the arrival.
    if (site?.id === choice.id && !openedFromALink) {
      return
    }

    openedFromALink = false
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
    adoptionDeclined = false
  }

  /**
   * The Site a Layout carries, so a shared or imported Layout opens even when
   * the manifest has never heard of the place (ADR 0002, ADR 0009).
   */
  function siteFromLayout(layout: Layout): Site {
    const place: Site = { id: layout.siteId, name: layout.siteName, origin: layout.origin }

    return layout.frame === undefined ? place : { ...place, frame: layout.frame }
  }

  /**
   * Put a Layout on screen, and read the Site's own work so a later edit joins it.
   *
   * The Site is rebuilt from what the Layout carries - its name, its
   * georeference and its frame - so it opens without the manifest having heard
   * of the place, and without an account or an install.
   *
   * The work that was read comes back, so a caller that is about to add to it -
   * an import - carries on from the list that was just put on screen rather than
   * reading storage twice.
   */
  async function showLayout(shared: Layout): Promise<readonly SavedLayout[]> {
    const arrived = siteFromLayout(shared)

    site = arrived
    openedFromALink = true

    const loaded = await loadSaved(arrived.id, savedEffects)

    // The place may have been chosen while storage was being asked; by id rather
    // than identity, since `$state` hands back a proxy.
    if (site.id !== arrived.id) {
      return []
    }

    savedLayouts = loaded.saved
    saving = loaded.saving
    // Nobody's saved work until an edit: the arrangement has no name and no id
    // yet, and giving it the recipient's most recent one would be a lie.
    openId = undefined
    selectedId = undefined
    editor = startEditing(shared)

    return loaded.saved
  }

  /**
   * Open a Layout that arrived in a link.
   *
   * What it does to the recipient's own work is nothing: their saved Layouts for
   * this Site are read, so a later edit joins them rather than replacing the
   * record, but nothing is written and nothing is removed. The shared
   * arrangement is shown beside their work, unnamed and unsaved, until they edit
   * it - and then it becomes theirs, not the sender's.
   */
  async function openShared(shared: Layout): Promise<void> {
    await showLayout(shared)
  }

  /**
   * Import a Layout from a file: show it, and keep it as a named Layout here.
   *
   * Unlike a link, a file is kept - the visitor asked for it - so this is
   * `showLayout` plus one named entry. It is added and never replaces: the id is
   * this session's own, and `withImported` only appends, so work already on the
   * Site survives an import byte for byte.
   */
  async function importLayout(layout: Layout, wanted: string | undefined): Promise<void> {
    const arrived = siteFromLayout(layout)
    const alreadyOpen = site?.id === arrived.id

    // Anything waiting to be written for the place being left goes now, so
    // arriving somewhere else cannot lose it.
    if (!alreadyOpen && waiting !== undefined) {
      await write()
    }

    site = arrived
    openedFromALink = true
    selectedId = undefined

    // The Site already open has newer work in memory than storage does, so
    // reading storage again would drop an edit made a moment ago.
    const loaded = alreadyOpen
      ? { saved: savedLayouts, saving }
      : await loadSaved(arrived.id, savedEffects)

    // Chosen again while storage was being asked; by id, since `$state` hands
    // back a proxy.
    if (site.id !== arrived.id) {
      return
    }

    const id = crypto.randomUUID()

    savedLayouts = withImported(loaded.saved, layout, wanted, id)
    saving = loaded.saving
    openId = id
    editor = startEditing(layout)
    importNotice = `Imported "${savedWith(savedLayouts, id)?.name ?? 'a Layout'}" into ${layout.siteName}.`
    writeWhenSettled()
  }

  /**
   * Keep a Collection that arrived in a file.
   *
   * Through the same rule a shared one takes (issue #11): a fork with its own id,
   * the arrived name recorded as provenance, so an import can never overwrite or
   * merge into what is already here.
   */
  function importCollection(arrived: ArrivedCollection): void {
    const made = received(collections ?? [], arrived, crypto.randomUUID())

    keepCollections(withCreated(collections ?? [], made))
    chosenCollection = made.id
    importNotice = `Added "${made.name}" to your collections.`
  }

  /**
   * Keep the Collection a shared link offered.
   *
   * The same fork a file import takes (issue #11): a new collection with its own
   * id, the arrived name as provenance, so it can never overwrite or merge into
   * one the visitor already has.
   */
  function keepOfferedCollection(): void {
    const arrived = offered

    if (arrived === undefined) {
      return
    }

    offerAnswered = true
    importCollection(arrived)
  }

  /** Leave the offered Collection: nothing of the visitor's own changes. */
  function declineOfferedCollection(): void {
    offerAnswered = true
  }

  /** Read a file the visitor chose, and do what it asks, saying plainly what happened. */
  async function importFile(file: File): Promise<void> {
    const imported = importedFrom(await readFile(file), { newId: () => crypto.randomUUID() })

    if (imported.kind === 'declined') {
      importNotice = imported.message
      return
    }
    if (imported.kind === 'collection') {
      importCollection(imported.collection)
      return
    }

    await importLayout(imported.layout, imported.name)
  }

  /** The file input's answer, once the visitor has chosen something. */
  function fileChosen(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    const chosen = input.files?.[0]

    // Cleared so that choosing the same file twice in a row is still an import:
    // an input that keeps its value fires no change the second time.
    input.value = ''

    if (chosen !== undefined) {
      void importFile(chosen)
    }
  }

  /** Offer the open Layout as a file, named for what it is called here. */
  function exportLayout(): void {
    const current = layout

    if (current === undefined) {
      return
    }

    downloadFile(fileNameFor(openName), encodeFile({ kind: 'layout', layout: current }, openName))
  }

  /** Offer one of the visitor's Collections as a file. */
  function exportCollection(id: string): void {
    const chosen = (collections ?? []).find((each) => each.id === id)

    if (chosen === undefined) {
      return
    }

    downloadFile(
      fileNameFor(chosen.name),
      encodeFile({
        kind: 'collection',
        collection: { name: chosen.name, vehicles: chosen.vehicles },
      }),
    )
  }

  // A Layout that arrived in the link, opened once the component is up: an
  // effect rather than a call at the top of the script because the arrival is a
  // prop, and reading one outside a reactive context is exactly what the
  // compiler warns about.
  $effect(() => {
    if (arrival.kind === 'layout') {
      void openShared(arrival.layout)
    }
  })

  /**
   * Share the Layout on screen as a link.
   *
   * The link is built in the core and only handed out here: the phone's own
   * share sheet first, then the clipboard, and the link itself on screen when
   * neither is available. It is kept visible either way, because a share that
   * silently did nothing is the one outcome worth ruling out.
   */
  async function share(): Promise<void> {
    const current = layout

    if (current === undefined) {
      return
    }

    const payload = await encodePayload({ kind: 'layout', layout: current }, browserCompressor)
    const link = linkFor(`${window.location.origin}${window.location.pathname}`, 'layout', payload)
    const offered = await offerLink(link, openName)

    sharedLink = link
    sharing = offered.message
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
    adoptionDeclined = false
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
    adoptionDeclined = false
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
      adoptionDeclined = false
      // The sheet goes with it: what it was showing is no longer there.
      layoutsUp = false
    }

    writeWhenSettled()
  }

  /** Whether there is anywhere to go back to, or forward to. */
  const undoable = $derived(editor !== undefined && canUndo(editor))
  const redoable = $derived(editor !== undefined && canRedo(editor))

  /**
   * What will not be kept, if anything will not.
   *
   * Named for what it says rather than `notice`, which is what the banner a
   * declined or imported link raises is called: the two are different things and
   * a reader should not have to work out which is meant. One message rather than
   * one per kind of work, because a screen reader handed two at once reads them
   * as two problems, and the visitor has the same one either way - nothing here
   * will be here tomorrow.
   */
  const unsaved = $derived(
    saving.kept ? (collectionsSaving.kept ? undefined : collectionsSaving.message) : saving.message,
  )

  /**
   * The open Layout's vehicles that are in none of the visitor's collections.
   *
   * The System Collection counts as one of the visitor's, so a vehicle dragged
   * from the palette is never reported. What is reported is a Layout that arrived
   * from somewhere else, or one whose vehicles were corrected until nothing here
   * recognises them - and it is derived rather than remembered, so it goes the
   * moment they are adopted.
   */
  const missing = $derived(
    collections === undefined || layout === undefined ? [] : missingFrom(collections, layout),
  )

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

  /**
   * Freeze every vehicle, or let them go again.
   *
   * Locking lets go of the selection: a handle and a form are things to touch,
   * and a lock means touching does not move anything. Not `change`: nothing
   * about the Layout moves, so there is nothing for undo to reverse.
   */
  function toggleLock(): void {
    locked = !locked

    if (locked) {
      selectedId = undefined
    }
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

  /** The visitor's collections are read once, as the app opens. */
  $effect(() => {
    void openCollections()
  })
</script>

<svelte:window onkeydown={shortcut} onpagehide={leaving} onvisibilitychange={hidden} />

<main>
  <header>
    <div class="titles">
      <h1>{APP_TITLE}</h1>
      <p>{APP_TAGLINE}</p>
    </div>
    <div class="bar">
      <!-- Import is here rather than beside Share because a file may bring its
           own Site, so it has to be reachable before any place is open. The
           input is the only way a page may ask for a file, and cannot be opened
           except by a click the visitor made, so the button clicks it. It shares
           the title's row rather than taking one of its own: below the title it
           cost the map enough height that the selection sheet covered the middle
           of a 720 px screen, where a vehicle just placed is picked up again. -->
      <button type="button" onclick={() => importInput?.click()}>Import a file</button>
      <input
        class="importing"
        type="file"
        accept=".json,application/json"
        aria-label="Choose a lotplanner file to import"
        bind:this={importInput}
        onchange={fileChosen}
      />
    </div>
  </header>

  {#if importNotice !== ''}
    <!-- What became of the last import. Announced rather than thrown: a file
         that could not be read is an answer, and nothing already stored moved. -->
    <p class="notice" role="status">{importNotice}</p>
  {/if}

  {#if declined !== ''}
    <!-- A link that arrived but could not be opened. Announced rather than
         thrown: the visitor's own page is still here underneath it. -->
    <p class="notice" aria-live="polite">{declined}</p>
  {/if}

  {#if offered !== undefined}
    <!-- A Collection a shared link carried. Offered rather than kept, because
         opening a link must not change what the visitor has (ADR 0002); adding
         it is a deliberate action and goes through the same fork a file import
         takes. -->
    <SharedCollection
      collection={offered}
      onkeep={keepOfferedCollection}
      ondecline={declineOfferedCollection}
    />
  {/if}

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
        {locked}
        onselect={selectPlacement}
        onmove={movePlacement}
        onrotate={rotatePlacement}
      />
      {#if unsaved !== undefined}
        <!-- Over the photograph rather than in the column, for the reason the
             sheets are: a message arriving must not resize the map and move the
             ground under whoever is working on it. -->
        <p class="notsaved" role="status">{unsaved}</p>
      {/if}
      {#if sharedLink !== ''}
        <!-- Over the photograph too, and for the same reason: the link
             appearing must not resize the map. Shown whether or not the system
             took it, because a share that silently did nothing is the one
             outcome worth ruling out. -->
        <div class="sharing" aria-live="polite">
          <p>{sharing}</p>
          <input
            readonly
            value={sharedLink}
            aria-label="Link to this Layout"
            onfocus={(event) => event.currentTarget.select()}
          />
        </div>
      {/if}
      {#if collectionsUp}
        <!-- The visitor's own collections, over the photograph for the same
             reason the Layouts sheet is: what a collection holds is read against
             the vehicles on the ground, and opening it must not resize the map. -->
        <Collections
          collections={collections ?? []}
          chosen={chosenCollection}
          onchoose={chooseCollection}
          oncreate={createCollection}
          onrename={renameCollection}
          ondelete={deleteCollection}
          onexport={exportCollection}
          onaddvehicle={addVehicleToCollection}
          oneditvehicle={editVehicleInCollection}
          onremovevehicle={removeVehicleFromCollection}
          onclose={closeCollections}
        />
      {:else if layoutsUp}
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
          <div class="sheet selection">
            <!-- What can be done with the vehicle that is selected. Turning is
                 not in here: that is the handle's job, and only the handle's. -->
            <div class="bar">
              <button type="button" onclick={duplicatePlacement}>Duplicate</button>
              <button type="button" onclick={deletePlacement}>Delete</button>
            </div>
            <VehicleEditor of={selectedVehicle} onchange={correctVehicle} />
          </div>
        {/key}
      {:else if missing.length > 0 && !adoptionDeclined}
        <!-- What the Layout uses that the visitor does not have, over the
             photograph for the same reason the other sheets are: opening it must
             not resize the map, because the report is read against the ground it
             is about. -->
        <Missing {missing} onadopt={adoptMissing} ondecline={declineAdoption} />
      {/if}
    </div>
    <!-- Everything below the photograph, in one block that gives way on a short
         screen: the map keeps a modest floor and this is what scrolls when
         there is not enough height for both, rather than the map overflowing
         and sitting on top of it. -->
    <div class="chrome">
      <!-- Always reachable, and never inside the selection's sheet: undoing a
           delete has to be possible when nothing is selected any more. -->
      <div class="bar">
        <!-- Which Layout this is, and the way to the others. Named for what it
             opens rather than for itself, so that a screen reader is told what
             the button is as well as what it currently says. -->
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
        <button type="button" onclick={() => void share()}>Share</button>
        <button type="button" onclick={exportLayout}>Export</button>
        <!-- Freezes the vehicles so that every gesture pans the picture, for
             reviewing what is finished and for moving the view while placing
             many. A view of the session rather than part of the work, so it is
             not named for a Layout and not saved. -->
        <button
          type="button"
          aria-pressed={locked}
          aria-label="Lock vehicles"
          title="Freeze the vehicles so every gesture pans"
          onclick={toggleLock}
        >
          {locked ? 'Locked' : 'Lock'}
        </button>
      </div>
      <Placed placements={layout.placements} {opacity} onopacity={setOpacity} />
      <Palette
        collections={collections ?? []}
        chosen={chosenCollection}
        onchoose={chooseCollection}
        onmanage={showCollections}
        ondrop={dropFrom}
        onplace={placeInTheMiddle}
      />
      <!-- Here even before it is known, so that the credit arriving cannot
           resize the map either. -->
      <p class="credit">{attribution}</p>
    </div>
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
    /* Nothing spills past the viewport: what does not fit is decided between
       the stage and the chrome below, not by letting one overflow the other. */
    overflow: hidden;
  }

  /* The title block and the Import control share one row, so the control costs
     the map no height of its own: on a 720 px screen the row it would otherwise
     take is enough to bring the selection sheet up over the middle of the map,
     where a vehicle was just placed. */
  header {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .titles {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
  }

  /* The row is spaced by the header's own gap, not by the bar's page-level
     margin, which would push the button off the title's centre line. */
  header .bar {
    margin-bottom: 0;
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
    /* A fingertip across, like every other control a thumb reaches for. */
    min-height: 2.5rem;
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
    flex: 1 1 auto;
    /* A modest floor, so the photograph stays a photograph. The chrome below
       gives way instead - the map itself once had a 20rem floor, and on a
       390x664 screen it won and pushed the controls off the page. */
    min-height: 10rem;
    position: relative;
  }

  /* The selection form is the tallest sheet that floats over the map. Its top
     must not cross the middle of the map, or a vehicle just placed at the centre
     cannot be grabbed again: half the stage would put the top exactly on the
     midpoint, so this stops short of it. Shorter content still takes its own
     height; only a sheet that would have crossed is bounded and scrolls. */
  .sheet.selection {
    max-height: 45%;
  }

  .chrome {
    display: flex;
    flex: 0 1 auto;
    flex-direction: column;
    gap: 0.5rem;
    /* The part that scrolls when the screen is shorter than the controls need:
       everything here stays reachable, without the map giving up more than its
       own floor. */
    min-height: 0;
    overflow-y: auto;
  }

  .chrome > * {
    /* The panels keep the height they ask for, and the chrome scrolls past what
       it cannot show. Without this they are flex items and shrink instead,
       which turns the palette into a second, clipped scroll area of its own. */
    flex-shrink: 0;
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

  .notice {
    background: color-mix(in srgb, gold 30%, transparent);
    margin: 0;
    padding: 0.5rem 0.75rem;
  }

  /* The file input is opened by the Import button above; it is not a control to
     tab to, and not something to show. */
  .importing {
    display: none;
  }

  .sharing {
    background: Canvas;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    left: 0;
    padding: 0.5rem 0.75rem;
    position: absolute;
    right: 0;
    z-index: 800;
  }

  .sharing p {
    font-size: 0.875rem;
    margin: 0;
  }

  /* Wide enough to read the beginning of a link, which is what tells one share
     from the next, and never a scrollbar on a phone. */
  .sharing input {
    box-sizing: border-box;
    width: 100%;
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
