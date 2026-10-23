import { describe, expect, it } from 'vitest'

import { creatorRequest } from './creator-route'

describe('creatorRequest', () => {
  it('opens the creator with no Site to correct', () => {
    expect(creatorRequest('#create')).toStrictEqual({ siteId: undefined })
  })

  it('opens it on a Site already in the manifest', () => {
    expect(creatorRequest('#create/cupertino-sample')).toStrictEqual({ siteId: 'cupertino-sample' })
  })

  it('treats a trailing slash as no id rather than as an empty one', () => {
    expect(creatorRequest('#create/')).toStrictEqual({ siteId: undefined })
  })

  it('takes the first word as the id, since an id has no slash in it', () => {
    expect(creatorRequest('#create/cupertino-sample/extra')).toStrictEqual({
      siteId: 'cupertino-sample',
    })
  })

  it('means nothing for an empty fragment, another route, or a word that only starts the same', () => {
    expect(creatorRequest('')).toBeUndefined()
    expect(creatorRequest('#')).toBeUndefined()
    expect(creatorRequest('#create-a-site')).toBeUndefined()
    expect(creatorRequest('#cupertino-sample')).toBeUndefined()
    expect(creatorRequest('#/create')).toBeUndefined()
  })

  it('reads a fragment with no hash on it the same way, since the hash is passed in', () => {
    expect(creatorRequest('create')).toStrictEqual({ siteId: undefined })
  })
})
