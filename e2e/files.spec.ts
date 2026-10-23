import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { dragFromPalette, middleOfTheMap, openTheSite, serveImagery } from './harness.js'

/**
 * Exporting a Layout or a Collection to a file, and importing one back.
 *
 * The envelope, the name and the version discipline are core decisions, tested
 * in `src/core/file.test.ts`. What this suite is for is the half a pure core
 * cannot reach: a real download whose bytes are read back, a real file input,
 * and the storage on either side of an import - so that "it reports plainly"
 * and "existing work is intact" are shown against a browser rather than argued.
 */

/** The one file input, hidden behind the header's Import button. */
function fileInput(page: Page): ReturnType<Page['locator']> {
  return page.locator('input[type="file"]')
}

/** The file the app offered when Export was clicked, read back as text. */
async function exportLayoutFile(page: Page): Promise<{ name: string; text: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ])

  const path = await download.path()

  return { name: download.suggestedFilename(), text: readFileSync(path, 'utf8') }
}

/** Hand the app a file, as a visitor choosing one from their device would. */
async function importFile(
  page: Page,
  text: string,
  name = 'imported.lotplanner.json',
): Promise<void> {
  await fileInput(page).setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
}

/** The Site's saved record as the browser holds it, or null before anything is written. */
async function savedRecord(page: Page, siteId: string): Promise<string | null> {
  return page.evaluate((id) => localStorage.getItem(`lotplanner:saved:${id}`), siteId)
}

/** The visitor's collections as the browser holds them. */
async function collectionsRecord(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('lotplanner:collections'))
}

/** What became of the last import, as it is written on screen. */
function notice(page: Page): ReturnType<Page['locator']> {
  return page.locator('p.notice')
}

/** A page at the fixture Site, ready to work on, in a context of its own. */
async function someoneWorking(page: Page): Promise<void> {
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()
}

function sheet(page: Page): ReturnType<Page['locator']> {
  return page.getByRole('region', { name: 'Your collections' })
}

/** Make a collection of the visitor's own, named, with one vehicle in it. */
async function makeCollection(page: Page, name: string, vehicleName: string): Promise<void> {
  await page.getByRole('button', { name: 'Collections' }).click()
  await sheet(page).getByRole('button', { name: 'New collection' }).click()
  await sheet(page).getByLabel('Name').fill(name)

  await sheet(page).getByRole('button', { name: 'Add a vehicle' }).click()

  const form = sheet(page).locator('section[aria-label="The selected vehicle"]')
  await form.getByLabel('Name').fill(vehicleName)
  await form.getByLabel('Length, feet').fill('20')
  await form.getByLabel('Width, feet').fill('8')

  await sheet(page).getByRole('button', { name: 'Done with this vehicle' }).click()
}

/** The file the shown collection was offered as. */
async function exportCollectionFile(page: Page): Promise<{ name: string; text: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    sheet(page).getByRole('button', { name: 'Export this collection' }).click(),
  ])

  const path = await download.path()

  return { name: download.suggestedFilename(), text: readFileSync(path, 'utf8') }
}

test('exports a Layout as a readable file, not another link', async ({ page }) => {
  await someoneWorking(page)

  await dragFromPalette(page, /Semi \+ 53 ft/, await middleOfTheMap(page))
  await expect(page.locator('path.placement')).toHaveCount(1)

  const { name, text } = await exportLayoutFile(page)

  // Named so a person can see whose it is and open it, and indented so it reads
  // as a document rather than one line of characters.
  expect(name).toMatch(/\.lotplanner\.json$/)
  expect(text).toContain('\n')

  const parsed = JSON.parse(text) as { format: string; name: string; artifact: unknown[] }

  expect(parsed.format).toBe('lotplanner')
  expect(parsed.name).toBe('Layout 1')
  expect(parsed.artifact[0]).toBe('layout')
  // The one version field, carried in the artifact where a link carries it too.
  expect(parsed.artifact[1]).toBe(1)
  expect(parsed.artifact[8]).toHaveLength(1)
})

