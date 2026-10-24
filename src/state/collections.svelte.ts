import { collectionEffects } from '../browser/collections-store'
import { KEPT, type Saving } from '../core/saved'
import type { Vehicle } from '../core/vehicle'
import {
  SYSTEM_COLLECTION,
  adopted,
  loadCollections,
  mergedCollections,
  nextCollectionName,
  received,
  withCreated,
  withEditedCollectionVehicle,
  withRenamedCollection,
  withVehicle,
  withoutCollection,
  withoutVehicle,
  writeCollections,
  type ArrivedCollection,
  type VehicleCollection,
} from '../core/vehicle-collection'
import { WRITE_AFTER_MILLISECONDS } from './saving'

/**
 * The visitor's Vehicle Collections, as the session holds them.
 *
 * This is shell state rather than a rule, which is why it is not in `core/`
 * (a Collection's rules - the reserved name, import-as-fork, the names, the
 * ordering - are all `core/vehicle-collection.ts`, and every one of them is
 * called from here unchanged). What lives here is the part the core cannot
 * hold: which Collections are in memory right now, whether that is being kept,
 * which one the palette is showing, and when the work is written.
 *
 * It is a **module** rather than a component's state because three things read
 * it and none of them can own it: `App.svelte` (the missing-vehicle report and
 * the unsaved message), `Palette.svelte` (the tabs and the chips) and
 * `Collections.svelte` (the sheet). Svelte 5's own tool for exactly that is
 * reactive state in a `.svelte.ts` module, so a tab pressed in the palette and
 * an edit made in the sheet are the same list, without App passing it through.
 *
 * **Nothing here is keyed by a Site**, which is the evidence it does not belong
 * in the component that owns the Site: a Collection belongs to the browser, so
 * it comes with the visitor from one place to the next.
 */

/**
 * The visitor's own Vehicle Collections, and what the session is doing with
 * them.
 *
 * A class rather than a bare object, so that the list and the operations on it
 * have one name to be read under, and so that what is being written and what
 * has been changed can stay out of it.
 */
class Collections {
  /**
   * The visitor's own Collections, or undefined until they have been read.
   *
   * Undefined rather than an empty list, so that the palette does not offer to
   * make one before the read has finished - a collection made in that moment
   * would be written over by the read's own answer.
   */
  mine = $state<readonly VehicleCollection[] | undefined>(undefined)

  /** Whether they will survive the session, and what to say if not. */
  saving = $state<Saving>(KEPT)

  /**
   * Which Collection the palette is showing, and which the sheet is open on. A
   * view of this session, like the opacity: nothing records it, and a reload
   * starts on the System Collection.
   */
  chosen = $state(SYSTEM_COLLECTION.id)

  /** Whether the Collections sheet is up. A view of the session too. */
  up = $state(false)

  /**
   * Whether there is a change that has not been written.
   *
   * `pagehide` and `visibilitychange` fire on every tab switch and every
   * navigation, and writing on each one would write the same list again for
   * nothing. It also lets a late read's saving state overwrite the state a
   * write had just set; guarding on this means a write happens only when there
   * is something to write.
   */
  private changed = false

  /** The write that is waiting for the edits to stop. */
  private writing: ReturnType<typeof setTimeout> | undefined

  /**
   * The visitor's Collections, read once when the app opens.
   *
   * The read may have raced a collection made in the moment before it answered.
   * Merging rather than replacing keeps both: replacing would discard stored
   * work, and the next write would then persist only the new collection, losing
   * everything that was there. The saving state is taken only when nothing has
   * been made yet, so a late read cannot overwrite the success or refusal a
   * write has already reported.
   */
  async open(): Promise<void> {
    const loaded = await loadCollections(collectionEffects)
    const current = this.mine

    if (current === undefined) {
      this.mine = loaded.collections
      this.saving = loaded.saving
      return
    }

    this.mine = mergedCollections(loaded.collections, current)
  }

