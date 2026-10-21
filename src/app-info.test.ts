import { describe, expect, it } from 'vitest'

import { APP_TAGLINE, APP_TITLE } from './app-info'

/**
 * This is a wiring test, not a behavioural one, and it does not pretend
 * otherwise: the ticket that added it carries no domain logic, so all it can
 * honestly show is that the unit runner is connected and that the identity the
 * end-to-end test asserts is the identity the app renders.
 *
 * Behavioural tests start with the pure core, and assert what goes in and what
 * comes out rather than how it is arranged inside.
 */
describe('app identity', () => {
  it('names the app and says what it is for', () => {
    expect(APP_TITLE).toBe('Lot Planner')
    expect(APP_TAGLINE).toContain('true scale')
  })
})
