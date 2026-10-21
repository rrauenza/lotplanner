import { expect, test } from '@playwright/test'

/**
 * This asks for the subpath explicitly rather than for `/`, and then checks the
 * pathname it landed on. Both halves matter: `vite preview` answers `/` with a
 * redirect to the base, so a test that navigated to the root would pass even if
 * the base were wrong, and its own assertion would be worthless.
 */
test('serves the built app from its repository subpath', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  const response = await page.goto('./')

  expect(response?.status()).toBe(200)
  expect(new URL(page.url()).pathname).toBe('/lotplanner/')
  await expect(page.getByRole('heading', { level: 1, name: 'Lot Planner' })).toBeVisible()
  expect(pageErrors).toEqual([])
})