  /**
   * The Collections as they now stand, written shortly after.
   *
   * Kept in memory in the meantime, like a Layout's save: the same
   * write-when-the-edits-stop shape, and the same delay before it writes.
   */
  private keep(next: readonly VehicleCollection[]): void {
    this.mine = next
    this.changed = true
    clearTimeout(this.writing)
    this.writing = setTimeout(() => {
      void this.writeNow()
    }, WRITE_AFTER_MILLISECONDS)
  }

  /**
   * Write what is waiting, now.
   *
   * Called when the edits stop arriving, and again when the page is about to be
   * hidden or thrown away: local storage writes synchronously, so this finishes
   * before the page goes.
   */
  async writeNow(): Promise<void> {
    clearTimeout(this.writing)

    const current = this.mine

    if (current === undefined || !this.changed) {
      return
    }

    this.changed = false
    this.saving = await writeCollections(current, collectionEffects)
  }

  /**
   * A new Collection, named for now and renamed as soon as it appears.
   *
   * The name is a placeholder that has to be a name: nothing here can guess what
   * a fleet is for, and the box is right there next to the new row.
   */
  create(): void {
    const made: VehicleCollection = {
      id: crypto.randomUUID(),
      name: nextCollectionName(this.mine ?? []),
      vehicles: [],
    }

    this.keep(withCreated(this.mine ?? [], made))
    // Shown at once, so the palette and the sheet are looking at the new one
    // rather than at whatever was chosen before it.
    this.chosen = made.id
  }

  rename(id: string, name: string): void {
    this.keep(withRenamedCollection(this.mine ?? [], id, name))
  }

  remove(id: string): void {
    this.keep(withoutCollection(this.mine ?? [], id))

    // The palette cannot show a collection that is not there any more.
    if (this.chosen === id) {
      this.chosen = SYSTEM_COLLECTION.id
    }
  }

  addVehicle(id: string, added: Vehicle): void {
    this.keep(withVehicle(this.mine ?? [], id, added))
  }

  editVehicle(id: string, before: Vehicle, after: Vehicle): void {
    this.keep(withEditedCollectionVehicle(this.mine ?? [], id, before, after))
  }

  removeVehicle(id: string, removed: Vehicle): void {
    this.keep(withoutVehicle(this.mine ?? [], id, removed))
  }

  /**
   * Take the missing vehicles into one new Collection of the visitor's own.
   *
   * The vehicles become living copies of the visitor's own, and the Layout they
   * came from is not touched: adopting is not a repair, because a Layout carries
   * what it renders (ADR 0002). Choosing the new collection shows it in the
   * palette at once, beside the name box it is renamed in.
   *
   * The caller decides what is missing - that is a Layout question, and the
   * Layout is the App's - so what arrives here is already the set to adopt.
   */
  adopt(vehicles: readonly Vehicle[]): void {
    const current = this.mine

    if (current === undefined || vehicles.length === 0) {
      return
    }

    const made = adopted(current, vehicles, crypto.randomUUID())

    this.keep(withCreated(current, made))
    this.chosen = made.id
  }

  /**
   * Keep a Collection that arrived from a file, under its own id.
   *
   * Through the same rule a shared one takes (issue #11): a fork with its own
   * id, the arrived name recorded as provenance, so an import can never
   * overwrite or merge into what is already here. The new Collection is handed
   * back, so the caller can say what it became.
   */
  receive(arrived: ArrivedCollection): VehicleCollection {
    const current = this.mine ?? []
    const made = received(current, arrived, crypto.randomUUID())

    this.keep(withCreated(current, made))
    this.chosen = made.id

    return made
  }

  choose(id: string): void {
    this.chosen = id
  }

  show(): void {
    this.up = true
  }

  close(): void {
    this.up = false
  }
}

/** One set of Collections for the whole page, read and written from anywhere. */
export const collections = new Collections()
