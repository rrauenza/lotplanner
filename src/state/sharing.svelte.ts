import { browserCompressor } from '../browser/compression'
import { downloadFile, readFile } from '../browser/files'
import { offerLink } from '../browser/share'
import { importedFrom } from '../core/arrival'
import { encodeFile, fileNameFor } from '../core/file'
import type { Layout } from '../core/layout'
import { encodePayload } from '../core/link'
import { linkFor } from '../core/route'
import type { ArrivedCollection } from '../core/vehicle-collection'
import { collections } from './collections.svelte'

/**
 * The app's own side of an Artifact crossing its boundary.
 *
 * A Layout or a Collection that arrives or leaves does so as a shared link or as
 * a file (ADR 0009, ADR 0011). What that Artifact *is* - the envelope, the
 * version, the refusals, the name a file carries - is the core's, and is tested
 * there; this is only the session's half of it: the link the app just made and
 * what became of handing it over, the notice a file left behind, and the calls
 * that reach the platform (`browser/files.ts`, `browser/share.ts`).
 *
 * It is a module rather than the App's own state because none of it is keyed by
 * a Site: a share result is about the Artifact, not the place, and an import
 * notice outlives the Site it may have opened. Keeping it here is what lets the
 * App keep only the state that *is* about the open Site.
 *
 * Importing a Layout is the one part that needs the App: opening what arrived is
 * about the Site, so `importFile` hands an arrived Layout back to a caller's own
 * function rather than reaching into the App's editor itself.
 */

class Sharing {
  /** The link just made, kept on screen so it can always be copied by hand. */
  link = $state('')

  /** What became of a share: handed to the system, copied, or neither. */
  message = $state('')

  /**
   * What became of an import, or what went wrong with one, in plain words.
   *
   * Kept after the work is done rather than only while it happens: an import
   * that silently did nothing is the one outcome worth ruling out, so the answer
   * stays on screen whether it was success or a refusal.
   */
  notice = $state('')

  /**
   * Share the Layout on screen as a link.
   *
   * The link is built in the core and only handed out here: the phone's own
   * share sheet first, then the clipboard, and the link itself on screen when
   * neither is available. It is kept visible either way, because a share that
   * silently did nothing is the one outcome worth ruling out.
   */
  async share(layout: Layout | undefined, name: string): Promise<void> {
    if (layout === undefined) {
      return
    }

    const payload = await encodePayload({ kind: 'layout', layout }, browserCompressor)
    const link = linkFor(`${window.location.origin}${window.location.pathname}`, 'layout', payload)
    const offered = await offerLink(link, name)

    this.link = link
    this.message = offered.message
  }

  /** Offer the open Layout as a file, named for what it is called here. */
  exportLayout(layout: Layout | undefined, name: string): void {
    if (layout === undefined) {
      return
    }

    downloadFile(fileNameFor(name), encodeFile({ kind: 'layout', layout }, name))
  }

  /** Offer one of the visitor's Collections as a file. */
  exportCollection(id: string): void {
    const chosen = (collections.mine ?? []).find((each) => each.id === id)

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

  /**
   * Read a file the visitor chose, and do what it asks, saying plainly what
   * happened.
   *
   * A Collection is kept here, through the same fork a shared one takes. A
   * Layout is handed to `openImported`, because showing it and keeping it for
   * its Site is the App's business - the App owns the Site and the Editor - and
   * this module deliberately owns neither.
   */
  async importFile(
    file: File,
    openImported: (layout: Layout, name: string | undefined) => Promise<void>,
  ): Promise<void> {
    const imported = importedFrom(await readFile(file), { newId: () => crypto.randomUUID() })

    if (imported.kind === 'declined') {
      this.notice = imported.message
      return
    }
    if (imported.kind === 'collection') {
      this.receive(imported.collection)
      return
    }

    await openImported(imported.layout, imported.name)
  }

  /**
   * Keep a Collection that arrived in a file, or one a shared link offered.
   *
   * The same fork a file import takes (issue #11): a new collection with its own
   * id, the arrived name as provenance, so it can never overwrite or merge into
   * one the visitor already has. Saying what it became belongs with the keeping,
   * so the notice is set here rather than by each caller.
   */
  receive(arrived: ArrivedCollection): void {
    const made = collections.receive(arrived)

    this.notice = `Added "${made.name}" to your collections.`
  }
}

/** One place the session's shares and imports are held, for the whole page. */
export const sharing = new Sharing()