test('imports a Layout file into a stranger, showing what the sender saw and keeping it', async ({
  page,
  browser,
}) => {
  await someoneWorking(page)

  const middle = await middleOfTheMap(page)
  await dragFromPalette(page, /Semi \+ 53 ft/, { x: middle.x - 60, y: middle.y })
  await dragFromPalette(page, /Coach/, { x: middle.x + 60, y: middle.y })
  await expect(page.locator('path.placement')).toHaveCount(2)

  const { name, text } = await exportLayoutFile(page)

  // A stranger: a context of its own, with no stored work and nothing of the
  // sender's, arriving at the app before any place is chosen.
  const stranger = await browser.newContext()
  const recipient = await stranger.newPage()
  await serveImagery(recipient)
  await recipient.goto('./')

  await importFile(recipient, text, name)

  // The file carries its own Site, so the photograph and the arrangement both
  // open without the manifest, an account or an install.
  await expect(recipient.locator('img.leaflet-image-layer')).toBeVisible()
  await expect(recipient.locator('path.placement')).toHaveCount(2)
  await expect(notice(recipient)).toContainText('Imported')

  // And, unlike a link, the file is kept: a named Layout for its Site.
  await recipient.waitForTimeout(700)

  const layouts = JSON.parse((await savedRecord(recipient, 'cupertino-sample')) ?? '[]') as {
    name: string
    layout: { placements: unknown[] }
  }[]

  expect(layouts).toHaveLength(1)
  expect(layouts[0]?.name).toBe('Layout 1')
  expect(layouts[0]?.layout.placements).toHaveLength(2)

  await stranger.close()
})

test('an imported Layout is added, and everything already saved is untouched', async ({
  page,
  browser,
}) => {
  await someoneWorking(page)

  // The recipient has a Layout of their own for this place, and it is saved.
  await dragFromPalette(page, /Semi \+ 53 ft/, await middleOfTheMap(page))
  await expect(page.locator('path.placement')).toHaveCount(1)
  await page.waitForTimeout(700)

  const before = await savedRecord(page, 'cupertino-sample')
  expect(before).not.toBeNull()

  // A file for the same place with a different arrangement, made elsewhere.
  const sender = await browser.newContext()
  const senderPage = await sender.newPage()
  await someoneWorking(senderPage)

  const where = await middleOfTheMap(senderPage)
  await dragFromPalette(senderPage, /Coach/, { x: where.x - 50, y: where.y })
  await dragFromPalette(senderPage, /SUV/, { x: where.x + 50, y: where.y })
  await expect(senderPage.locator('path.placement')).toHaveCount(2)

  const { name, text } = await exportLayoutFile(senderPage)
  await sender.close()

  await importFile(page, text, name)
  await expect(page.locator('path.placement')).toHaveCount(2)
  await page.waitForTimeout(700)

  const after = JSON.parse((await savedRecord(page, 'cupertino-sample')) ?? '[]') as {
    name: string
    layout: { placements: unknown[] }
  }[]

  expect(after).toHaveLength(2)
  // The arrival is at the front, and its name is freed of the collision rather
  // than taking the one already here.
  expect(after[0]?.name).toBe('Layout 1 (2)')
  expect(after[0]?.layout.placements).toHaveLength(2)
  // The proof: what was already here is byte for byte what it was.
  expect(after[1]).toEqual((JSON.parse(before ?? '[]') as unknown[])[0])
})

