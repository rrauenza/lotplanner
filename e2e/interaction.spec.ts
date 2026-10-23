import { expect, test, type Page } from '@playwright/test'

import {
  dragFromPalette,
  drawnSize,
  middleOfTheMap,
  openTheSite,
  serveImagery,
  touchDrag,
  touchHoldDrag,
  touchTwoFinger,
} from './harness.js'

/**
 * Working on a phone: the layout, the padded targets, the long press and the
 * lock.
 *
 * The interaction model is ADR 0005, and none of it is reachable from the pure
 * core, so this is the seam it is tested at. Where a test measures movement it
 * measures it against the photograph rather than against a drawn outline, for
 * the reason the pan test in `site.spec.ts` gives: a dashed stroke measures a
 * little differently from one moment to the next.
 */

interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).boundingBox()
  expect(box).not.toBeNull()

  return box ?? { x: 0, y: 0, width: 0, height: 0 }
}

const mapBox = (page: Page): Promise<Box> => boxOf(page, '.leaflet-container')
const pictureBox = (page: Page): Promise<Box> => boxOf(page, 'img.leaflet-image-layer')

const middleOf = (box: Box): { x: number; y: number } => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
})

/**
 * Take a vehicle off the palette, scrolling to it first.
 *
 * On a short phone the palette is part of the block of controls under the map,
 * and that block scrolls when there is not enough height for it and the map
 * together. Scrolling to a chip is what a thumb does, so the test does it.
 */
async function placeFromPalette(page: Page, name: RegExp, to: { x: number; y: number }) {
  const chip = page.getByRole('button', { name })

  await chip.scrollIntoViewIfNeeded()
  await dragFromPalette(page, name, to)
}

test('fits the map and its controls on a short phone without overlapping', async ({ page }) => {
  // The viewport the overflow was seen at. Short enough that the map's own
  // floor won over everything below it.
  await page.setViewportSize({ width: 390, height: 664 })

  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // Four vehicles, which is what grew the count panel enough to overflow.
  const middle = middleOf(await mapBox(page))
  await placeFromPalette(page, /Semi \+ 53 ft/, { x: middle.x - 60, y: middle.y - 40 })
  await placeFromPalette(page, /Coach/, { x: middle.x + 60, y: middle.y - 40 })
  await placeFromPalette(page, /SUV/, { x: middle.x - 60, y: middle.y + 40 })
  await placeFromPalette(page, /F-250/, { x: middle.x + 60, y: middle.y + 40 })
  await expect(page.locator('path.placement')).toHaveCount(4)

  const map = await mapBox(page)
  const chrome = await boxOf(page, '.chrome')
  const viewport = { width: 390, height: 664 }

  // The map does not sit over what follows it: its bottom is at or above the
  // top of the controls. This is the bug, stated as an assertion.
  expect(map.y + map.height).toBeLessThanOrEqual(chrome.y + 1)

  // Nothing spills past the bottom of the page either: the block of controls
  // ends within the viewport, and what it cannot show at once it scrolls.
  expect(chrome.y + chrome.height).toBeLessThanOrEqual(viewport.height)

  // The map is still worth looking at, rather than collapsed to nothing to make
  // room for the chrome.
  expect(map.height).toBeGreaterThan(100)

  // And the controls a thumb reaches for are on the page rather than past its
  // bottom: the row of Layouts, Undo and Redo is at the top of that block.
  const undo = await page.getByRole('button', { name: 'Undo' }).boundingBox()
  expect(undo).not.toBeNull()
  expect((undo?.y ?? 0) + (undo?.height ?? 0)).toBeLessThanOrEqual(viewport.height)
})

/**
 * Somewhere on the map with nothing on it: the top right corner, away from
 * Leaflet's own zoom control in the top left, and away from the sheet a
 * selection opens along the bottom.
 */
async function emptyCorner(page: Page): Promise<{ x: number; y: number }> {
  const map = await mapBox(page)

  return { x: map.x + map.width - 16, y: map.y + 16 }
}

/** A car dropped in the upper part of the map, where the sheet does not cover it. */
async function placeACar(page: Page): Promise<{ x: number; y: number }> {
  const map = await mapBox(page)
  const at = { x: middleOf(map).x, y: map.y + 70 }

  await dragFromPalette(page, /SUV/, at)
  await expect(page.locator('path.placement')).toHaveCount(1)

  return at
}

