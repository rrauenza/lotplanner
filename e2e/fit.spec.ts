import { expect, test, type Page } from '@playwright/test'

import { dragFromPalette, middleOfTheMap, openTheSite, serveImagery, touchDrag } from './harness.js'

/**
 * Fit feedback: how many of each vehicle are on the ground, and whether any two
 * of them are covering the same ground.
 *
 * Both are read off the Placements rather than off the labels, so what is
 * checked here is that the answer agrees with the picture - the rectangles are
 * drawn and compared by the same geometry, and a count is of what is there
 * rather than of what the palette offers.
 */

/** The panel that says how many, and warns when two of them overlap. */
function placed(page: Page) {
  return page.getByRole('region', { name: 'Placed vehicles' })
}

/**
 * A place to drop a vehicle that is clear of the vehicle form.
 *
 * The form is a sheet over the bottom of the photograph, and a tap meant for
 * the ground lands on the form instead when it is up, so these tests work in the
 * upper part of the map.
 */
async function clearOfTheForm(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('.leaflet-container').boundingBox()
  expect(box).not.toBeNull()

  return { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + 80 }
}

/** How see-through each drawn vehicle is, as the browser computes it. */
async function fillOpacities(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('path.placement')].map((path) =>
      Number(getComputedStyle(path).fillOpacity),
    ),
  )
}

/** The colours a drawn vehicle's outline can come in. */
const OVERLAP_RED = 'rgb(220, 38, 38)'
const SELECTED_WHITE = 'rgb(255, 255, 255)'
const ORDINARY_INK = 'rgb(27, 27, 27)'

/**
 * The outline each drawn vehicle actually wears: the stroke colour and width the
 * browser computed on the `<path>`.
 *
 * A class name says what the code meant; this says what Leaflet painted, which
 * is the same thing the sizes and angles are checked against rather than trusted
 * from the source.
 */
async function strokes(page: Page): Promise<{ colour: string; width: number }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('path.placement')].map((path) => {
      const stroke = getComputedStyle(path)

      return { colour: stroke.stroke, width: Number.parseFloat(stroke.strokeWidth) }
    }),
  )
}

test('counts what is on the ground, and keeps up as it changes', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // Nothing on the ground is said plainly rather than shown as a blank.
  await expect(placed(page)).toContainText('Nothing placed yet')

  const middle = await middleOfTheMap(page)
  await dragFromPalette(page, /Semi \+ 53 ft/, { x: middle.x - 100, y: middle.y })
  await expect(placed(page)).toContainText(/Semi \+ 53 ft trailer\s*1/)

  await dragFromPalette(page, /Semi \+ 53 ft/, { x: middle.x + 100, y: middle.y })
  await dragFromPalette(page, /Coach/, { x: middle.x, y: middle.y - 60 })

  await expect(placed(page)).toContainText(/Semi \+ 53 ft trailer\s*2/)
  await expect(placed(page)).toContainText(/Coach \(45 ft, MCI J4500\)\s*1/)

  // And a vehicle taken off the ground leaves the count, rather than staying
  // there at zero.
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(placed(page)).not.toContainText('Coach')
  await expect(placed(page)).toContainText(/Semi \+ 53 ft trailer\s*2/)
})

