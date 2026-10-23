import { describe, expect, it } from 'vitest'

import { creatorRequest } from './creator-route'
import { fragmentFor, linkFor, routeOf } from './route'

/**
 * The fragment grammar: the one place the address bar's `#` is read.
 *
 * Two hidden things now arrive by fragment - the creator mode and a shared
 * artifact - and nothing else may, so the routes have to be told apart by their
 * first word and by nothing looser. A visitor must never land in the creator by
 * accident, and a shared link must never be read as one.
 */

describe('what a fragment asks for', () => {
  it('opens the creator, with or without a Site to correct', () => {
    expect(routeOf('#create')).toStrictEqual({ kind: 'creator', siteId: undefined })
    expect(routeOf('#create/cupertino-sample')).toStrictEqual({
      kind: 'creator',
      siteId: 'cupertino-sample',
    })
  })

  it('carries a shared Layout as its payload', () => {
    expect(routeOf('#layout/AbC_-123')).toStrictEqual({
      kind: 'shared',
      artifact: 'layout',
      payload: 'AbC_-123',
    })
  })

  it('carries a shared Collection the same way', () => {
    expect(routeOf('#collection/AbC_-123')).toStrictEqual({
      kind: 'shared',
      artifact: 'collection',
      payload: 'AbC_-123',
    })
  })

  it('means nothing at all for an empty fragment, a word it does not know, or a route with no payload', () => {
    expect(routeOf('')).toBeUndefined()
    expect(routeOf('#')).toBeUndefined()
    expect(routeOf('#nonsense')).toBeUndefined()
    expect(routeOf('#layout')).toBeUndefined()
    expect(routeOf('#layout/')).toBeUndefined()
    expect(routeOf('#collection')).toBeUndefined()
    expect(routeOf('#cupertino-sample')).toBeUndefined()
  })

  it('cannot be made to open the creator with a word that merely starts the same', () => {
    expect(routeOf('#create-a-site')).toBeUndefined()
    expect(routeOf('#creates')).toBeUndefined()
    expect(routeOf('#/create')).toBeUndefined()
    expect(routeOf('#CREATe')).toBeUndefined()
  })

  it('gives the creator and a shared link the same answer as the creator route does on its own', () => {
    // The grammar delegates rather than restates, so the two can never disagree
    // about what `#create` means.
    for (const hash of ['#create', '#create/x', '#create/', '#create/a/b']) {
      expect(routeOf(hash)).toStrictEqual(
        creatorRequest(hash) === undefined
          ? undefined
          : { kind: 'creator', siteId: creatorRequest(hash)?.siteId },
      )
    }
  })
})

describe('the text of a link', () => {
  it('is a route and its payload, after the hash', () => {
    expect(fragmentFor('layout', 'AbC_-123')).toBe('#layout/AbC_-123')
    expect(fragmentFor('collection', 'AbC_-123')).toBe('#collection/AbC_-123')
  })

  it('wears whatever base it is given, so the deployment and a laptop both work', () => {
    expect(linkFor('https://www.shroop.net/lotplanner/', 'layout', 'AbC')).toBe(
      'https://www.shroop.net/lotplanner/#layout/AbC',
    )
    expect(linkFor('http://localhost:4213/lotplanner/', 'layout', 'AbC')).toBe(
      'http://localhost:4213/lotplanner/#layout/AbC',
    )
  })

  it('round-trips through the grammar it writes', () => {
    const link = linkFor('https://example.test/app/', 'collection', 'AbC_-123')

    expect(routeOf(link.slice(link.indexOf('#')))).toStrictEqual({
      kind: 'shared',
      artifact: 'collection',
      payload: 'AbC_-123',
    })
  })
})
