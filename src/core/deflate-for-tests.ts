import type { Compressor } from './link'

/**
 * A Compressor for the unit tests, and only for them.
 *
 * It is the browser's own `CompressionStream('deflate-raw')` - the very API the
 * app uses in `src/browser/compression.ts` - deliberately, so the size a link is
 * measured at is the size the app produces rather than a second algorithm's
 * opinion of it. Node has the stream and the platform's Blob and Response, so
 * the core tests can borrow it without the core knowing it exists.
 *
 * Nothing the app ships imports this; it is included in the build only because
 * the whole of `src` is, and tree-shaking drops it.
 */
export const testCompressor: Compressor = {
  async deflate(text: string): Promise<Uint8Array> {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))

    return new Uint8Array(await new Response(stream).arrayBuffer())
  },

  async inflate(bytes: Uint8Array): Promise<string> {
    const stream = new Blob([new Uint8Array(bytes)])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))

    return new Response(stream).text()
  },
}
