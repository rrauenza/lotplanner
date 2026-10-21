import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

/**
 * GitHub Pages serves a project site from the repository's own subpath, so the
 * base is fixed rather than derived. Both the dev server and `vite preview`
 * honour it, which means local runs exercise the same shape as the deployment
 * instead of a domain root that only exists on a laptop.
 */
export default defineConfig({
  base: '/lotplanner/',
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2023',
  },
})
