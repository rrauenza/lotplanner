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
    const path = document.querySelector('path.frame-guide')
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

interface Point {
  readonly x: number
  readonly y: number
}

/** How many pixels one metre of ground is drawn as, measured off the frame. */
async function pixelsPerMetre(page: Page): Promise<number> {
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
async function drawnSize(page: Page, selector: string): Promise<{ width: number; height: number }> {
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

function middleOf(box: { x: number; y: number; width: number; height: number }): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** The size of every vehicle drawn, in the pixels the map drew them in. */
async function drawnSizes(page: Page): Promise<{ width: number; height: number }[]> {
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

async function middleOfTheMap(page: Page): Promise<Point> {
  const box = await page.locator('.leaflet-container').boundingBox()
  expect(box).not.toBeNull()

  return middleOf(box ?? { x: 0, y: 0, width: 0, height: 0 })
}

/** Take a vehicle off the palette by its chip, and let it go somewhere. */
async function dragFromPalette(page: Page, name: RegExp, to: Point): Promise<void> {
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
async function touchDrag(page: Page, from: Point, to: Point, steps = 8): Promise<void> {
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

/** Take hold of the selected vehicle's handle and turn it to a bearing. */
async function turnTo(page: Page, centre: Point, degrees: number): Promise<void> {
  const handle = await page.locator('.rotation-handle').boundingBox()
  expect(handle).not.toBeNull()

  const grip = middleOf(handle ?? { x: 0, y: 0, width: 0, height: 0 })
  const reach = Math.hypot(grip.x - centre.x, grip.y - centre.y)
  const radians = (degrees * Math.PI) / 180

  await touchDrag(page, grip, {
    x: centre.x + reach * Math.sin(radians),
    y: centre.y - reach * Math.cos(radians),
  })
}

/** The angle a vehicle's label is drawn at, which is its own angle turned back. */
async function labelAngle(page: Page, index = 0): Promise<number> {
  const style = await page.locator('.placement-label').nth(index).getAttribute('style')
  const found = /rotate\((-?[\d.]+)deg\)/.exec(style ?? '')

  expect(found).not.toBeNull()

  return Number(found?.[1] ?? '0')
}

test('drops a vehicle where it is let go, at the size it publishes', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drop = await middleOfTheMap(page)
  await dragFromPalette(page, /Semi \+ 53 ft/, drop)

  const drawn = page.locator('path.placement')
  await expect(drawn).toHaveCount(1)

  // It landed where it was let go, judged by the middle of what was drawn.
  const placed = await drawn.boundingBox()
  expect(placed).not.toBeNull()

  const landed = middleOf(placed ?? { x: 0, y: 0, width: 0, height: 0 })
  expect(Math.abs(landed.x - drop.x)).toBeLessThan(2)
  expect(Math.abs(landed.y - drop.y)).toBeLessThan(2)

  // And it is a Semi with a 53 foot trailer: 840 by 102 inches, which is 21.336
  // by 2.5908 m, drawn against the same pixels per metre as the frame. That is
  // the app's geometry against the picture it asked for, which is the claim
  // that matters here - the rectangle is the size of what is already in it.
  const scale = await pixelsPerMetre(page)
  const size = await drawnSize(page, 'path.placement')

  expect(Math.abs(size.width - 21.336 * scale)).toBeLessThan(2)
  expect(Math.abs(size.height - 2.5908 * scale)).toBeLessThan(2)

  // It arrives selected, because it is what the visitor just put there.
  await expect(page.locator('path.placement.selected')).toHaveCount(1)
})

test('names a vehicle, and lets one be put outside the Site Frame', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const frame = await page.locator('path.frame-guide').boundingBox()
  expect(frame).not.toBeNull()

  // Well outside the frame and still on the picture. The frame is a guide and
  // nothing refuses a vehicle that overhangs it.
  const frameMiddle = middleOf(frame ?? { x: 0, y: 0, width: 0, height: 0 })
  const outside: Point = { x: frameMiddle.x - 80, y: frameMiddle.y }

  await dragFromPalette(page, /Semi \+ 53 ft/, outside)

  const drawn = page.locator('path.placement')
  await expect(drawn).toHaveCount(1)

  const placed = middleOf((await drawn.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 })
  expect(Math.abs(placed.x - outside.x)).toBeLessThan(2)

  // Nine pixels across is not where a name goes, so the short label stands in
  // for it - and the frame lies at rotation 90, which a new vehicle takes as its
  // own, so the text runs across the screen rather than up it.
  const label = page.locator('.placement-label')
  await expect(label).toHaveText('Semi')
  await expect(label).toHaveAttribute('style', /rotate\(0deg\)/)
})

test('moves the vehicle it is dragged from, and pans from anywhere else', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drop = await middleOfTheMap(page)
  await dragFromPalette(page, /Semi \+ 53 ft/, drop)

  const drawn = page.locator('path.placement')
  const guide = page.locator('path.frame-guide')
  await expect(drawn).toHaveCount(1)

  const before = (await drawn.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }
  const grab = middleOf(before)

  // Tapping empty space lets it go; tapping the vehicle picks it up again, and
  // a tap is a real touch rather than a mouse click.
  await page.touchscreen.tap(drop.x + 160, drop.y + 60)
  await expect(page.locator('path.placement.selected')).toHaveCount(0)

  await page.touchscreen.tap(grab.x, grab.y)
  await expect(page.locator('path.placement.selected')).toHaveCount(1)

  // A drag beginning on the vehicle moves the vehicle, by finger.
  await touchDrag(page, grab, { x: grab.x + 140, y: grab.y - 70 }, 10)

  const moved = (await drawn.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }
  expect(Math.abs(moved.x - before.x - 140)).toBeLessThan(2)
  expect(Math.abs(moved.y - before.y + 70)).toBeLessThan(2)

  // A drag beginning anywhere else pans the picture, and takes every vehicle
  // with it: the two move by the same amount, because the vehicle has not moved
  // over the ground at all.
  const vehicleBefore = middleOf(moved)
  const frameBefore = middleOf((await guide.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 })

  await touchDrag(
    page,
    { x: drop.x + 220, y: drop.y + 70 },
    { x: drop.x + 120, y: drop.y + 130 },
    10,
  )

  const vehicleAfter = middleOf((await drawn.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 })
  const frameAfter = middleOf((await guide.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 })

  // The picture really did move, so the assertion below is not about two things
  // staying still together.
  expect(Math.abs(frameAfter.x - frameBefore.x)).toBeGreaterThan(20)
  expect(Math.abs(vehicleAfter.x - vehicleBefore.x - (frameAfter.x - frameBefore.x))).toBeLessThan(
    1,
  )
  expect(Math.abs(vehicleAfter.y - vehicleBefore.y - (frameAfter.y - frameBefore.y))).toBeLessThan(
    1,
  )
})

test('corrects a vehicle, and every copy of it at once', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const map = await middleOfTheMap(page)
  const first = { x: map.x - 70, y: map.y }
  const second = { x: map.x + 70, y: map.y }

  // The same vehicle twice, which is the case a correction is about.
  await dragFromPalette(page, /Semi \+ 53 ft/, first)
  await dragFromPalette(page, /Semi \+ 53 ft/, second)
  await expect(page.locator('path.placement')).toHaveCount(2)

  const scale = await pixelsPerMetre(page)
  const editor = page.getByRole('region', { name: 'The selected vehicle' })
  const mapBefore = await page.locator('.leaflet-container').boundingBox()

  // The second drop left the second one selected, so the first is selected by
  // tapping it - and the form opens on what the vehicle publishes: 8 foot 6.
  await page.touchscreen.tap(first.x, first.y)
  await expect(editor.getByLabel('Width, feet')).toHaveValue('8')
  await expect(editor.getByLabel('Width, inches')).toHaveValue('6')

  // Opening the form must not resize the map, or the ground moves under the
  // finger that has just selected something.
  const mapAfter = await page.locator('.leaflet-container').boundingBox()
  expect(Math.abs((mapAfter?.height ?? 0) - (mapBefore?.height ?? 0))).toBeLessThan(1)

  // And it has to be drawn over the photograph rather than behind it. Leaflet
  // z-indexes its panes up to 700 and the map is not a stacking context, so a
  // sheet left at auto paints underneath: present, filled in, and passing every
  // other assertion in this file while being quite invisible. (Asking
  // `elementFromPoint` does not catch it, because the panes take no pointer
  // events and hit-testing sees straight through them.)
  const layering = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet')
    const panes = [...document.querySelectorAll('.leaflet-pane')]
    const above = Math.max(...panes.map((pane) => Number(getComputedStyle(pane).zIndex) || 0))
    return { sheet: sheet === null ? null : getComputedStyle(sheet).zIndex, panes: above }
  })
  expect(layering.panes).toBeGreaterThan(0)
  expect(Number(layering.sheet)).toBeGreaterThan(layering.panes)

  // Correct it to 12 feet 6, which is 150 inches.
  await editor.getByLabel('Width, feet').fill('12')
  await editor.getByLabel('Width, inches').fill('6')

  // Both rectangles changed, because both placements carry the same vehicle.
  const grown = await drawnSizes(page)
  expect(grown).toHaveLength(2)
  for (const size of grown) {
    expect(Math.abs(size.height - 150 * 0.0254 * scale)).toBeLessThan(2)
  }

  // And the size reads back as it was typed, in feet and inches.
  await expect(editor).toContainText(`70'0" by 12'6"`)

  // A dimension that is not a dimension says so, and the last good one stands.
  await editor.getByLabel('Width, inches').fill('abc')
  await expect(editor.getByRole('alert')).toContainText('whole inches')

  const unchanged = await drawnSizes(page)
  for (const size of unchanged) {
    expect(Math.abs(size.height - 150 * 0.0254 * scale)).toBeLessThan(2)
  }
})

