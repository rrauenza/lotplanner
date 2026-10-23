import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

import { dragFromPalette, middleOfTheMap, openTheSite, serveImagery } from './harness.js'

/**
 * Sharing a Layout as a link, and opening one.
 *
 * The link is built in the pure core and tested there; the *compression* is the
 * browser's own `CompressionStream('deflate-raw')`, so this is where the two are
 * shown to meet for real. Web Share is deliberately left alone - a headless
 * browser has no share sheet, so a test could only prove the fallback - but the
 * fallback is the path the app offers on every screen anyway, and the link it
 * puts there is what these tests read and open.
 */

/**
 * A browser with no share sheet, so the clipboard fallback and the on-screen
 * link are what run. Share is deliberately not faked into succeeding: what is
 * under test is the link, not the platform's dialog.
 */
async function withoutWebShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  })
}

/** Click Share, and read the link the app put on screen. */
async function shareLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Share' }).click()

  const link = page.getByLabel('Link to this Layout')
  await expect(link).toBeVisible()

  return link.inputValue()
}

/** Where each placed vehicle is drawn, in the pixels the page drew it in. */
async function arrangement(page: Page): Promise<{ x: number; y: number }[]> {
  return page.locator('path.placement').evaluateAll((paths) =>
    paths.map((path) => {
      const box = path.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }),
  )
}

/** The Site's saved record as the browser holds it, if there is one. */
async function savedRecord(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((each) => each.includes('cupertino-sample'))

    return key === undefined ? null : localStorage.getItem(key)
  })
}

/** The Layouts inside the Site's saved record. */
async function savedLayouts(page: Page): Promise<unknown[]> {
  const record = await savedRecord(page)

  return record === null ? [] : (JSON.parse(record) as unknown[])
}

/** A page at the fixture Site, ready to work on, in a context of its own. */
async function someoneWorking(
  browser: Browser,
): Promise<{ readonly context: BrowserContext; readonly page: Page }> {
  const context = await browser.newContext()
  const page = await context.newPage()

  await withoutWebShare(page)
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  return { context, page }
}

test('opens a shared link for a stranger, showing exactly the arrangement the sender saw', async ({
  page,
  browser,
}) => {
  await withoutWebShare(page)
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  const middle = await middleOfTheMap(page)
  await dragFromPalette(page, /Semi \+ 53 ft/, { x: middle.x - 70, y: middle.y })
  await dragFromPalette(page, /Coach/, { x: middle.x + 70, y: middle.y - 40 })
  await expect(page.locator('path.placement')).toHaveCount(2)

  const sent = await arrangement(page)
  const link = await shareLink(page)

  expect(link).toContain('#layout/')

  // A stranger: a context of its own, with no stored work and nothing of the
  // sender's, which is what "no account and no install" has to mean.
  const stranger = await browser.newContext()
  const recipient = await stranger.newPage()
  await serveImagery(recipient)
  await recipient.goto(link)

  await expect(recipient.locator('img.leaflet-image-layer')).toBeVisible()
  await expect(recipient.locator('path.placement')).toHaveCount(2)

  const seen = await arrangement(recipient)
  expect(seen).toHaveLength(sent.length)

  // The same photograph, fitted the same way, with the shared positions carried
  // to the centimetre: the difference is well under a pixel.
  for (const [index, where] of sent.entries()) {
    expect(Math.abs((seen[index]?.x ?? 0) - where.x)).toBeLessThan(2)
    expect(Math.abs((seen[index]?.y ?? 0) - where.y)).toBeLessThan(2)
  }

  await stranger.close()
})

test("opening a shared link leaves the recipient's own saved work exactly as it was", async ({
  page,
  browser,
}) => {
  await withoutWebShare(page)
  await serveImagery(page)
  await openTheSite(page)
  await expect(page.locator('img.leaflet-image-layer')).toBeVisible()

  // The recipient has a Layout of their own for this place, and it is saved.
  await dragFromPalette(page, /Semi \+ 53 ft/, await middleOfTheMap(page))
  await expect(page.locator('path.placement')).toHaveCount(1)
  await page.waitForTimeout(700)

  const theirs = await savedRecord(page)
  expect(theirs).not.toBeNull()
  expect(await savedLayouts(page)).toHaveLength(1)

  // A link for the same place with a different arrangement, made by somebody
  // else entirely.
  const sender = await someoneWorking(browser)
  const where = await middleOfTheMap(sender.page)
  await dragFromPalette(sender.page, /Semi \+ 53 ft/, { x: where.x - 70, y: where.y })
  await dragFromPalette(sender.page, /Coach/, { x: where.x + 70, y: where.y })
  await expect(sender.page.locator('path.placement')).toHaveCount(2)
  const link = await shareLink(sender.page)

  // The recipient opens it by pasting the link into the page they already have
  // open. Nothing of theirs is written: their saved work is read so that a later
  // edit can join it, but the shared arrangement is not saved over it.
  await page.goto(link)
  await expect(page.locator('path.placement')).toHaveCount(2)
  await page.waitForTimeout(700)

  expect(await savedRecord(page)).toBe(theirs)

  // Editing the arrival then joins their work rather than replacing it: a second
  // Layout appears beside the one they already had, and theirs is untouched.
  await dragFromPalette(page, /SUV/, await middleOfTheMap(page))
  await expect(page.locator('path.placement')).toHaveCount(3)
  await page.waitForTimeout(700)

  const originally = (JSON.parse(theirs ?? '[]') as unknown[])[0]
  const both = await savedLayouts(page)

  expect(both).toHaveLength(2)
  // Theirs is still there, untouched, beside the arrival that was just edited.
  expect(both[1]).toEqual(originally)

  await sender.context.close()
})

test('a recipient can edit the arrangement and share it on again', async ({ browser }) => {
  const sender = await someoneWorking(browser)
  await dragFromPalette(sender.page, /Semi \+ 53 ft/, await middleOfTheMap(sender.page))
  await expect(sender.page.locator('path.placement')).toHaveCount(1)
  const link = await shareLink(sender.page)

  const recipientContext = await browser.newContext()
  const recipient = await recipientContext.newPage()
  await withoutWebShare(recipient)
  await serveImagery(recipient)
  await recipient.goto(link)
  await expect(recipient.locator('path.placement')).toHaveCount(1)

  // The recipient revises it and sends it back.
  await dragFromPalette(recipient, /Coach/, await middleOfTheMap(recipient))
  await expect(recipient.locator('path.placement')).toHaveCount(2)
  const second = await shareLink(recipient)

  expect(second).not.toBe(link)

  // What was sent on is the revised arrangement, and it opens for a third party.
  const thirdContext = await browser.newContext()
  const third = await thirdContext.newPage()
  await serveImagery(third)
  await third.goto(second)
  await expect(third.locator('img.leaflet-image-layer')).toBeVisible()
  await expect(third.locator('path.placement')).toHaveCount(2)

  await thirdContext.close()
  await recipientContext.close()
  await sender.context.close()
})
