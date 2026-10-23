import { defineConfig, devices } from '@playwright/test'

const PORT = process.env['PORT'] ?? '4173'
const ORIGIN = `http://127.0.0.1:${PORT}`

/**
 * The port and the base path are duplicated from `vite.config.ts` on purpose:
 * this file must not import the app's build config, and the duplication is
 * pinned by the fact that the suite fails loudly if they disagree.
 *
 * The port can be moved with `PORT=…`, because more than one checkout of this
 * repository is often being tested at once. That matters more than it looks:
 * `reuseExistingServer` below is on outside CI, so two suites sharing a port do
 * not collide loudly - the second one quietly tests the first one's build.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `${ORIGIN}/lotplanner/`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      // `hasTouch` because the interaction is the riskiest surface in this app
      // and a pure core cannot test a gesture, so this seam exists to drive
      // real touch events rather than mouse ones.
      use: { ...devices['Desktop Chrome'], hasTouch: true },
    },
  ],
  webServer: {
    // `npm` rather than `yarn` purely because npm ships with Node and is
    // therefore always on PATH, while Yarn is only the project's installer.
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `${ORIGIN}/lotplanner/`,
    reuseExistingServer: !process.env['CI'],
    stdout: 'pipe',
  },
})
