/**
 * A colour as it is written.
 *
 * Inside the app a colour is one 24-bit integer, because that is the form that
 * travels and compares. Everywhere a person meets it, it is a hex string: in a
 * vehicle someone typed, and in the style sheet that draws it.
 *
 * Both directions live here because they are the same vocabulary. A colour read
 * as `#3b82f6` is written back as `#3b82f6`, and that round trip is the property
 * that has to hold - which is why this is in the core, where it can be tested,
 * rather than beside whichever component happens to want it.
 */

const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const SIX_DIGIT_HEX = /^(?:#|0x)([0-9a-f]{6})$/i

/** A 24-bit integer, from any of the shapes a colour is written in. */
export function parseColour(raw: string | number): number {
  if (typeof raw === 'number') {
    // Already a colour. This is the shape an edit round-trips through, and it
    // still has to be a colour: a 25th bit is a mistake rather than a colour.
    if (!Number.isInteger(raw) || raw < 0 || raw > 0xffffff) {
      throw new Error(`${String(raw)} is not a colour.`)
    }

    return raw
  }

  const text = raw.trim().toLowerCase()

  const short = SHORT_HEX.exec(text)
  if (short !== null) {
    // #abc means #aabbcc, not #0a0b0c.
    const digits = short
      .slice(1)
      .map((digit) => digit + digit)
      .join('')

    return Number.parseInt(digits, 16)
  }

  const long = SIX_DIGIT_HEX.exec(text)
  if (long !== null) {
    // All six digits, not the first pair: a colour is one number.
    return Number.parseInt(long[1] ?? '', 16)
  }

  throw new Error(`A colour is #rgb, #rrggbb, 0xRRGGBB or a whole number, not ${raw}.`)
}

/** That integer as a browser understands it, which is how a vehicle is drawn. */
export function cssColour(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`
}
