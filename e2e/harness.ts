/*
 * The shared harness: the fixture Site, a faked imagery service, and the
 * gestures. Both suites need the same ground and the same touch events, and a
 * second copy of a touch gesture is a second thing to get wrong, so there is
 * one.
 */

import { expect, type Page } from '@playwright/test'

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

export const FRAME_ALONG_EAST_METRES = 137
export const FRAME_ALONG_NORTH_METRES = 98
export const EXTENT_WIDTH_METRES = 437
export const EXTENT_HEIGHT_METRES = 398

export const ATTRIBUTION = 'USGS, USDA, The National Map: Orthoimagery. January 09, 2025.'

/** One pixel is enough: Leaflet sizes the overlay from the bounds, not the file. */
export const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)

export interface ImageryOptions {
  /** Answer the picture request with this status instead of a picture. */
  readonly imageStatus?: number
  /** How long the picture request takes, so the loading state can be seen. */
  readonly delayMs?: number
}

/** Never touch USGS: both the picture and the service metadata are faked. */
export async function serveImagery(page: Page, options: ImageryOptions = {}): Promise<string[]> {
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

export async function openTheSite(page: Page): Promise<void> {
  await page.goto('./')
  await page.getByRole('button', { name: 'Cupertino sample' }).click()
}

/**
 * Never touch a geocoder: the creator mode is the only thing that asks one, and
 * a real request would spend a shared, rate-limited service on a test run. The
 * records are answered as they arrive, so the address the test types comes back
 * as a place the core can read.
 */
export async function serveGeocoder(page: Page, records: readonly unknown[]): Promise<string[]> {
  const queries: string[] = []

  await page.route('**/nominatim.openstreetmap.org/**', async (route) => {
    queries.push(route.request().url())
    await route.fulfill({ json: records })
  })

  return queries
}

/**
 * Never touch the tile server either. The coarse basemap is navigation only, and
 * one pixel stands in for every tile so the map can be built without a network.
 */
export async function serveTiles(page: Page): Promise<string[]> {
  const requests: string[] = []

  await page.route('**/basemap.nationalmap.gov/**', async (route) => {
    requests.push(route.request().url())
    await route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
  })

  return requests
}

/**
 * From here down, the vehicles themselves.
 *
 * The fixture Site is the reference again. Its frame is 137 m across, and at
 * this map size the app opens it at the imagery's own resolution, where one
 * screen pixel is 0.3 m of ground. That turns the numbers below into arithmetic
 * rather than guesses: a Semi is 21.336 m long, so about 71 px, and 2.5908 m
 * wide, so under 9 px. It is also why the labels in these tests are the short
 * ones - no name fits on nine pixels of anything.
 */

export interface Point {
  readonly x: number
  readonly y: number
}

/** How many pixels one metre of ground is drawn as, measured off the frame. */
export async function pixelsPerMetre(page: Page): Promise<number> {
  const guide = await page.evaluate(() => {
    const path = document.querySelector('path.frame-guide')
    if (!(path instanceof SVGGraphicsElement)) {
      return null
    }
    const box = path.getBBox()
    return { width: box.width, height: box.height }
  })

  expect(guide).not.toBeNull()

  return (guide?.width ?? 0) / FRAME_ALONG_EAST_METRES
}

/**
 * The size of a drawn shape in the pixels the map drew it in. `getBBox` measures
 * the geometry without the stroke, which is a different width on a selected
 * vehicle than on an unselected one, so this is the only way two of them compare.
 */
export async function drawnSize(
  page: Page,
  selector: string,
): Promise<{ width: number; height: number }> {
  const size = await page.evaluate((which: string) => {
    const path = document.querySelector(which)
    if (!(path instanceof SVGGraphicsElement)) {
      return null
    }
    const box = path.getBBox()
    return { width: box.width, height: box.height }
  }, selector)

  expect(size).not.toBeNull()

  return size ?? { width: 0, height: 0 }
}

export function middleOf(box: { x: number; y: number; width: number; height: number }): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** The size of every vehicle drawn, in the pixels the map drew them in. */
export async function drawnSizes(page: Page): Promise<{ width: number; height: number }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('path.placement')].flatMap((path) => {
      if (!(path instanceof SVGGraphicsElement)) {
        return []
      }
      const box = path.getBBox()
      return [{ width: box.width, height: box.height }]
    }),
  )
}

export async function middleOfTheMap(page: Page): Promise<Point> {
  const box = await page.locator('.leaflet-container').boundingBox()
  expect(box).not.toBeNull()

  return middleOf(box ?? { x: 0, y: 0, width: 0, height: 0 })
}

/** Take a vehicle off the palette by its chip, and let it go somewhere. */
export async function dragFromPalette(page: Page, name: RegExp, to: Point): Promise<void> {
  const chip = await page.getByRole('button', { name }).boundingBox()
  expect(chip).not.toBeNull()

  await touchDrag(page, middleOf(chip ?? { x: 0, y: 0, width: 0, height: 0 }), to)
}

/**
 * A drag of the kind a finger makes.
 *
 * Playwright's own touch support stops at tapping, so this drives Chromium's
 * touch input directly. It is the reason this project has a second seam at all:
 * the gesture model in ADR 0005 is the riskiest surface in the app, and none of
 * it is reachable from a pure core.
 */
export async function touchDrag(page: Page, from: Point, to: Point, steps = 8): Promise<void> {
  const cdp = await page.context().newCDPSession(page)

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y }],
  })

  for (let step = 1; step <= steps; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * step) / steps,
          y: from.y + ((to.y - from.y) * step) / steps,
        },
      ],
    })
  }

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

/** Take hold of a handle and turn it to a bearing, about a centre on the screen. */
export async function turnHandle(
  page: Page,
  selector: string,
  centre: Point,
  degrees: number,
): Promise<void> {
  const handle = await page.locator(selector).boundingBox()
  expect(handle).not.toBeNull()

  const grip = middleOf(handle ?? { x: 0, y: 0, width: 0, height: 0 })
  const reach = Math.hypot(grip.x - centre.x, grip.y - centre.y)
  const radians = (degrees * Math.PI) / 180

  await touchDrag(page, grip, {
    x: centre.x + reach * Math.sin(radians),
    y: centre.y - reach * Math.cos(radians),
  })
}

/** Take hold of the selected vehicle's handle and turn it to a bearing. */
export async function turnTo(page: Page, centre: Point, degrees: number): Promise<void> {
  await turnHandle(page, '.rotation-handle', centre, degrees)
}

/** The angle a vehicle's label is drawn at, which is its own angle turned back. */
export async function labelAngle(page: Page, index = 0): Promise<number> {
  const style = await page.locator('.placement-label').nth(index).getAttribute('style')
  const found = /rotate\((-?[\d.]+)deg\)/.exec(style ?? '')

  expect(found).not.toBeNull()

  return Number(found?.[1] ?? '0')
}
