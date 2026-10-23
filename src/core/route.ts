import { creatorRequest } from './creator-route'

/**
 * The fragment grammar: the one place the address bar's `#` is read.
 *
 * A fragment is the one kind of address a server never sees, which is why both
 * hidden things here arrive by one - the creator mode needs no route on GitHub
 * Pages, and a shared artifact is never uploaded to be shared. There are exactly
 * two shapes:
 *
 *     #<route>               the creator, told which Site if it says
 *     #<route>/<payload>     a whole artifact, spelled by the codec and link
 *
 * The first word is the route and decides everything. `create` is the creator's
 * (ADR 0006); `layout` and `collection` carry an artifact. A word this app does
 * not know means nothing at all, so the visitor's page is what a mistyped or
 * foreign fragment lands on - never the creator, which would be the one accident
 * worth avoiding. The payload cannot collide with a route word because it is
 * always on the far side of a slash, and a payload is unpadded base64url, which
 * never contains one.
 */

export type ArtifactKind = 'layout' | 'collection'

/** What the address bar asked for. */
export type Route =
  | { readonly kind: 'creator'; readonly siteId: string | undefined }
  | { readonly kind: 'shared'; readonly artifact: ArtifactKind; readonly payload: string }

export const LAYOUT_ROUTE: ArtifactKind = 'layout'
export const COLLECTION_ROUTE: ArtifactKind = 'collection'

/** What a fragment means, or nothing at all when it means nothing to this app. */
export function routeOf(hash: string): Route | undefined {
  // The creator's own reading is the authority on `#create`, so the two parsers
  // cannot drift apart about it.
  const creator = creatorRequest(hash)

  if (creator !== undefined) {
    return { kind: 'creator', siteId: creator.siteId }
  }

  const [word, ...rest] = withoutHash(hash).split('/')

  if (word !== LAYOUT_ROUTE && word !== COLLECTION_ROUTE) {
    return undefined
  }

  // Base64url never contains a slash, so a payload that does is not one. Passing
  // it on rather than rejecting it here keeps the refusal in one place.
  const payload = rest.join('/')

  return payload === '' ? undefined : { kind: 'shared', artifact: word, payload }
}

/** What comes after the `#`, on whether or not there was one. */
export function fragmentFor(artifact: ArtifactKind, payload: string): string {
  return `#${artifact}/${payload}`
}

/** The whole address to send: where the app is served from, and the fragment that carries it. */
export function linkFor(base: string, artifact: ArtifactKind, payload: string): string {
  return `${base}${fragmentFor(artifact, payload)}`
}

function withoutHash(hash: string): string {
  return hash.startsWith('#') ? hash.slice(1) : hash
}
