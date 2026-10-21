/**
 * Talking to the imagery service, in one place so both callers refuse a bad
 * answer the same way.
 *
 * A non-ok reply is a failure rather than a result to be interpreted: the
 * service returns 502s and 504s of its own accord, and a caller that treated one
 * as a picture or as metadata would put something untrue on screen.
 */
export async function fetchFromService(url: string): Promise<Response> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`The imagery service answered ${String(response.status)}`)
  }
  return response
}
