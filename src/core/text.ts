/**
 * Text as it is stored and compared.
 *
 * Control characters go first, or they survive as whitespace and turn one name
 * into two. Composing after decomposing is what the spec asks for and is simply
 * NFC, which is the form that compares equal. Trimming and collapsing runs of
 * whitespace come last, so that two names which read the same on screen are the
 * same value.
 *
 * Nothing here decides how long a piece of text may be, or whether it is allowed
 * to be empty. Those are rules about a particular kind of thing - a vehicle, a
 * saved Layout - and belong with the thing rather than here.
 */
export function tidy(raw: string): string {
  // eslint-disable-next-line no-control-regex -- removing them is the point
  const withoutControlCharacters = raw.replace(/[\u0000-\u001f\u007f]/g, '')

  return withoutControlCharacters.normalize('NFD').normalize('NFC').trim().replace(/\s+/g, ' ')
}
