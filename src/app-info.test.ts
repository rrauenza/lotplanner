import { describe, expect, it } from 'vitest'

import { APP_TAGLINE, APP_TITLE } from './app-info'

describe('app identity', () => {
  it('names the app and says what it is for', () => {
    expect(APP_TITLE).toBe('Lot Planner')
    expect(APP_TAGLINE).toContain('true scale')
  })
})
