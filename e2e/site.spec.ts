import { expect, test, type Page } from '@playwright/test'

/**
 * The fixture Site is the one in the manifest: a 137 m by 98 m frame at
 * rotation 90, on an origin at latitude 37.32.
 *
 * Both extents below are derived by hand from that frame and the 150 m context
 * margin, so this suite fails if either changes - which is the point, because
 * both are product decisions rather than incidental numbers.
 */
const LATITUDE = 37.32
// At rotation 90 the frame's 137 m length runs east-west, so it sets the width.
const EXTENT_WIDTH_METRES = 137 + 150 + 150
const EXTENT_HEIGHT_METRES = 98 + 150 + 150

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

/** Never touch USGS: both the picture and the service's metadata are faked. */
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

  // Worked out from the published web mercator constant rather than from the
  // app, so this cannot agree with the app by construction.
  const zoom = Number(await page.getByTestId('map').getAttribute('data-zoom'))
  const metresPerPixel =
    ((2 * Math.PI * 6378137) / (256 * 2 ** zoom)) * Math.cos((LATITUDE * Math.PI) / 180)

  const box = await overlay.boundingBox()
  expect(box).not.toBeNull()

  // Within a pixel or two of the ground it claims to cover, on both axes. A
  // stretched or mis-scaled picture would miss by much more than that.
  expect(Math.abs((box?.width ?? 0) - EXTENT_WIDTH_METRES / metresPerPixel)).toBeLessThan(2)
  expect(Math.abs((box?.height ?? 0) - EXTENT_HEIGHT_METRES / metresPerPixel)).toBeLessThan(2)

  await expect(page.getByText(ATTRIBUTION)).toBeVisible()
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
  // being drawn rather than anything in memory.
  await page.reload()
  await page.getByRole('button', { name: 'Cupertino sample' }).click()
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  expect(pictureRequests).toEqual([])
})