test('turns a vehicle, and it settles onto the angle the space is at', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drop = await middleOfTheMap(page)
  await dragFromPalette(page, /Semi \+ 53 ft/, drop)

  // The handle belongs to the selected vehicle, and only to it.
  await expect(page.locator('.rotation-handle')).toHaveCount(1)

  // The fixture frame lies at 90 degrees and a new vehicle takes its angle, so
  // the label reads straight across the screen.
  const label = page.locator('.placement-label')
  await expect(label).toHaveAttribute('style', /rotate\(0deg\)/)

  // Turned to 60 degrees, which is nowhere near any candidate: it stays there,
  // because any angle at all is possible and the candidates are a magnet. A
  // degree of slack, because the touch point is rounded to whole pixels.
  await turnTo(page, drop, 60)
  expect(Math.abs((await labelAngle(page)) + 30)).toBeLessThan(1)

  // Turned to about 93, which is three degrees from the frame's own 90 and so
  // inside the tolerance. It settles back onto the space it is in.
  await turnTo(page, drop, 93)
  expect(Math.abs(await labelAngle(page))).toBeLessThan(0.001)

  // And it never went anywhere: turning is not moving, and the press that turns
  // a vehicle lands on the handle rather than on the vehicle.
  const placed = middleOf(
    (await page.locator('path.placement').boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 },
  )
  expect(Math.abs(placed.x - drop.x)).toBeLessThan(2)
  expect(Math.abs(placed.y - drop.y)).toBeLessThan(2)
})

test('turns a vehicle onto the row already laid', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const map = await middleOfTheMap(page)
  const first = { x: map.x - 90, y: map.y }
  const second = { x: map.x + 90, y: map.y }

  // One vehicle set by hand at about 37 degrees, which no candidate offers: the
  // space is at 90 and there is nothing else on the ground yet.
  await dragFromPalette(page, /Semi \+ 53 ft/, first)
  await turnTo(page, first, 37)

  const byHand = await labelAngle(page)
  expect(Math.abs(byHand + 53)).toBeLessThan(1.5)

  // A second vehicle, turned to about 41. The space's 90 is half a circle away;
  // the first vehicle is four degrees away, so that is what it lines up with.
  await dragFromPalette(page, /Semi \+ 53 ft/, second)
  await turnTo(page, second, 41)

  const labels = page.locator('.placement-label')
  await expect(labels).toHaveCount(2)

  // Lined up with the row already laid to the last decimal, because it took the
  // first vehicle's own angle rather than the space's.
  expect(Math.abs(byHand)).toBeGreaterThan(10)
  expect(await labelAngle(page, 1)).toBe(byHand)
})