test('marks two vehicles that cover each other, and stops when they are apart', async ({
  page,
}) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drawn = page.locator('path.placement')
  const overlapping = page.locator('path.placement.overlapping')
  const clear = await clearOfTheForm(page)

  await dragFromPalette(page, /Semi \+ 53 ft/, clear)
  await expect(drawn).toHaveCount(1)
  await expect(overlapping).toHaveCount(0)
  await expect(placed(page)).not.toContainText('overlap')

  // Alone and selected, it wears selection's own outline: white, and wider than
  // an ordinary vehicle's single pixel.
  expect(await strokes(page)).toEqual([{ colour: SELECTED_WHITE, width: 3 }])

  // A second one let go in the same place lies over the first. Both are marked:
  // there is no telling which of two rectangles covering each other is the one
  // at fault, and both are what the visitor can see.
  await dragFromPalette(page, /Semi \+ 53 ft/, clear)
  await expect(drawn).toHaveCount(2)
  await expect(overlapping).toHaveCount(2)
  await expect(placed(page)).toContainText('2 vehicles overlap')

  // The mark is in the stroke itself and not only in the class: both take the
  // warning red, and each keeps the width its channel decides - selection's
  // three on the one just placed, and overlap's two on the one beneath it.
  expect(await strokes(page)).toEqual([
    { colour: OVERLAP_RED, width: 2 },
    { colour: OVERLAP_RED, width: 3 },
  ])

  // Let go of the selection, so that the finger finds the ground rather than the
  // form, and drag the top one clear of the other.
  await page.touchscreen.tap(clear.x + 150, clear.y - 40)
  await expect(page.locator('path.placement.selected')).toHaveCount(0)

  await touchDrag(page, clear, { x: clear.x + 280, y: clear.y }, 12)
  await expect(drawn).toHaveCount(2)
  await expect(overlapping).toHaveCount(0)
  await expect(placed(page)).not.toContainText('overlap')

  // Apart, the red is gone from both: the one it left behind is back to an
  // ordinary outline, and the one that was carried keeps selection's own - the
  // mark changes with the cover rather than sitting on a vehicle permanently.
  expect(await strokes(page)).toEqual([
    { colour: ORDINARY_INK, width: 1 },
    { colour: SELECTED_WHITE, width: 3 },
  ])
})

test('does not call a copy parked beside the original an overlap', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  await dragFromPalette(page, /Semi \+ 53 ft/, await clearOfTheForm(page))
  await expect(page.locator('path.placement')).toHaveCount(1)

  // Duplicate parks the copy one vehicle's width to the side: abreast, sharing a
  // long edge and no ground at all. It is the closest call the app itself makes,
  // and an arrangement that fits.
  await page.getByRole('button', { name: 'Duplicate' }).click()
  await expect(page.locator('path.placement')).toHaveCount(2)
  await expect(page.locator('path.placement.overlapping')).toHaveCount(0)
  await expect(placed(page)).not.toContainText('overlap')
})

test('draws every vehicle at the opacity the view control asks for', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const middle = await middleOfTheMap(page)
  await dragFromPalette(page, /Semi \+ 53 ft/, { x: middle.x - 100, y: middle.y })
  await dragFromPalette(page, /Coach/, { x: middle.x + 100, y: middle.y })
  await expect(page.locator('path.placement')).toHaveCount(2)

  // One setting for all of them, and the one it opens with is low enough to see
  // an overlap through.
  expect(await fillOpacities(page)).toEqual([0.4, 0.4])

  await page.getByLabel('Opacity').fill('1')
  expect(await fillOpacities(page)).toEqual([1, 1])

  await page.getByLabel('Opacity').fill('0.1')
  expect(await fillOpacities(page)).toEqual([0.1, 0.1])
})

test('keeps the opacity out of the work, so a reload forgets it', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // The opacity is a way of looking at the ground, not an arrangement on it, so
  // moving the control on an untouched Layout makes no work to be saved.
  await page.getByLabel('Opacity').fill('1')
  await page.getByRole('button', { name: /^Layouts: / }).click()
  await expect(page.getByRole('region', { name: 'Layouts' })).toContainText(
    'Nothing saved here yet',
  )
  await page.getByRole('button', { name: 'Done' }).click()

  await dragFromPalette(page, /Semi \+ 53 ft/, await middleOfTheMap(page))
  await expect(page.locator('path.placement')).toHaveCount(1)
  // Long enough for the write that follows an edit to have happened.
  await page.waitForTimeout(700)

  await page.reload()
  await page.getByRole('button', { name: 'Cupertino sample' }).click()
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // The work comes back and the way of looking at it does not.
  await expect(page.locator('path.placement')).toHaveCount(1)
  expect(await fillOpacities(page)).toEqual([0.4])
})
