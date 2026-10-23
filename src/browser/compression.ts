import type { Compressor } from '../core/link'

/**
 * `deflate-raw`, the browser's own.
 *
 * The spec names this compression outright, and it is deliberately not bundled:
 * a second deflate would be a second implementation of a solved problem, shipped
 * to every visitor, where the platform already has one that is faster and
 * smaller. The core decides *what* is compressed and *how* the bytes are spelled
 * as characters (link.ts); this adapter only moves the bytes.
 *
 * Deliberately untested, along with the other adapters. What is worth testing -
 * the compact spelling, the size it comes to and the round trip - is tested in
 * the core against this very API, so the figure the tests assert is the figure
 * the app produces.
 */
export const browserCompressor: Compressor = {
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