test('takes a press outside a small car, because a fingertip is not a rectangle', async ({
  page,
}) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  await placeACar(page)
  // The drop leaves it selected, so let it go before the ground is tested.
  const away = await emptyCorner(page)
  await page.touchscreen.tap(away.x, away.y)
  await expect(page.locator('path.placement.selected')).toHaveCount(0)

  const drawn = await drawnSize(page, 'path.placement')
  const car = await boxOf(page, 'path.placement')
  const middle = middleOf(car)

  // A car is less than half a fingertip across. A press a little above its
  // outline still lands on it - the target is padded, and the pad is not drawn.
  await page.touchscreen.tap(middle.x, car.y - 12)
  await expect(page.locator('path.placement.selected')).toHaveCount(1)
  expect(await drawnSize(page, 'path.placement')).toEqual(drawn)

  // The pad has an edge of its own: a press well clear of the car finds the
  // empty ground and lets the selection go, rather than the target growing
  // without limit.
  await page.touchscreen.tap(away.x, away.y)
  await expect(page.locator('path.placement.selected')).toHaveCount(0)
  await page.touchscreen.tap(middle.x, car.y - 60)
  await expect(page.locator('path.placement.selected')).toHaveCount(0)

  // And it is a screen distance rather than a ground one, which is the point:
  // zoomed out, a car is a couple of pixels, and the target is still a fingertip.
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await page.getByRole('button', { name: 'Zoom out' }).click()
  // A zoom animates, and a tap aimed at coordinates taken mid-animation is
  // aimed at where the car was rather than where it is.
  await page.waitForTimeout(400)

  const smaller = await boxOf(page, 'path.placement')
  expect(smaller.width).toBeLessThan(car.width)
  await page.touchscreen.tap(middleOf(smaller).x, smaller.y - 10)
  await expect(page.locator('path.placement.selected')).toHaveCount(1)
})

test('picks a small vehicle up with a long press, and lets a jittery tap alone', async ({
  page,
}) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  await placeACar(page)
  const away = await emptyCorner(page)
  await page.touchscreen.tap(away.x, away.y)
  await expect(page.locator('path.placement.selected')).toHaveCount(0)

  const before = await boxOf(page, 'path.placement')
  const middle = middleOf(before)

  // A tap that jitters over the car is still a tap: it selects, and it does not
  // nudge what it touched. A car is under 7 px across here, so arming the move
  // on the first pixel of travel would move it every time someone selected it.
  await touchDrag(page, middle, { x: middle.x + 6, y: middle.y }, 3)
  await expect(page.locator('path.placement.selected')).toHaveCount(1)
  const nudged = await boxOf(page, 'path.placement')
  expect(Math.abs(nudged.x - before.x)).toBeLessThan(2)
  expect(Math.abs(nudged.y - before.y)).toBeLessThan(2)

  // A long press picks it up: the move is armed without the finger travelling,
  // which is what makes a small or an overlapping target reliable to grab. The
  // same 6 px of travel now moves the car.
  await page.touchscreen.tap(away.x, away.y)
  await expect(page.locator('path.placement.selected')).toHaveCount(0)

  await touchHoldDrag(page, middle, { x: middle.x + 6, y: middle.y }, 600, 3, async () => {
    await expect(page.locator('path.placement.picked-up')).toHaveCount(1)
  })

  await expect(page.locator('path.placement.selected')).toHaveCount(1)
  const carried = await boxOf(page, 'path.placement')
  expect(Math.abs(carried.x - before.x)).toBeGreaterThan(4)
})

test('freezes every vehicle with the lock, so every gesture pans the picture', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drop = await middleOfTheMap(page)
  await dragFromPalette(page, /Semi \+ 53 ft/, drop)
  await expect(page.locator('path.placement')).toHaveCount(1)

  // The lock is the button that says what it does, and which way it is now.
  const lock = page.getByRole('button', { name: 'Lock vehicles' })
  await expect(lock).toHaveAttribute('aria-pressed', 'false')
  await lock.click()

  // A freed vehicle is not selected, and its own controls go with the
  // selection: reviewing a finished layout should not have a handle on it.
  await expect(page.locator('path.placement.selected')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'The selected vehicle' })).toHaveCount(0)
  await expect(lock).toHaveAttribute('aria-pressed', 'true')

  const pictureBefore = await pictureBox(page)
  const vehicleBefore = await boxOf(page, 'path.placement')
  const grab = middleOf(vehicleBefore)

  // A drag beginning on a vehicle pans, because the lock makes it ground rather
  // than something to pick up.
  await touchDrag(page, grab, { x: grab.x + 90, y: grab.y - 40 }, 10)

  const pictureAfter = await pictureBox(page)
  const vehicleAfter = await boxOf(page, 'path.placement')

  expect(Math.abs(pictureAfter.x - pictureBefore.x)).toBeGreaterThan(20)
  // The vehicle moved with the picture and not over it: same delta, no edit.
  expect(
    Math.abs(vehicleAfter.x - vehicleBefore.x - (pictureAfter.x - pictureBefore.x)),
  ).toBeLessThan(1)
  expect(
    Math.abs(vehicleAfter.y - vehicleBefore.y - (pictureAfter.y - pictureBefore.y)),
  ).toBeLessThan(1)
  await expect(page.locator('path.placement.selected')).toHaveCount(0)

  // Unlocked, the same press moves the vehicle rather than the picture.
  await lock.click()
  await expect(lock).toHaveAttribute('aria-pressed', 'false')

  // A pan flicked with the finger keeps gliding for a moment, so let it settle
  // before the picture is used as the thing that does not move.
  await page.waitForTimeout(500)

  const still = await pictureBox(page)
  const again = middleOf(await boxOf(page, 'path.placement'))
  await touchDrag(page, again, { x: again.x + 70, y: again.y }, 8)

  const moved = await boxOf(page, 'path.placement')
  const after = await pictureBox(page)

  // The vehicle went with the finger, and the picture did not move under it.
  expect(Math.abs(middleOf(moved).x - again.x)).toBeGreaterThan(50)
  expect(Math.abs(after.x - still.x)).toBeLessThan(2)
  await expect(page.locator('path.placement.selected')).toHaveCount(1)
})

