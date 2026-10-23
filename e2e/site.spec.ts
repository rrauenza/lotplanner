import { expect, test } from '@playwright/test'

import {
  ATTRIBUTION,
  EXTENT_HEIGHT_METRES,
  EXTENT_WIDTH_METRES,
  FRAME_ALONG_EAST_METRES,
  FRAME_ALONG_NORTH_METRES,
  dragFromPalette,
  drawnSize,
  drawnSizes,
  labelAngle,
  middleOf,
  middleOfTheMap,
  openTheSite,
  pixelsPerMetre,
  serveImagery,
  touchDrag,
  turnTo,
  type Point,
} from './harness.js'

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
  const picture = page.locator('img.leaflet-image-layer')
  await expect(drawn).toHaveCount(1)

  const before = (await drawn.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }
  const grab = middleOf(before)

  // Tapping empty space lets it go; tapping the vehicle picks it up again, and
  // a tap is a real touch rather than a mouse click. Both presses are on the
  // map above the sheet, which is where a vehicle's own controls are not.
  await page.touchscreen.tap(drop.x + 160, drop.y - 60)
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
  //
  // Measured against the photograph rather than against the Site Frame's own
  // outline. That outline is dashed, and the box around a dashed stroke comes
  // back a few pixels different from one moment to the next, which is more than
  // this comparison is asking about; the picture has no such wobble.
  const vehicleBefore = middleOf(moved)
  const pictureBefore = middleOf(
    (await picture.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 },
  )

  await touchDrag(
    page,
    { x: drop.x - 160, y: drop.y - 40 },
    { x: drop.x - 260, y: drop.y + 20 },
    10,
  )

  const vehicleAfter = middleOf((await drawn.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 })
  const pictureAfter = middleOf(
    (await picture.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 },
  )

  // The picture really did move, so the assertion below is not about two things
  // staying still together.
  expect(Math.abs(pictureAfter.x - pictureBefore.x)).toBeGreaterThan(20)
  expect(
    Math.abs(vehicleAfter.x - vehicleBefore.x - (pictureAfter.x - pictureBefore.x)),
  ).toBeLessThan(1)
  expect(
    Math.abs(vehicleAfter.y - vehicleBefore.y - (pictureAfter.y - pictureBefore.y)),
  ).toBeLessThan(1)
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

test('undoes and redoes, by the buttons and by the keyboard', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drawn = page.locator('path.placement')
  const undoButton = page.getByRole('button', { name: 'Undo' })
  const redoButton = page.getByRole('button', { name: 'Redo' })

  // An empty piece of ground has nothing to undo or redo, and neither button
  // offers to do it.
  await expect(undoButton).toBeDisabled()
  await expect(redoButton).toBeDisabled()

  const drop = await middleOfTheMap(page)
  await dragFromPalette(page, /Semi \+ 53 ft/, drop)
  await expect(drawn).toHaveCount(1)
  await expect(undoButton).toBeEnabled()
  await expect(redoButton).toBeDisabled()

  // A second one, so that undo has an order to work backwards through.
  await dragFromPalette(page, /Semi \+ 53 ft/, { x: drop.x + 80, y: drop.y + 70 })
  await expect(drawn).toHaveCount(2)

  // Back one at a time, by the button, and then to the state it began in.
  await undoButton.click()
  await expect(drawn).toHaveCount(1)
  await expect(redoButton).toBeEnabled()

  await undoButton.click()
  await expect(drawn).toHaveCount(0)
  await expect(undoButton).toBeDisabled()
  await expect(redoButton).toBeEnabled()

  // Forward again, by the keyboard this time: Control and Shift and Z.
  await page.keyboard.press('Control+Shift+z')
  await expect(drawn).toHaveCount(1)
  await page.keyboard.press('Control+Shift+z')
  await expect(drawn).toHaveCount(2)
  await expect(redoButton).toBeDisabled()
})

test('forgets what was undone once there is a new edit', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drawn = page.locator('path.placement')
  const undoButton = page.getByRole('button', { name: 'Undo' })
  const redoButton = page.getByRole('button', { name: 'Redo' })

  const drop = await middleOfTheMap(page)
  await dragFromPalette(page, /Semi \+ 53 ft/, drop)
  await dragFromPalette(page, /Semi \+ 53 ft/, { x: drop.x + 80, y: drop.y + 70 })
  await expect(drawn).toHaveCount(2)

  await undoButton.click()
  await expect(drawn).toHaveCount(1)
  await expect(redoButton).toBeEnabled()

  // An edit made after undoing starts a new line of edits: what was undone is
  // not something to go forward to any more.
  await dragFromPalette(page, /Semi \+ 53 ft/, { x: drop.x - 80, y: drop.y - 70 })
  await expect(drawn).toHaveCount(2)
  await expect(redoButton).toBeDisabled()
})

