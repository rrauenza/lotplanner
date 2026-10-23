import { expect, test, type Page } from '@playwright/test'

import { dragFromPalette, middleOfTheMap, openTheSite, serveImagery } from './harness.js'

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
  const middle = await middleOf(await mapBox(page))
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