test('pans and zooms with two fingers, even when one began on a vehicle', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // Everything here happens in the upper part of the map: a selection opens a
  // sheet along the bottom, and a finger meant for the picture that lands on
  // the sheet is a finger on a panel, not a gesture.
  const map = await mapBox(page)
  const drop = { x: middleOf(map).x, y: map.y + 70 }
  await dragFromPalette(page, /Semi \+ 53 ft/, drop)
  await expect(page.locator('path.placement')).toHaveCount(1)

  // A finger lands on the vehicle, as a mis-grab does, and only then does the
  // second arrive. Both travel together and upward, so this is a pan that stays
  // clear of the sheet the mis-grab opened.
  const pictureBefore = await pictureBox(page)
  const vehicleBefore = await boxOf(page, 'path.placement')
  const onTheVehicle = middleOf(vehicleBefore)

  await touchTwoFinger(
    page,
    onTheVehicle,
    { x: onTheVehicle.x + 80, y: onTheVehicle.y - 30 },
    { x: onTheVehicle.x + 120, y: onTheVehicle.y },
    { x: onTheVehicle.x + 200, y: onTheVehicle.y - 30 },
  )
  // A pan flicked with the fingers glides for a moment.
  await page.waitForTimeout(500)

  const pictureAfter = await pictureBox(page)
  const vehicleAfter = await boxOf(page, 'path.placement')

  // The picture really moved...
  expect(Math.abs(pictureAfter.x - pictureBefore.x)).toBeGreaterThan(20)
  // ...and the vehicle moved with it rather than over it: the two-finger gesture
  // is the escape, so nothing was carried off the ground it was on.
  expect(
    Math.abs(vehicleAfter.x - vehicleBefore.x - (pictureAfter.x - pictureBefore.x)),
  ).toBeLessThan(1)
  expect(
    Math.abs(vehicleAfter.y - vehicleBefore.y - (pictureAfter.y - pictureBefore.y)),
  ).toBeLessThan(1)

  // Two fingers moving apart zoom in. The picture is as sharp as it can be shown
  // when a place opens, so it is a pinch closed that has room to change the zoom.
  const wide = await pictureBox(page)
  const about = { x: middleOf(map).x, y: map.y + 60 }

  await touchTwoFinger(
    page,
    { x: about.x - 120, y: about.y },
    { x: about.x - 20, y: about.y },
    { x: about.x + 120, y: about.y },
    { x: about.x + 20, y: about.y },
  )
  await page.waitForTimeout(500)

  const narrow = await pictureBox(page)
  expect(narrow.width).toBeLessThan(wide.width * 0.95)
})

test('labels every control, and keeps the ones a thumb reaches for within reach', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()
  await dragFromPalette(page, /Semi \+ 53 ft/, await middleOfTheMap(page))

  // Everything but the map is a labelled thing with a name a screen reader can
  // read out. The map is the exception, and is documented where it is built.
  await expect(page.getByRole('navigation', { name: 'Places' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Vehicles' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Placed vehicles' })).toBeVisible()
  await expect(page.getByLabel('Opacity')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Layouts: / })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Redo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lock vehicles' })).toBeVisible()

  // The row of actions a hand reaches for while working sits in the lower half
  // of the phone, below the photograph, and each is a fingertip across rather
  // than a mouse target.
  for (const name of [/^Layouts: /, 'Undo', 'Redo', 'Lock vehicles']) {
    const box = await page.getByRole('button', { name }).boundingBox()
    expect(box).not.toBeNull()
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(844 / 2)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(38)
  }

  const chip = await page.getByRole('button', { name: /Semi \+ 53 ft/ }).boundingBox()
  expect(chip).not.toBeNull()
  expect(chip?.height ?? 0).toBeGreaterThanOrEqual(38)
})

test('puts a vehicle on the ground from the keyboard, since the map cannot be', async ({
  page,
}) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // A palette chip takes focus and answers Enter like any button. A keyboard
  // cannot drag a vehicle onto a piece of ground, so it goes to the middle of
  // the frame - the app is operable without a pointer, and the map is the only
  // part that is not.
  await page.getByRole('button', { name: /Semi \+ 53 ft/ }).focus()
  await page.keyboard.press('Enter')

  await expect(page.locator('path.placement')).toHaveCount(1)

  const frame = await boxOf(page, 'path.frame-guide')
  const placed = middleOf(await boxOf(page, 'path.placement'))
  expect(Math.abs(placed.x - middleOf(frame).x)).toBeLessThan(4)
  expect(Math.abs(placed.y - middleOf(frame).y)).toBeLessThan(4)
})
