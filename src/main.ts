import { mount } from 'svelte'

import App from './App.svelte'
import './app.css'
import { creatorRequest } from './core/creator-route'

/**
 * Which app to mount: the visitor's, or the hidden creator's.
 *
 * The choice is a fragment in the address bar and nothing else, so the visitor's
 * page has no button, no link and no word pointing at the creator. The creator's
 * chunk - the geocoder included - is only ever requested from below, so a visitor
 * does not merely fail to reach the mode, they never download it.
 */

const target = document.getElementById('app')
if (target === null) {
  throw new Error('The page has no #app element to mount into.')
}

const request = creatorRequest(window.location.hash)

if (request === undefined) {
  mount(App, { target })
} else {
  const { default: Creator } = await import('./creator/Creator.svelte')

  mount(Creator, { target, props: { siteId: request.siteId } })
}
