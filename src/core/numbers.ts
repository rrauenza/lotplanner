/**
 * Whether a value that came from outside is a usable number.
 *
 * Storage, a link and a file all hand back `unknown`, and the domain needs the
 * same answer in each of them: a number that is finite, because one that is not
 * would draw nothing anywhere and could flow silently through a distance. One
 * copy rather than one in each reader, so they cannot drift about what counts.
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
