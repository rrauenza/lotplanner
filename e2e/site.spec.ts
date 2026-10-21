import { expect, test, type Page } from '@playwright/test'

/**
 * The fixture Site is the one in the manifest: a 137 m by 98 m frame at
 * rotation 90, on an origin at latitude 37.32.
 *
 * The ground sizes below are derived by hand from that frame and the 150 m
 * context margin, so this suite fails if either changes - which is the point,
 * because both are product decisions rather than incidental numbers.
 *
 * At rotation 90 the frame's 137 m length runs east-west, so it sets the width
 * of the extent: 437 m across, 398 m down.
 */

const FRAME_ALONG_EAST_METRES = 137
const FRAME_ALONG_NORTH_METRES = 98
const EXTENT_WIDTH_METRES = 437
const EXTENT_HEIGHT_METRES = 398

const ATTRIBUTION = 'USGS, USDA, The National Map: Orthoimagery. January 09, 2025.'

/** One pixel is enough: Leaflet sizes the overlay from the bounds, not the file. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)

interface ImageryOptions {
  /** Answer the picture request with this status instead of a picture. */
  readonly imageStatus?: number
  /** How long the picture request takes, so the loading state can be seen. */
  readonly delayMs?: number
}

/** Never touch USGS: both the picture and the service metadata are faked. */
async function serveImagery(page: Page, options: ImageryOptions = {}): Promise<string[]> {
  const pictureRequests: string[] = []

  await page.route('**/ImageServer?f=json', (route) =>
    route.fulfill({ json: { copyrightText: ATTRIBUTION } }),
  )

  await page.route('**/ImageServer/exportImage*', async (route) => {
    pictureRequests.push(route.request().url())

    if (options.delayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    }
    if (options.imageStatus !== undefined && options.imageStatus !== 200) {
      await route.fulfill({ status: options.imageStatus, body: 'no' })
      return
    }
    await route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
  })

  return pictureRequests
}

async function openTheSite(page: Page): Promise<void> {
  await page.goto('./')
  await page.getByRole('button', { name: 'Cupertino sample' }).click()
}

test('draws the photograph at true scale, and credits it', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)

  const overlay = page.locator('img.leaflet-image-layer')
  await expect(overlay).toBeVisible()

  // Leaflet's own rendering is deliberately not under test, so the scale is
  // taken from the frame the app drew rather than from a zoom level or from the
  // app recalculating anything. This measures the app's geometry against the
  // picture it asked for, which is the claim that matters: a rectangle laid over
  // this picture is the size of what is already in it.
  const guide = await page.evaluate(() => {
    const path = document.querySelector('.leaflet-overlay-pane svg path')
    if (!(path instanceof SVGGraphicsElement)) {
      return null
    }
    const box = path.getBBox()
    return { width: box.width, height: box.height }
  })

  expect(guide).not.toBeNull()

  const pixelsPerMetre = (guide?.width ?? 0) / FRAME_ALONG_EAST_METRES
  expect(pixelsPerMetre).toBeGreaterThan(0)

  // The frame's other axis has to agree, or the frame is not square to itself.
  expect(Math.abs((guide?.height ?? 0) - FRAME_ALONG_NORTH_METRES * pixelsPerMetre)).toBeLessThan(2)

  const box = await overlay.boundingBox()
  expect(box).not.toBeNull()

  // A few pixels of slack: the extent is grown by under a pixel so that the
  // requested bbox and the requested pixel size have exactly the same shape.
  expect(Math.abs((box?.width ?? 0) - EXTENT_WIDTH_METRES * pixelsPerMetre)).toBeLessThan(3)
  expect(Math.abs((box?.height ?? 0) - EXTENT_HEIGHT_METRES * pixelsPerMetre)).toBeLessThan(3)

  await expect(page.getByText(ATTRIBUTION)).toBeVisible()
})

test('lists the vehicles that ship with the app, with their real sizes', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)

  const palette = page.getByRole('complementary', { name: 'Vehicles' })

  await expect(palette.getByText('Semi + 53 ft trailer')).toBeVisible()
  // 840 inches is 70 feet and 102 is 8 foot 6, read back the way they were
  // published rather than as a number of inches.
  await expect(palette.getByText(`70'0" x 8'6"`)).toBeVisible()
})

test('gives the photograph the whole width', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // A guard against a stylesheet capping the map. A leftover global max-width
  // once held it to 608 px of a 1000 px viewport, and nothing else in this
  // suite could see it, because the component's own rule looked complete.
  const map = await page.locator('.leaflet-container').boundingBox()
  const viewport = page.viewportSize()

  expect(map).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect((map?.width ?? 0) / (viewport?.width ?? 1)).toBeGreaterThan(0.9)
})

test('says it is fetching, because the first fetch is slow', async ({ page }) => {
  await serveImagery(page, { delayMs: 700 })
  await openTheSite(page)

  await expect(page.getByRole('status')).toHaveText(/Fetching the photograph/)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()
})

test('says plainly when the photograph cannot be fetched', async ({ page }) => {
  await serveImagery(page, { imageStatus: 502 })
  await openTheSite(page)

  await expect(page.getByRole('alert')).toHaveText(/could not be fetched/)
})

test('opens again with no network request at all', async ({ page }) => {
  const pictureRequests = await serveImagery(page)

  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()
  expect(pictureRequests).toHaveLength(1)

  pictureRequests.length = 0

  // A fresh page load, same browser, so this proves the stored copy is what is
  // being drawn rather than anything held in memory.
  await page.reload()
  await page.getByRole('button', { name: 'Cupertino sample' }).click()
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  expect(pictureRequests).toEqual([])
})
