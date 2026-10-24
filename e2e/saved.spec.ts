import { expect, test, type Page } from '@playwright/test'

import {
  dragFromPalette,
  drawnSizes,
  middleOf,
  middleOfTheMap,
  openTheSite,
  serveImagery,
  touchDrag,
} from './harness.js'

/**
 * Work kept between visits.
 *
 * A Site's named Layouts are one record in the browser's local storage, so these
 * tests are about what survives a reload and about what happens when there is
 * nowhere to put anything. The rules themselves - ordering, naming, and reading
 * back what an older version of the app left - are unit-tested against a fake.
 * The adapter is deliberately not unit-tested, so this is where it is exercised.
 */

/** The Layouts sheet: the Site's saved work, and what to do with it. */
function layouts(page: Page) {
  return page.getByRole('region', { name: 'Layouts' })
}

/** The button that says which Layout is open, and opens the others. */
function currentLayout(page: Page) {
  return page.getByRole('button', { name: /^Layouts: / })
}

async function openLayouts(page: Page): Promise<void> {
  await currentLayout(page).click()
}

async function closeLayouts(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Done' }).click()
}

/** A finger on the palette, let go over the photograph. */
async function placeOneVehicle(page: Page): Promise<void> {
  await dragFromPalette(page, /Semi \+ 53 ft/, await middleOfTheMap(page))
}

/** Long enough for the write that follows an edit to have happened. */
async function settled(page: Page): Promise<void> {
  await page.waitForTimeout(700)
}

/** What storage holds for the fixture Site, as the browser holds it. */
async function storedKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage).sort())
}

/** The Site's record as the browser holds it, if there is one yet. */
async function savedRecord(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((each) => each.includes('cupertino-sample'))

    return key === undefined ? null : localStorage.getItem(key)
  })
}

/** The fixture Site's frame, as the manifest has it. */
const SITE_FRAME = {
  centre: { eastMetres: -132, northMetres: 199 },
  lengthMetres: 137,
  widthMetres: 98,
  rotationDegrees: 90,
}

/**
 * A different frame for the same Site: tall and narrow rather than wide and
 * flat, and around the origin rather than up the road. Different enough in both
 * shape and place that a guide left over from the first Layout cannot be
 * mistaken for this one.
 */
const OTHER_FRAME = {
  centre: { eastMetres: 0, northMetres: 0 },
  lengthMetres: 80,
  widthMetres: 30,
  rotationDegrees: 0,
}

/** One saved Layout for the fixture Site, carrying the frame it was worked in. */
function savedLayout(id: string, name: string, frame: object): object {
  return {
    id,
    name,
    layout: {
      siteId: 'cupertino-sample',
      siteName: 'Cupertino sample',
      origin: { latitude: 37.32, longitude: -122.03 },
      bounds: {
        southWest: { latitude: 37.317, longitude: -122.035 },
        northEast: { latitude: 37.323, longitude: -122.025 },
      },
      frame,
      placements: [],
    },
  }
}

/**
 * Put a Site's saved Layouts in storage before the app starts, as an older app
 * or another browser would have left them.
 *
 * Seeded rather than built through the UI because the app has no way to give a
 * Layout a frame of its own: a Layout carries the frame it was worked in, and
 * the fixture Site has only one.
 */
async function seedLayouts(page: Page, layouts: readonly object[]): Promise<void> {
  await page.addInitScript((saved: string) => {
    localStorage.setItem('lotplanner:saved:cupertino-sample', saved)
  }, JSON.stringify(layouts))
}

test('saves as it is edited, so a layout is not lost to a phone call', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drawn = page.locator('path.placement')

  // Merely opening a place saves nothing: an untouched Layout is not work.
  await openLayouts(page)
  await expect(layouts(page)).toContainText('Nothing saved here yet')
  await closeLayouts(page)

  await placeOneVehicle(page)
  await expect(drawn).toHaveCount(1)

  // Named, listed and kept the moment it is edited, with no save button to find.
  await expect(currentLayout(page)).toHaveAccessibleName('Layouts: Layout 1')
  await openLayouts(page)
  await expect(layouts(page)).toContainText('Layout 1')
  await closeLayouts(page)

  await settled(page)

  // One record for this Site and no more, whatever the adapter calls it.
  // (Storage holds the imagery credit too, which is somebody else's business.)
  const siteKeys = (await storedKeys(page)).filter((key) => key.includes('cupertino-sample'))
  expect(siteKeys).toHaveLength(1)

  await page.reload()
  await page.getByRole('button', { name: 'Cupertino sample' }).click()
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // Back where it was left, rather than on a comprehensively blank page.
  await expect(drawn).toHaveCount(1)
  await expect(currentLayout(page)).toHaveAccessibleName('Layouts: Layout 1')
  await openLayouts(page)
  await expect(layouts(page)).toContainText('Layout 1')
})

