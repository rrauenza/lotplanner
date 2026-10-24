import { expect, test, type Page } from '@playwright/test'

import { dragFromPalette, middleOfTheMap, openTheSite, serveImagery } from './harness.js'

/**
 * Adopting a Layout's vehicles.
 *
 * A Layout embeds its own copies of the Vehicles it uses (ADR 0002), so opening
 * someone else's must never depend on the visitor having them - and what they do
 * not have has to be said plainly and taken on deliberately, or not at all. The
 * decision itself - which vehicles are absent, and that adopting is a fork -
 * lives in the pure core; this suite is about the visitor's half: the report
 * appearing for a Layout that needs it, the one action that adopts, and declining
 * leaving a Layout that renders and edits like any other.
 *
 * The Layouts here are seeded into storage, which is where an arriving Layout
 * ends up once it is kept; the import paths themselves are covered in
 * `files.spec.ts` and `share.spec.ts`.
 */

/** The visitor's own vehicle, which one Layout also uses. */
const TOW_TRUCK = {
  name: 'Tow truck',
  shortLabel: 'Tow',
  widthInches: 96,
  lengthInches: 240,
  colour: 0x6b7280,
}

/** The visitor's own collection, holding it. */
const MY_FLEET = {
  id: 'mine',
  name: 'My fleet',
  vehicles: [TOW_TRUCK],
}

/** A vehicle in no collection: what the report is for. */
const BOX_VAN = {
  name: 'Box van',
  shortLabel: 'Box van',
  widthInches: 90,
  lengthInches: 300,
  colour: 0xf59e0b,
}

/** One of the vehicles the app ships with, so never missing. */
const SEMI = {
  name: 'Semi + 53 ft trailer',
  shortLabel: 'Semi',
  widthInches: 102,
  lengthInches: 840,
  colour: 0xef4444,
}

/**
 * A Layout for the fixture Site holding these vehicles, as an older app or
 * another browser would have left it in storage.
 */
function loaded(vehicles: readonly object[]): object[] {
  return [
    {
      id: 'seeded',
      name: 'Layout 1',
      layout: {
        siteId: 'cupertino-sample',
        siteName: 'Cupertino sample',
        origin: { latitude: 37.32, longitude: -122.03 },
        bounds: {
          southWest: { latitude: 37.317, longitude: -122.035 },
          northEast: { latitude: 37.323, longitude: -122.025 },
        },
        placements: vehicles.map((vehicle, index) => ({
          id: `p${String(index)}`,
          vehicle,
          centre: { eastMetres: index * 25, northMetres: 0 },
          rotationDegrees: 90,
        })),
      },
    },
  ]
}

/** Put the visitor's collections, and a Site's saved Layouts, there up front. */
async function seed(
  page: Page,
  records: { readonly collections?: readonly object[]; readonly layout?: readonly object[] },
): Promise<void> {
  await page.addInitScript(
    (given: { collections: string | null; saved: string }) => {
      if (given.collections !== null) {
        localStorage.setItem('lotplanner:collections', given.collections)
      }
      localStorage.setItem('lotplanner:saved:cupertino-sample', given.saved)
    },
    {
      collections: records.collections === undefined ? null : JSON.stringify(records.collections),
      saved: JSON.stringify(records.layout ?? []),
    },
  )
}

/** The report, which floats over the photograph. */
function report(page: Page) {
  return page.getByRole('region', { name: 'Vehicles not in your collections' })
}

/** Long enough for the write that follows an edit to have happened. */
async function settled(page: Page): Promise<void> {
  await page.waitForTimeout(700)
}

async function openTheSeededLayout(page: Page): Promise<void> {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()
}

test('reports exactly which of an opened Layout vehicles are absent', async ({ page }) => {
  await seed(page, {
    collections: [MY_FLEET],
    layout: loaded([SEMI, TOW_TRUCK, BOX_VAN]),
  })
  await openTheSeededLayout(page)

  // The Layout is open and drawn, with all three of its vehicles on the ground.
  await expect(page.locator('path.placement')).toHaveCount(3)

  const absent = report(page)
  await expect(absent).toBeVisible()

  // Exactly one of the three is missing: the app's own Semi and the visitor's
  // own Tow truck are not reported, however many collections they live in.
  await expect(absent).toContainText('Box van')
  await expect(absent).not.toContainText('Semi')
  await expect(absent).not.toContainText('Tow truck')
})

test('adopts the missing vehicles into a new collection, touching no existing one', async ({
  page,
}) => {
  await seed(page, {
    collections: [MY_FLEET],
    layout: loaded([SEMI, TOW_TRUCK, BOX_VAN]),
  })
  await openTheSeededLayout(page)

  await report(page).getByRole('button', { name: 'Add them to a new collection' }).click()

  // The report has nothing left to say: what it was about is now the visitor's.
  await expect(report(page)).toHaveCount(0)
  await expect(page.locator('path.placement')).toHaveCount(3)

  const palette = page.locator('aside[aria-label="Vehicles"]')
  await expect(palette.getByRole('button', { name: 'Collection 1' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(palette.getByRole('button', { name: /Box van/ })).toBeVisible()

  await settled(page)

  // A new collection of exactly the missing vehicle, and the collection the
  // visitor already had is byte-identical - nothing was merged into it.
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lotplanner:collections') ?? '[]') as unknown[],
  )

  expect(stored).toHaveLength(2)
  expect(stored[0]).toEqual(MY_FLEET)
  expect(stored[1]).toEqual({
    id: expect.any(String) as unknown as string,
    name: 'Collection 1',
    vehicles: [BOX_VAN],
  })
})

test('does not appear when nothing is missing', async ({ page }) => {
  await seed(page, { collections: [MY_FLEET], layout: loaded([SEMI, TOW_TRUCK]) })
  await openTheSeededLayout(page)

  await expect(page.locator('path.placement')).toHaveCount(2)
  await expect(report(page)).toHaveCount(0)
})

test('does not appear for a Layout built from the palette', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  await dragFromPalette(page, /Semi \+ 53 ft/, await middleOfTheMap(page))

  await expect(page.locator('path.placement')).toHaveCount(1)
  await expect(report(page)).toHaveCount(0)
})

test('declining leaves the Layout rendering and editing like any other', async ({ page }) => {
  await seed(page, { collections: [MY_FLEET], layout: loaded([BOX_VAN]) })
  await openTheSeededLayout(page)

  await expect(report(page)).toBeVisible()
  await report(page).getByRole('button', { name: 'Not now' }).click()
  await expect(report(page)).toHaveCount(0)

  // The Layout carries its own copy, so it is still drawn, and still editable:
  // sorting out the visitor's collections is not a prerequisite for working.
  await expect(page.locator('path.placement')).toHaveCount(1)
  await dragFromPalette(page, /Semi \+ 53 ft/, await middleOfTheMap(page))
  await expect(page.locator('path.placement')).toHaveCount(2)

  // Opening the Layout again reports again: declining is for that opening, not a
  // setting that hides a real difference between the Layout and the collections.
  await page.getByRole('button', { name: /^Layouts: / }).click()
  await page
    .getByRole('region', { name: 'Layouts' })
    .getByRole('button', { name: 'Layout 1', exact: true })
    .click()
  await expect(report(page)).toBeVisible()
})