test('opens and keeps a Layout for a place the manifest has never heard of', async ({ page }) => {
  await someoneWorking(page)

  await dragFromPalette(page, /Semi \+ 53 ft/, await middleOfTheMap(page))
  await expect(page.locator('path.placement')).toHaveCount(1)

  const { text } = await exportLayoutFile(page)
  const parsed = JSON.parse(text) as { name: string; artifact: unknown[] }

  // A Site only a file (or a link) could bring: this build does not carry it.
  parsed.artifact[2] = 'somewhere-else'
  parsed.artifact[3] = 'Somewhere else'
  parsed.artifact[4] = [51.5, -0.12]
  parsed.name = 'Their option'

  await importFile(page, JSON.stringify(parsed))

  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()
  await expect(page.locator('path.placement')).toHaveCount(1)
  await expect(notice(page)).toContainText('Somewhere else')
  await expect(notice(page)).toContainText('Their option')

  // It is not in the picker, because the manifest is the list and this is not on
  // it - yet its work is kept under its own id.
  await expect(page.getByRole('button', { name: 'Somewhere else' })).toHaveCount(0)

  await page.waitForTimeout(700)

  const layouts = JSON.parse((await savedRecord(page, 'somewhere-else')) ?? '[]') as {
    name: string
  }[]

  expect(layouts).toHaveLength(1)
  expect(layouts[0]?.name).toBe('Their option')
})

test('an imported Collection is a new collection, and never overwrites one', async ({
  page,
  browser,
}) => {
  await someoneWorking(page)

  // The sender's fleet, exported as a file.
  const sender = await browser.newContext()
  const senderPage = await sender.newPage()
  await someoneWorking(senderPage)
  await makeCollection(senderPage, 'Fleet A', 'Tow truck')

  const { name, text } = await exportCollectionFile(senderPage)
  await sender.close()

  // The recipient already has a collection by the same name.
  await makeCollection(page, 'Fleet A', 'Bus')
  await page.waitForTimeout(700)

  const before = JSON.parse((await collectionsRecord(page)) ?? '[]') as unknown[]
  expect(before).toHaveLength(1)

  await importFile(page, text, name)
  await expect(notice(page)).toContainText('Fleet A (2)')
  await page.waitForTimeout(700)

  const after = JSON.parse((await collectionsRecord(page)) ?? '[]') as {
    name: string
    source?: string
    vehicles: { name: string }[]
  }[]

  expect(after).toHaveLength(2)

  const mine = after.find((each) => each.name === 'Fleet A')
  const theirs = after.find((each) => each.name === 'Fleet A (2)')

  // The recipient's own is byte for byte what it was, and the arrival is a
  // separate fork carrying the sender's vehicles and the name they came from.
  expect(mine).toEqual(before[0])
  expect(theirs?.source).toBe('Fleet A')
  expect(theirs?.vehicles[0]?.name).toBe('Tow truck')
})

test('a corrupt, unrecognised or too-new file reports plainly and changes nothing', async ({
  page,
}) => {
  await someoneWorking(page)

  // Some real work, so "changes nothing" has something to be checked against.
  await dragFromPalette(page, /Semi \+ 53 ft/, await middleOfTheMap(page))
  await expect(page.locator('path.placement')).toHaveCount(1)
  await page.waitForTimeout(700)

  const saved = await savedRecord(page, 'cupertino-sample')
  const collections = await collectionsRecord(page)

  // A real one, to bend out of reach afterwards.
  const { text } = await exportLayoutFile(page)

  // Not JSON at all.
  await importFile(page, 'this is not a file')
  await expect(notice(page)).toContainText('lotplanner file')

  // JSON, but not ours.
  await importFile(page, '{"hello":"world"}')
  await expect(notice(page)).toContainText('lotplanner file')

  // One of ours, but damaged.
  await importFile(page, '{"format":"lotplanner","artifact":["layout",1]}')
  await expect(notice(page)).toContainText('could not be read')

  // Valid, but written by a newer app than this one.
  const ahead = JSON.parse(text) as { artifact: unknown[] }

  ahead.artifact[1] = 999
  await importFile(page, JSON.stringify(ahead))
  await expect(notice(page)).toContainText('newer version')

  // Nothing moved: not the work on the ground, and not what storage holds.
  await expect(page.locator('path.placement')).toHaveCount(1)
  expect(await savedRecord(page, 'cupertino-sample')).toBe(saved)
  expect(await collectionsRecord(page)).toBe(collections)
})