test('keeps its own copies of the vehicles on it, corrections and all', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drawn = page.locator('path.placement')
  const middle = await middleOfTheMap(page)

  // Two of the same vehicle: the case that makes "the same vehicle" mean the
  // same values rather than the same object, which is what a trip through
  // storage takes away and has to leave working.
  await dragFromPalette(page, /Semi \+ 53 ft/, { x: middle.x - 70, y: middle.y })
  await dragFromPalette(page, /Semi \+ 53 ft/, { x: middle.x + 70, y: middle.y })
  await expect(drawn).toHaveCount(2)

  const editor = page.getByRole('region', { name: 'The selected vehicle' })
  await editor.getByLabel('Width, feet').fill('13')
  await editor.getByLabel('Width, inches').fill('0')
  await expect(editor).toContainText(`70'0" by 13'0"`)

  const before = await drawnSizes(page)
  expect(before).toHaveLength(2)

  await settled(page)
  await page.reload()
  await page.getByRole('button', { name: 'Cupertino sample' }).click()
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()
  await expect(drawn).toHaveCount(2)

  // What came back is two copies of one vehicle, corrected: tapping either one
  // and correcting it corrects both, exactly as it did before the reload.
  const placed = await drawn.first().boundingBox()
  expect(placed).not.toBeNull()

  const at = middleOf(placed ?? { x: 0, y: 0, width: 0, height: 0 })
  await page.touchscreen.tap(at.x, at.y)
  await expect(editor.getByLabel('Width, feet')).toHaveValue('13')

  await editor.getByLabel('Width, feet').fill('9')
  await expect(editor).toContainText(`70'0" by 9'0"`)

  const after = await drawnSizes(page)
  expect(after).toHaveLength(2)
  expect(Math.abs((after[0]?.height ?? 0) - (after[1]?.height ?? 0))).toBeLessThan(0.01)
  expect((after[0]?.height ?? 0) < (before[0]?.height ?? 0)).toBe(true)
})

test('holds several named Layouts for one place, and opens each as it was', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drawn = page.locator('path.placement')
  const middle = await middleOfTheMap(page)

  // The first option: one semi.
  await dragFromPalette(page, /Semi \+ 53 ft/, middle)
  await expect(drawn).toHaveCount(1)

  // The second option: another Layout for the same place, which is the whole
  // point of being able to name them.
  await openLayouts(page)
  await page.getByRole('button', { name: 'New Layout' }).click()
  await expect(drawn).toHaveCount(0)

  // A new Layout is not saved until something is on it, so the name shown is the
  // one it will take rather than one it has.
  await expect(currentLayout(page)).toHaveAccessibleName('Layouts: Layout 2')

  await dragFromPalette(page, /Coach/, { x: middle.x - 60, y: middle.y - 60 })
  await dragFromPalette(page, /Coach/, { x: middle.x + 60, y: middle.y - 60 })
  await expect(drawn).toHaveCount(2)

  await openLayouts(page)
  await layouts(page).getByRole('button', { name: 'Layout 1', exact: true }).click()
  await expect(drawn).toHaveCount(1)
  await expect(currentLayout(page)).toHaveAccessibleName('Layouts: Layout 1')

  await openLayouts(page)
  await layouts(page).getByRole('button', { name: 'Layout 2', exact: true }).click()
  await expect(drawn).toHaveCount(2)

  await settled(page)
  await page.reload()
  await page.getByRole('button', { name: 'Cupertino sample' }).click()
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // Both still there, and the one worked on last is the one that opens.
  await expect(drawn).toHaveCount(2)
  await openLayouts(page)
  await expect(layouts(page).getByRole('button', { name: 'Layout 1', exact: true })).toBeVisible()
  await expect(layouts(page).getByRole('button', { name: 'Layout 2', exact: true })).toBeVisible()
})

