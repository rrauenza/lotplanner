/**
 * A picture the browser can draw, and the one way to give it back.
 *
 * The map takes an object url, which is made from the blob the fetch returned
 * and has to be revoked or the blob is held for the life of the page. The
 * visitor's page and the creator's show a picture the same way, so the pairing
 * of `createObjectURL` and `revokeObjectURL` is made once, here. Releasing is
 * safe to ask for twice, or after the picture has already gone.
 */

export interface ShownPicture {
  /** The object url to hand to the map. */
  readonly url: string
  /** Give the blob back. Safe to call more than once. */
  release(): void
}

export function showPicture(image: Blob): ShownPicture {
  const url = URL.createObjectURL(image)
  let released = false

  return {
    url,
    release() {
      if (!released) {
        released = true
        URL.revokeObjectURL(url)
      }
    },
  }
}
