import { expect, test } from '@playwright/test'

import {
  ATTRIBUTION,
  middleOf,
  openTheSite,
  serveGeocoder,
  serveImagery,
  serveTiles,
  touchDrag,
  turnHandle,
} from './harness.js'

/**
 * The hidden creator mode end to end: find a place, confirm it on the coarse
 * tiles, draw and turn its rectangle over the one sharp image, and read the
 * manifest entry out.
 *
 * The geocoder, the tiles and the imagery are all intercepted or served from one
 * pixel, so no test calls a real service and none of them waits the 15-22 seconds
 * a real photograph costs. What is left under test is the flow itself, and the
 * promise the mode makes: a visitor cannot reach it, and a place reopened from
 * the manifest warms the exact picture its visitors will use.
 */

/** A place as Nominatim answers: positions in strings, an address for the label. */
const FOUND = [
  {
    lat: '37.3318',
    lon: '-122.0312',
    name: 'Vallco lot',
    display_name: 'Vallco lot, 10123 N Wolfe Rd, Cupertino, California, United States',
  },
  {
    lat: '37.32',
    lon: '-122.03',
    display_name: '1 Infinite Loop, Cupertino, California, United States',
  },
]

test('adds a place: find it, confirm it, draw it, turn it, emit it', async ({ page }) => {
  const queries = await serveGeocoder(page, FOUND)
  await serveTiles(page)
  const pictures = await serveImagery(page, { delayMs: 400 })

  await page.goto('./#create')

  await expect(page.getByRole('heading', { name: /creator/i })).toBeVisible()

  // Find the place by address.
  await page.getByLabel('Address').fill('Vallco')
  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('button', { name: /Vallco lot/ }).click()

  // Confirm it on the coarse tiles, then take the one long fetch.
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await page.getByRole('button', { name: 'Fetch the photograph' }).click()
  await expect(page.getByRole('status')).toHaveText(/Fetching the photograph/)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()
  await expect(page.getByText(ATTRIBUTION)).toBeVisible()

  // Exactly one picture, fetched once for the whole session, and it is not
  // refetched while the rectangle is adjusted below.
  expect(pictures).toHaveLength(1)

  // Draw the rectangle over the space.
  const map = await page.locator('.leaflet-container').boundingBox()
  expect(map).not.toBeNull()

  const centre = middleOf(map ?? { x: 0, y: 0, width: 0, height: 0 })
  await touchDrag(
    page,
    { x: centre.x - 90, y: centre.y - 50 },
    { x: centre.x + 90, y: centre.y + 50 },
  )

  const drawn = page.locator('path.frame-sketch')
  await expect(drawn).toHaveCount(1)
  expect(pictures).toHaveLength(1)

  // Turn it to match the space, on the handle rather than with a second gesture.
  const box = await drawn.boundingBox()
  const middle = middleOf(box ?? { x: 0, y: 0, width: 0, height: 0 })
  await turnHandle(page, '.frame-turn', middle, 60)
  expect(pictures).toHaveLength(1)

  // The entry comes out as the text to paste, carrying the place as the origin.
  const text = await page.getByRole('textbox', { name: 'Manifest entry' }).inputValue()
  expect(text).toContain("id: 'vallco-lot',")
  expect(text).toContain("name: 'Vallco lot',")
  expect(text).toContain('origin: { latitude: 37.3318, longitude: -122.0312 },')
  expect(text).toContain('frame: {')
  expect(text).toContain('lengthMetres:')
  expect(text).toContain('rotationDegrees:')

  const turned = Number(/rotationDegrees: (-?[\d.]+),/.exec(text)?.[1] ?? '0')
  expect(Math.abs(turned - 60)).toBeLessThan(2)

  // The geocoder was asked once, by the creator, for what was typed.
  expect(queries).toHaveLength(1)
  expect(queries[0]).toContain('q=Vallco')
})

test('reopens a place with its rectangle already drawn, and warms the visitor picture', async ({
  page,
}) => {
  const queries = await serveGeocoder(page, FOUND)
  await serveTiles(page)
  const pictures = await serveImagery(page)

  await page.goto('./#create/cupertino-sample')

  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()
  await expect(page.locator('path.frame-sketch')).toHaveCount(1)

  // The rectangle it was saved with, given back rather than redrawn.
  const text = await page.getByRole('textbox', { name: 'Manifest entry' }).inputValue()
  expect(text).toContain("id: 'cupertino-sample',")
  expect(text).toContain('lengthMetres: 137,')
  expect(text).toContain('widthMetres: 98,')
  expect(text).toContain('rotationDegrees: 90,')

  // No address was searched, so the geocoder was never touched.
  expect(queries).toEqual([])
  expect(pictures).toHaveLength(1)

  // The picture it fetched is the one a visitor wants: opening the same place in
  // the visitor app fetches nothing at all, because the url is already shared in
  // the cache both apps read.
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()
  expect(pictures).toHaveLength(1)
})

test('leaves a visitor no way into the creator', async ({ page }) => {
  const queries = await serveGeocoder(page, FOUND)
  const tiles = await serveTiles(page)
  await serveImagery(page)

  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))

  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // Nothing on the visitor's page names it, links to it or hints at it.
  await expect(page.getByLabel('Address')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /creator/i })).toHaveCount(0)
  expect(await page.locator('a[href*="#create"]').count()).toBe(0)

  // And its pieces were not even downloaded, let alone called.
  expect(queries).toEqual([])
  expect(tiles).toEqual([])
  expect(requested.filter((url) => /Creator/i.test(url))).toEqual([])
})
