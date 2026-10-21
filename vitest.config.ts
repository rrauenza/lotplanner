import { defineConfig } from 'vitest/config'

/** Unit tests over the pure core. No DOM, no network, no storage, no clock. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
