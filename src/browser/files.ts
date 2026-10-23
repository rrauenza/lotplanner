/**
 * Moving a file between the app and the device.
 *
 * The two platform calls the file half of sharing needs, and nothing else: read
 * the text of a file the visitor chose, and offer text as a download. What is
 * *in* the text, what it is called, and what to say when it cannot be read are
 * the core's decisions (file.ts); this only moves bytes.
 *
 * Deliberately untested, along with the other adapters: a test here would be
 * testing the browser's download shelf rather than this app. What is worth
 * testing - the envelope, the name, the round trip and the refusals - is tested
 * in the core, and the end-to-end suite drives a real download and a real file
 * input.
 */

/** The text of a file the visitor picked. Rejects only if the file cannot be read. */
export function readFile(file: File): Promise<string> {
  return file.text()
}

/**
 * Offer some text to the device as a download called `name`.
 *
 * An object URL and a synthetic click, because that is the one way a page with
 * no server can hand a file over. The URL is released on the next tick rather
 * than straight away: a browser that has not yet begun the download can be left
 * with a URL that no longer resolves.
 */
export function downloadFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}
