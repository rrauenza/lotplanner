import { expect, test, type Page } from '@playwright/test'

import { dragFromPalette, middleOfTheMap, openTheSite, serveImagery } from './harness.js'

/**
 * Collections: the visitor's own vehicles.
 *
 * The rules - import-as-fork, collision suffixing, the reserved name, provenance
 * and the duplicate hint - are unit-tested against the pure core, because they
 * have to hold for a collection that arrives from a file or a link as well
 * (#12, #14). What this suite is for is the local half: making, naming, filling
 * and deleting a collection in a browser, and the System Collection being there
 * whatever happens to them.
 */

function palette(page: Page) {
  return page.locator('aside[aria-label="Vehicles"]')
}

function sheet(page: Page) {
  return page.getByRole('region', { name: 'Your collections' })
}

/** The one form a vehicle is entered in, in the sheet and on the map alike. */
function vehicleForm(page: Page) {
  return sheet(page).locator('section[aria-label="The selected vehicle"]')
}

/** Long enough for the write that follows an edit to have happened. */
async function settled(page: Page): Promise<void> {
  await page.waitForTimeout(700)
}

/** What the browser holds for the visitor's collections, if anything yet. */
async function collectionsRecord(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('lotplanner:collections'))
}

/** A collection of the visitor's own, made and named, with the sheet left open. */
async function makeCollection(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Collections' }).click()
  await sheet(page).getByRole('button', { name: 'New collection' }).click()
}

/** A vehicle added to the collection the sheet is showing. */
async function addVehicle(page: Page, name: string, length: string, width: string): Promise<void> {
  await sheet(page).getByRole('button', { name: 'Add a vehicle' }).click()

  const form = vehicleForm(page)
  await form.getByLabel('Name').fill(name)
  await form.getByLabel('Length, feet').fill(length)
  await form.getByLabel('Width, feet').fill(width)

  await sheet(page).getByRole('button', { name: 'Done with this vehicle' }).click()
}

test('always offers the System Collection, and offers nothing to do to it', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // Always one of the choices, and the one being shown when nothing else is.
  const system = palette(page).getByRole('button', { name: 'Standard vehicles' })
  await expect(system).toHaveAttribute('aria-pressed', 'true')
  await expect(palette(page).getByRole('heading', { name: 'Standard vehicles' })).toBeVisible()

  await page.getByRole('button', { name: 'Collections' }).click()
  await expect(sheet(page)).toContainText('You have no collections of your own yet')

  // It is not a row here at all, so there is nothing to rename, delete or fill:
  // the sheet is only ever the visitor's own.
  await expect(sheet(page).getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await expect(sheet(page).getByLabel('Name')).toHaveCount(0)
  await expect(sheet(page).getByRole('button', { name: 'Add a vehicle' })).toHaveCount(0)

  await sheet(page).getByRole('button', { name: 'Done' }).click()

  // And its vehicles are still there to be placed, so the palette is never empty.
  await dragFromPalette(page, /Semi \+ 53 ft/, await middleOfTheMap(page))
  await expect(page.locator('path.placement')).toHaveCount(1)
})