test('renames and deletes a saved Layout, and both stick', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drawn = page.locator('path.placement')

  await placeOneVehicle(page)
  await expect(drawn).toHaveCount(1)
  await settled(page)

  await openLayouts(page)
  const name = layouts(page).getByLabel('Name')
  await name.fill('Option A')
  await expect(currentLayout(page)).toHaveAccessibleName('Layouts: Option A')

  // A name that is not a name leaves the old one rather than blanking a row.
  await name.fill('   ')
  await expect(currentLayout(page)).toHaveAccessibleName('Layouts: Option A')
  await closeLayouts(page)

  await settled(page)
  await page.reload()
  await page.getByRole('button', { name: 'Cupertino sample' }).click()
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()
  await expect(currentLayout(page)).toHaveAccessibleName('Layouts: Option A')

  // Deleting asks first, and can be thought better of.
  await openLayouts(page)
  await layouts(page).getByRole('button', { name: 'Delete', exact: true }).click()
  await layouts(page).getByRole('button', { name: 'Keep it' }).click()
  await expect(layouts(page)).toContainText('Option A')

  await layouts(page).getByRole('button', { name: 'Delete', exact: true }).click()
  await layouts(page).getByRole('button', { name: 'Delete it' }).click()

  // The sheet goes with the Layout it was showing, and the ground it was on is
  // left blank rather than saved as an empty Layout.
  await expect(layouts(page)).toHaveCount(0)
  await expect(drawn).toHaveCount(0)

  await settled(page)
  await page.reload()
  await page.getByRole('button', { name: 'Cupertino sample' }).click()
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // Gone, and the ground it was on is blank rather than quietly restored.
  await expect(drawn).toHaveCount(0)
  await openLayouts(page)
  await expect(layouts(page)).toContainText('Nothing saved here yet')
})

test('writes an edit before the page goes, rather than losing it', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drawn = page.locator('path.placement')
  await placeOneVehicle(page)
  await expect(drawn).toHaveCount(1)

  // Waited for deliberately not at all: the write is not due for a moment yet,
  // which is the state a phone call arrives in.
  expect(await savedRecord(page)).toBeNull()

  // A reload is the page being thrown away, and it has to write what is waiting
  // on the way out.
  await page.reload()
  await page.getByRole('button', { name: 'Cupertino sample' }).click()
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  await expect(drawn).toHaveCount(1)
  await expect(currentLayout(page)).toHaveAccessibleName('Layouts: Layout 1')
})

test('does not throw an unwritten edit away when the same place is chosen again', async ({
  page,
}) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drawn = page.locator('path.placement')
  await placeOneVehicle(page)
  await expect(drawn).toHaveCount(1)

  // Nothing is written yet, so reading the place back from storage now would
  // find it empty and take the vehicle off the page with it.
  expect(await savedRecord(page)).toBeNull()

  await page.getByRole('button', { name: 'Cupertino sample' }).click()
  await expect(drawn).toHaveCount(1)
})

test('opens a Layout fitted on the Site Frame, and restores no viewport', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const guide = page.locator('path.frame-guide')
  const asOpened = await guide.boundingBox()

  // Zoomed away from the frame on purpose. None of that is part of the work: a
  // Layout is an arrangement on the ground, not a camera position. (Out, not in:
  // a Site opens at the sharpest zoom its picture can honestly be shown at.)
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await page.getByRole('button', { name: 'Zoom out' }).click()

  const moved = await guide.boundingBox()
  expect(Math.abs((moved?.width ?? 0) - (asOpened?.width ?? 0))).toBeGreaterThan(10)

  await placeOneVehicle(page)
  await settled(page)
  await page.reload()
  await page.getByRole('button', { name: 'Cupertino sample' }).click()
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // Fitted to the frame again, exactly as a first visit would be.
  const again = await guide.boundingBox()
  expect(Math.abs((again?.width ?? 0) - (asOpened?.width ?? 0))).toBeLessThan(1)
  expect(Math.abs((again?.x ?? 0) - (asOpened?.x ?? 0))).toBeLessThan(1)
  expect(await drawnSizes(page)).toHaveLength(1)
})

