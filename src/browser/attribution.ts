import { fetchFromService } from './service'

/**
 * The courtesy line under the picture, in the service's own words rather than
 * ours.
 *
 * Read from the service's metadata and then remembered, so a Site opened with no
 * signal still says where its photograph came from. The string is small, so
 * localStorage is enough; if storage is unavailable the worst that happens is
 * the line is missing on an offline visit.
 */

const REMEMBERED = 'lotplanner.attribution'

let inFlight: Promise<string> | undefined

export async function loadAttribution(serviceUrl: string): Promise<string> {
  const remembered = readRemembered(serviceUrl)
  if (remembered !== null) {
    return remembered
  }

  const attribution = await (inFlight ??= readFromService(serviceUrl).catch((cause: unknown) => {
    // Forget the failure so the next visit tries again. The service returns 502s
    // of its own accord, and remembering one would leave the credit line
    // permanently missing for the rest of the session.
    inFlight = undefined
    throw cause
  }))

  if (attribution !== '') {
    remember(serviceUrl, attribution)
  }

  return attribution
}

/**
 * The credit line, once it is known, and the way to stop caring about it.
 *
 * The shape an `$effect` wants: it returns the teardown, and nothing is set
 * after the caller has gone. A credit line that cannot be read is not an error
 * the picture should suffer for, so the failure is swallowed - the map shows
 * either way.
 */
export function followAttribution(serviceUrl: string, receive: (text: string) => void): () => void {
  let abandoned = false

  void loadAttribution(serviceUrl)
    .then((text) => {
      if (!abandoned) {
        receive(text)
      }
    })
    .catch(() => {
      // No credit line beats a wrong one, and the picture still shows.
    })

  return () => {
    abandoned = true
  }
}

function readRemembered(serviceUrl: string): string | null {
  try {
    return localStorage.getItem(`${REMEMBERED}.${serviceUrl}`)
  } catch {
    return null
  }
}

function remember(serviceUrl: string, attribution: string): void {
  try {
    localStorage.setItem(`${REMEMBERED}.${serviceUrl}`, attribution)
  } catch {
    // Nothing to be done about it: it will simply be read again next visit.
  }
}

async function readFromService(serviceUrl: string): Promise<string> {
  const response = await fetchFromService(`${serviceUrl}?f=json`)
  const metadata: unknown = await response.json()
  const copyright = (metadata as { copyrightText?: unknown }).copyrightText

  // USGS imagery is public domain and crediting it is a courtesy, so an empty
  // answer is shown as nothing rather than as a broken line - and is not
  // remembered, so a later answer that does have it is not masked.
  return typeof copyright === 'string' ? copyright : ''
}
