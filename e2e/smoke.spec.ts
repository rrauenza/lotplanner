import { expect, test } from '@playwright/test'

/**
 * The base URL carries the repository subpath, so this passing at all proves the
 * production build is correct for the subpath rather than for a domain root:
 * if the base were wrong, the bundle would 404 and no heading would render.
 */
test('serves the built app from its repository subpath', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  const response = await page.goto('/')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: 'Lot Planner' })).toBeVisible()
  expect(pageErrors).toEqual([])
})
