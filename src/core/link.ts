import {
  decodeArtifact,
  encodeArtifact,
  UNREADABLE,
  type Artifact,
  type Decoded,
  type Reading,
} from './codec'

/**
 * The link's own half of sharing: squashing an artifact small and spelling the
 * result as characters a URL can hold.
 *
 * The split is the spec's: a Layout or a Collection is compact JSON (codec.ts),
 * that payload is compressed with `deflate-raw`, and the compressed bytes are
 * unpadded base64url. Compression is the one part that is not pure - the app is
 * required to use the browser's own `CompressionStream('deflate-raw')`, both
 * because a bundled deflate would be a second implementation of a solved problem
 * and because the browser's is already there - so it enters as an effect, exactly
 * as storage does. What is left here is arithmetic, and it is tested.
 */

/**
 * Raw deflate and back, as an effect.
 *
 * `deflate-raw` rather than `gzip` or `zlib` because a link is not a file and
 * the framing bytes of the other two would be paid for on every share.
 */
export interface Compressor {
  deflate(text: string): Promise<Uint8Array>
  /** Back to the text that was deflated; throws if the bytes are not deflate output. */
  inflate(bytes: Uint8Array): Promise<string>
}

/**
 * The URL-safe base64 alphabet, unpadded.
 *
 * `+` and `/` are swapped for `-` and `_` because a fragment may not need
 * escaping, and `=` is dropped because its only job is to pad a length that the
 * reader can already work out.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** An artifact as a link payload: the base64, without the route or the URL. */
export async function encodePayload(artifact: Artifact, compressor: Compressor): Promise<string> {
  return toBase64Url(await compressor.deflate(encodeArtifact(artifact)))
}

/** The artifact a link payload holds, or why it could not be read. */
export async function decodePayload(
  payload: string,
  compressor: Compressor,
  reading?: Reading,
): Promise<Decoded> {
  const bytes = fromBase64Url(payload)

  if (bytes === undefined) {
    return { kind: 'unreadable', message: UNREADABLE }
  }

  let text: string

  try {
    text = await compressor.inflate(bytes)
  } catch {
    // Bytes that are not deflate output are a broken link, not a broken app.
    return { kind: 'unreadable', message: UNREADABLE }
  }

  return decodeArtifact(text, reading)
}

/** The bytes as unpadded base64url. */
export function toBase64Url(bytes: Uint8Array): string {
  let encoded = ''

  for (let at = 0; at < bytes.length; at += 3) {
    const first = bytes[at] ?? 0
    const second = bytes[at + 1]
    const third = bytes[at + 2]

    encoded += ALPHABET.charAt(first >> 2)
    encoded += ALPHABET.charAt(((first & 0b11) << 4) | ((second ?? 0) >> 4))

    if (second === undefined) {
      break
    }

    encoded += ALPHABET.charAt(((second & 0b1111) << 2) | ((third ?? 0) >> 6))

    if (third === undefined) {
      break
    }

    encoded += ALPHABET.charAt(third & 0b111111)
  }

  return encoded
}

/**
 * Unpadded base64url back to bytes, or nothing when the text is not that.
 *
 * A length of one more than a multiple of four cannot be whole bytes - the
 * leftover six bits are not enough - so it is refused rather than rounded, and
 * the caller reports a broken link instead of reading one that was never there.
 */
export function fromBase64Url(text: string): Uint8Array | undefined {
  if (text.length % 4 === 1) {
    return undefined
  }

  const bytes: number[] = []
  let buffer = 0
  let bits = 0

  for (const character of text) {
    const value = ALPHABET.indexOf(character)

    if (value < 0) {
      return undefined
    }

    buffer = (buffer << 6) | value
    bits += 6

    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }

  return Uint8Array.from(bytes)
}