test('follows the frame of the Layout that is opened, guide and fit', async ({ page }) => {
  await seedLayouts(page, [
    savedLayout('first', 'Layout 1', SITE_FRAME),
    savedLayout('second', 'Layout 2', OTHER_FRAME),
  ])

  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const guide = page.locator('path.frame-guide')
  const map = page.locator('.leaflet-container')

  // The first Layout opens fitted to the Site's own frame.
  const first = await guide.boundingBox()
  expect(first).not.toBeNull()

  // Zoomed away and panned on purpose, so that a view still fitted to the first
  // frame cannot pass for one fitted to the second.
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await page.getByRole('button', { name: 'Zoom out' }).click()
  // A zoom animates, and a box measured mid-animation is not where it ends up.
  await page.waitForTimeout(400)

  const before = await map.boundingBox()
  const across = { y: (before?.y ?? 0) + (before?.height ?? 0) / 2 }
  await touchDrag(
    page,
    { x: (before?.x ?? 0) + 200, ...across },
    { x: (before?.x ?? 0) + 500, ...across },
  )
  // A pan flicked with the finger keeps gliding for a moment.
  await page.waitForTimeout(500)

  await openLayouts(page)
  await layouts(page).getByRole('button', { name: 'Layout 2', exact: true }).click()
  // The fit that follows an opening animates for the same reason.
  await page.waitForTimeout(400)

  const mapBox = await map.boundingBox()
  const second = await guide.boundingBox()
  expect(mapBox).not.toBeNull()
  expect(second).not.toBeNull()

  const middle = middleOf(second ?? { x: 0, y: 0, width: 0, height: 0 })
  const middleOfMap = middleOf(mapBox ?? { x: 0, y: 0, width: 0, height: 0 })

  // The guide is the second Layout's frame: 30 m by 80 m, square to the
  // compass, around the origin. Its middle is the middle of the picture...
  expect(Math.abs(middle.x - middleOfMap.x)).toBeLessThan(3)
  expect(Math.abs(middle.y - middleOfMap.y)).toBeLessThan(3)

  // ...its shape is that frame's shape...
  expect(Math.abs((second?.width ?? 0) / (second?.height ?? 1) - 30 / 80)).toBeLessThan(0.03)

  // ...and the view is fitted to it, with the 16 px padding the app opens with.
  expect(Math.abs((mapBox?.height ?? 0) - (second?.height ?? 0) - 32)).toBeLessThan(4)
})

test('leaves the view where it is when the next Layout has the same frame', async ({ page }) => {
  // Two Layouts of one place, each carrying its own copy of the same frame: the
  // common case, and the one where a re-fit would be a nuisance rather than a
  // correction.
  await seedLayouts(page, [
    savedLayout('first', 'Layout 1', SITE_FRAME),
    savedLayout('second', 'Layout 2', SITE_FRAME),
  ])

  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const guide = page.locator('path.frame-guide')
  const map = page.locator('.leaflet-container')

  // Zoomed and panned away from the frame, which is where a comparison between
  // two Layouts of one place is actually made.
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await page.waitForTimeout(400)

  const before = await map.boundingBox()
  const across = { y: (before?.y ?? 0) + (before?.height ?? 0) / 2 }
  await touchDrag(
    page,
    { x: (before?.x ?? 0) + 200, ...across },
    { x: (before?.x ?? 0) + 500, ...across },
  )
  await page.waitForTimeout(500)

  const asLeft = await guide.boundingBox()

  await openLayouts(page)
  await layouts(page).getByRole('button', { name: 'Layout 2', exact: true }).click()
  await page.waitForTimeout(400)

  const after = await guide.boundingBox()

  // The frame is the same, so the guide is already right and the view is left
  // alone. Switching between two Layouts of one place is comparing them, and a
  // re-fit on every switch would zoom out from under the comparison.
  expect(Math.abs((after?.x ?? 0) - (asLeft?.x ?? 0))).toBeLessThan(1)
  expect(Math.abs((after?.y ?? 0) - (asLeft?.y ?? 0))).toBeLessThan(1)
  expect(Math.abs((after?.width ?? 0) - (asLeft?.width ?? 0))).toBeLessThan(1)
})

test('carries on in memory, saying so, when the browser will not keep anything', async ({
  page,
}) => {
  // Storage as private browsing, or a quota already spent, leaves it: there, and
  // refusing.
  await page.addInitScript(() => {
    const refuse = () => {
      throw new Error('storage is not available')
    }

    Object.defineProperty(Storage.prototype, 'getItem', { value: refuse })
    Object.defineProperty(Storage.prototype, 'setItem', { value: refuse })
  })

  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // It never refuses to start, and says plainly that nothing will be kept.
  await expect(page.getByRole('status')).toContainText('Nothing will be saved')

  // And it is a working tool with no memory rather than a broken one: a name
  // still belongs to the Layout, it just will not be there tomorrow.
  const drawn = page.locator('path.placement')
  await placeOneVehicle(page)
  await expect(drawn).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()

  await openLayouts(page)
  await expect(layouts(page)).toContainText('Layout 1')
})
