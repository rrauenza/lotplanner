/**
 * The courtesy line under the picture, in the service's own words rather than
 * ours.
 *
 * Read from the service's metadata and then remembered, so a Site opened
 * without a signal still says where its photograph came from. The string is
 * small, so localStorage is enough; if storage is unavailable the worst that
 * happens is the line is missing on an offline visit.
 */

const REMEMBERED = 'lotplanner.attribution'

let inFlight: Promise<string> | undefined

export async function loadAttribution(serviceUrl: string): Promise<string> {
  const remembered = readRemembered(serviceUrl)
  if (remembered !== null) {
    return remembered
  }

  inFlight ??= readFromService(serviceUrl)
  const attribution = await inFlight

  try {
    localStorage.setItem(`${REMEMBERED}.${serviceUrl}`, attribution)
  } catch {
    // Nothing to do about it: it will simply be read again next visit.
  }

  return attribution
}

function readRemembered(serviceUrl: string): string | null {
  try {
    return localStorage.getItem(`${REMEMBERED}.${serviceUrl}`)
  } catch {
    return null
  }
}

async function readFromService(serviceUrl: string): Promise<string> {
  const response = await fetch(`${serviceUrl}?f=json`)
  if (!response.ok) {
    throw new Error(`The imagery service answered ${String(response.status)}`)
  }

  const metadata: unknown = await response.json()
  const copyright = (metadata as { copyrightText?: unknown }).copyrightText

  // USGS imagery is public domain and crediting it is a courtesy, so an empty
  // answer is shown as nothing rather than as a broken line.
  return typeof copyright === 'string' ? copyright : ''
}
