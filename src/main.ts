import { mount } from 'svelte'

import App from './App.svelte'
import './app.css'

const target = document.getElementById('app')
if (target === null) {
  throw new Error('The page has no #app element to mount into.')
}

mount(App, { target })
