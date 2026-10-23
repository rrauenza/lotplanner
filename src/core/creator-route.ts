/**
 * How the hidden creator mode is reached: a fragment in the address bar, and
 * nothing else.
 *
 * The mode has to exist in the deployed app, because it needs the same imagery
 * and the same coordinate maths as the visitor app (ADR 0006), but no visitor
 * may find it. A fragment is the one kind of address that is never sent to a
 * server, so it works on GitHub Pages with no server route and no rewrite rule,
 * and nothing in the visitor's page links to it, names it or hints at it: the
 * creator's code is not even downloaded until its fragment is present.
 *
 * It is hidden, not secret, and a static app cannot make it secret - there is no
 * server to check a key against, and the mode changes nothing on the server
 * anyway, since it emits text and writes nothing. What it must guarantee is that
 * nobody arrives by accident: a visitor would have to be told the address, and
 * typing it is the only way in.
 */

/** What the address bar asked for: the creator, and the Site to correct if any. */
export interface CreatorRequest {
  /** The id of the Site to reopen, or nothing to add a new one. */
  readonly siteId: string | undefined
}

/** The one word that opens the mode. Not a word the visitor app uses anywhere. */
const ROUTE = 'create'

/** What a fragment means, or nothing at all when it means nothing to this app. */
export function creatorRequest(hash: string): CreatorRequest | undefined {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash
  const [route, ...rest] = withoutHash.split('/')

  if (route !== ROUTE) {
    return undefined
  }

  // A Site id is a single word with no slash in it, so a fragment carrying more
  // than that is not an id and is treated as no id rather than as a broken one.
  const [siteId] = rest

  return { siteId: siteId === undefined || siteId === '' ? undefined : siteId }
}