test('undoes a delete, and the vehicle comes back where it was', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drawn = page.locator('path.placement')
  await dragFromPalette(page, /Semi \+ 53 ft/, await middleOfTheMap(page))
  await expect(drawn).toHaveCount(1)

  const before = await drawn.boundingBox()

  // Dropping it left it selected, so its own Delete is up without a tap.
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(drawn).toHaveCount(0)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(drawn).toHaveCount(1)

  // Selected again before measuring, so that what it is compared against was
  // drawn the same way: a selected rectangle wears a thicker outline, which is
  // a pixel of difference in its box.
  const middle = middleOf(before ?? { x: 0, y: 0, width: 0, height: 0 })
  await page.touchscreen.tap(middle.x, middle.y)
  await expect(page.locator('path.placement.selected')).toHaveCount(1)

  // Back in the same place, not merely back.
  const after = await drawn.boundingBox()
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(1)
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(1)
})

test('undoes a correction, and the form shows the size that comes back', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  await dragFromPalette(page, /Semi \+ 53 ft/, await middleOfTheMap(page))

  const scale = await pixelsPerMetre(page)
  const editor = page.getByRole('region', { name: 'The selected vehicle' })

  // As published: 8 foot 6 wide.
  await expect(editor.getByLabel('Width, feet')).toHaveValue('8')
  await expect(editor.getByLabel('Width, inches')).toHaveValue('6')
  const asPublished = await drawnSizes(page)
  expect(asPublished).toHaveLength(1)

  await editor.getByLabel('Width, feet').fill('12')
  await editor.getByLabel('Width, inches').fill('6')
  await expect(editor).toContainText(`70'0" by 12'6"`)

  await page.getByRole('button', { name: 'Undo' }).click()

  // The boxes have to follow the vehicle back, or the form goes on showing a
  // size that is nowhere on the ground.
  await expect(editor.getByLabel('Width, feet')).toHaveValue('8')
  await expect(editor.getByLabel('Width, inches')).toHaveValue('6')
  await expect(editor).toContainText(`70'0" by 8'6"`)

  const undone = await drawnSizes(page)
  expect(Math.abs((undone[0]?.height ?? 0) - 102 * 0.0254 * scale)).toBeLessThan(2)

  // And a keystroke after that corrects what is now stored rather than putting
  // the undone size back.
  await editor.getByLabel('Name').fill('Semi with a longer name')
  await expect(editor.getByLabel('Width, inches')).toHaveValue('6')

  const afterTyping = await drawnSizes(page)
  expect(Math.abs((afterTyping[0]?.height ?? 0) - 102 * 0.0254 * scale)).toBeLessThan(2)
})

test('leaves Ctrl and Z alone in a box someone is typing in', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drawn = page.locator('path.placement')
  const redoButton = page.getByRole('button', { name: 'Redo' })

  await dragFromPalette(page, /Semi \+ 53 ft/, await middleOfTheMap(page))
  await expect(drawn).toHaveCount(1)

  const editor = page.getByRole('region', { name: 'The selected vehicle' })
  const name = editor.getByLabel('Name')
  await name.fill('Semi, in the box')

  // The box has its own undo, and taking the keystroke from it would be taking
  // it from what someone typed. A layout edit undone instead would show up as a
  // step forward becoming available.
  await name.press('Control+z')
  await expect(drawn).toHaveCount(1)
  await expect(redoButton).toBeDisabled()
})

test('makes three in three taps, and takes one away', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const drop = await middleOfTheMap(page)
  await dragFromPalette(page, /Semi \+ 53 ft/, drop)

  // Turned by hand first, so that keeping the angle is something to check.
  await turnTo(page, drop, 37)

  const drawn = page.locator('path.placement')
  await expect(drawn).toHaveCount(1)

  const turned = await labelAngle(page)
  expect(Math.abs(turned)).toBeGreaterThan(10)

  // Two more taps on Duplicate make three. A row of twelve would be twelve.
  await page.getByRole('button', { name: 'Duplicate' }).click()
  await page.getByRole('button', { name: 'Duplicate' }).click()
  await expect(drawn).toHaveCount(3)

  // Every one of them keeps the angle it came from.
  expect(await labelAngle(page, 1)).toBe(turned)
  expect(await labelAngle(page, 2)).toBe(turned)

  // And none of them is underneath another: three corners, three positions.
  const places = await page.evaluate(
    () =>
      new Set(
        [...document.querySelectorAll('path.placement')].map((path) => {
          const rect = path.getBoundingClientRect()
          return `${String(Math.round(rect.x))},${String(Math.round(rect.y))}`
        }),
      ).size,
  )
  expect(places).toBe(3)

  // Deleting takes away only the one that is selected, which is the last copy.
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(drawn).toHaveCount(2)
  expect(await labelAngle(page)).toBe(turned)
})
