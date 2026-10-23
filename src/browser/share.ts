/**
 * Handing a link to the phone, or to the clipboard.
 *
 * On a phone the one-tap path is the system's own share sheet, which is what
 * offers the messaging app directly. Where there is none - a desktop, or a page
 * that is not a secure context - the clipboard is the fallback, and where even
 * that is unavailable the link is put on screen for the person to copy by hand.
 *
 * Web Share is deliberately untested, along with the other adapters: a headless
 * browser does not expose it, so a test could only prove the fallback. The link
 * being shared is built in the core and tested there.
 */

export interface Offer {
  readonly method: 'share' | 'clipboard' | 'none'
  /** What to tell the person, or nothing when they closed the sheet themselves. */
  readonly message: string
}

/**
 * The two platform facilities this reaches for, both optional.
 *
 * Declared as optionals rather than read off `navigator` directly, because the
 * DOM types list them as always present while the deployment that broke the
 * sharing path proved otherwise: on a plain-HTTP origin `navigator.clipboard`
 * is undefined, and the type would not have said so.
 */
interface Sharing {
  share?: (data: { readonly title: string; readonly url: string }) => Promise<void>
  clipboard?: { writeText(text: string): Promise<void> }
}

export async function offerLink(link: string, title: string): Promise<Offer> {
  const sharing: Sharing = navigator

  if (sharing.share !== undefined) {
    try {
      await sharing.share({ title, url: link })
      return { method: 'share', message: 'Shared.' }
    } catch (cause) {
      // Closing the share sheet is a choice, not a failure: say nothing and
      // offer nothing, because the link is still on screen.
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        return { method: 'none', message: '' }
      }
      // Anything else - a browser with no share targets, a refused gesture -
      // is a reason to try the clipboard rather than to give up.
    }
  }

  if (sharing.clipboard !== undefined) {
    try {
      await sharing.clipboard.writeText(link)
      return { method: 'clipboard', message: 'Link copied. Paste it into a message.' }
    } catch {
      // Fell through on purpose: the link below is what is left.
    }
  }

  return { method: 'none', message: 'Copy the link below.' }
}