test('makes a collection, names it, fills it, and keeps it', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  await makeCollection(page)
  await sheet(page).getByLabel('Name').fill('My fleet')

  // Named for now, renamed as soon as the box says so, and shown at once:
  // making one chooses it, so the palette is looking at the new collection.
  await expect(palette(page).getByRole('button', { name: 'My fleet' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(palette(page)).toContainText('Nothing in this collection yet')

  await addVehicle(page, 'Tow truck', '20', '8')

  // The vehicle is in the collection, read back the way it is published.
  const row = sheet(page).getByRole('listitem').filter({ hasText: 'Tow truck' })
  await expect(row).toContainText('20\'0" x 8\'0"')

  await sheet(page).getByRole('button', { name: 'Done' }).click()
  await expect(palette(page).getByRole('button', { name: 'Tow truck' })).toBeVisible()

  // And it is a vehicle like any other: it can be laid on the ground.
  await dragFromPalette(page, /Tow truck/, await middleOfTheMap(page))
  await expect(page.locator('path.placement')).toHaveCount(1)

  await settled(page)
  await page.reload()
  await page.getByRole('button', { name: 'Cupertino sample' }).click()
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // The collection is the visitor's, not the place's: it comes back, and it
  // comes back with its vehicles.
  await expect(page.locator('path.placement')).toHaveCount(1)
  await palette(page).getByRole('button', { name: 'My fleet' }).click()
  await expect(palette(page).getByRole('button', { name: 'Tow truck' })).toBeVisible()
})

test('asks first before deleting a collection, and the palette is never left empty', async ({
  page,
}) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  await makeCollection(page)
  await addVehicle(page, 'Tow truck', '20', '8')

  await sheet(page).getByLabel('Name').fill('My fleet')

  // Deleting is the one destructive thing here, so it asks.
  const row = sheet(page).getByRole('listitem').filter({ hasText: 'My fleet' })
  await row.getByRole('button', { name: 'Delete' }).click()
  await row.getByRole('button', { name: 'Keep it' }).click()
  await expect(sheet(page).getByRole('listitem').filter({ hasText: 'My fleet' })).toHaveCount(1)

  await row.getByRole('button', { name: 'Delete' }).click()
  await row.getByRole('button', { name: 'Delete it' }).click()

  await expect(sheet(page)).toContainText('You have no collections of your own yet')
  await expect(sheet(page).getByRole('button', { name: 'My fleet' })).toHaveCount(0)

  // The choice falls back to the System Collection rather than to nothing, and
  // its vehicles are still there: tidying up cannot empty the palette.
  await expect(palette(page).getByRole('button', { name: 'Standard vehicles' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(palette(page).getByRole('button', { name: /Semi \+ 53 ft/ })).toBeVisible()
})

test('corrects a vehicle in a collection, and removes it', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  await makeCollection(page)
  await addVehicle(page, 'Tow truck', '20', '8')

  const row = sheet(page).getByRole('listitem').filter({ hasText: 'Tow truck' })
  await row.getByRole('button', { name: 'Edit' }).click()

  // The same form a placed vehicle is corrected in, so a width is entered and
  // read back the way it always is.
  const form = vehicleForm(page)
  await expect(form.getByLabel('Name')).toHaveValue('Tow truck')
  await form.getByLabel('Width, feet').fill('9')
  await expect(row).toContainText('20\'0" x 9\'0"')

  await sheet(page).getByRole('button', { name: 'Done with this vehicle' }).click()

  await row.getByRole('button', { name: 'Remove' }).click()
  await expect(sheet(page)).toContainText('Nothing in this collection yet.')
  await expect(row).toHaveCount(0)
})

test('will not let a collection take the System Collection name, and says why', async ({
  page,
}) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  await makeCollection(page)
  await addVehicle(page, 'Tow truck', '20', '8')
  await sheet(page).getByLabel('Name').fill('My fleet')

  const name = sheet(page).getByLabel('Name')

  // Told whose name it is, rather than silently given a different one, and the
  // collection keeps the name it had.
  await name.fill('Standard vehicles')
  await expect(sheet(page).getByRole('alert')).toContainText('Standard vehicles')
  await expect(sheet(page).getByRole('alert')).toContainText('System Collection')
  await expect(sheet(page).getByRole('listitem').filter({ hasText: 'My fleet' })).toHaveCount(1)

  // The same name however it is typed: two rows that read the same are not a list.
  await name.fill('  standard   VEHICLES ')
  await expect(sheet(page).getByRole('alert')).toContainText('System Collection')

  await name.fill('My fleet')
  await expect(sheet(page).getByRole('alert')).toHaveCount(0)
})

test('shows where a received collection came from, and tracks nobody', async ({ page }) => {
  // A collection that arrived from somewhere else, as storage holds it: a name,
  // its vehicles, and the name of the collection it came from. There is no
  // account behind any of it, and nothing else about the sender is stored.
  await page.addInitScript(() => {
    localStorage.setItem(
      'lotplanner:collections',
      JSON.stringify([
        {
          id: 'received',
          name: 'Fleet A (2)',
          source: 'Fleet A',
          vehicles: [
            {
              name: 'Tow truck',
              shortLabel: 'Tow truck',
              widthInches: 96,
              lengthInches: 240,
              colour: 0x6b7280,
            },
          ],
        },
      ]),
    )
  })

  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  await palette(page).getByRole('button', { name: 'Fleet A (2)' }).click()

  // Descriptive provenance, shown plainly, so the visitor can tell their own
  // work from somebody else's.
  await expect(palette(page)).toContainText('Received from Fleet A')
  await dragFromPalette(page, /Tow truck/, await middleOfTheMap(page))
  await expect(page.locator('path.placement')).toHaveCount(1)

  await page.getByRole('button', { name: 'Collections' }).click()
  await expect(sheet(page)).toContainText('Received from Fleet A')
})

test('writes a collection before the page goes, rather than losing it', async ({ page }) => {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  await makeCollection(page)

  // Waited for deliberately not at all: the write is not due for a moment yet.
  expect(await collectionsRecord(page)).toBeNull()

  // A reload is the page being thrown away, and it has to write what is waiting
  // on the way out.
  await page.reload()
  await page.getByRole('button', { name: 'Cupertino sample' }).click()
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  await page.getByRole('button', { name: 'Collections' }).click()
  await expect(sheet(page).getByRole('listitem').filter({ hasText: 'Collection 1' })).toHaveCount(1)
})
