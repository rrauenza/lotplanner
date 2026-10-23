import { mount } from 'svelte'

import App from './App.svelte'
import './app.css'
import { browserCompressor } from './browser/compression'
import { arrivalFrom } from './core/arrival'

/**
 * Which app to mount, and with what.
 *
 * What the address bar asked for is decided entirely in the core, so the only
 * thing left here is the mounting. The creator's chunk - the geocoder included -
 * is still imported below and nowhere else, so a visitor does not merely fail to
 * reach the mode, they never download it.
 *
 * The reader is given the shell's own id maker: a Placement needs an identity on
 * this side, and the core deliberately has no randomness to invent one with.
 */

const target = document.getElementById('app')
if (target === null) {
  throw new Error('The page has no #app element to mount into.')
}

/**
 * A fragment pasted into an address bar whose page is already open is a
 * same-document navigation: the browser changes the fragment and fires this,
 * without ever loading the page again. Reloading is the whole of the answer, and
 * a deliberate one - nothing inside this app writes to the address bar - so
 * a shared link opens whether it is the first thing a tab sees or the last.
 */
window.addEventListener('hashchange', () => {
  window.location.reload()
})

const arrival = await arrivalFrom(window.location.hash, browserCompressor, {
  newId: () => crypto.randomUUID(),
})

if (arrival.kind === 'creator') {
  const { default: Creator } = await import('./creator/Creator.svelte')

  mount(Creator, { target, props: { siteId: arrival.siteId } })
} else {
  mount(App, { target, props: { arrival } })
}
