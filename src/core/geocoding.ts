import type { LatLng } from './geometry'
import { tidy } from './text'

/**
 * Finding a place by its address: the creator mode's first step, and the only
 * thing in the app that talks to anyone but the imagery service (ADR 0006).
 * Visitors never reach it, because a visitor picks a Site from the manifest.
 *
 * Only the answer is decided here. Which service is asked, what the url looks
 * like and how the app identifies itself belong to the browser adapter, so
 * nothing in the core names a service or builds a request. What an answer means
 * is a decision, and that is what this module makes.
 */

/**
 * What the search offered for a Site: a name, where it is, and usually its full
 * address to tell it from the one beside it.
 *
 * A candidate rather than a place, because "place" is the word for what a Site
 * is: a search answer only becomes one when the creator confirms it and draws
 * the frame over it. A Site carries no address - the manifest entry has no field
 * for one - so a candidate standing for a Site already in the manifest has a
 * name and a position and nothing else.
 */
export interface Candidate {
  /** The short label, which is what the Site will be listed under if not renamed. */
  readonly name: string
  /** The whole address, which is what tells two candidates with one name apart. */
  readonly address?: string
  readonly position: LatLng
}

/**
 * What the geocoder has to be able to do.
 *
 * The adapter that answers this is the only code in the app that reaches a
 * third party, and it identifies the app the way a keyless service asks: with
 * the page's own referer, which the browser sends anyway, rather than with a
 * name grafted onto every request. The service publishes a pace of about one
 * search a second, which a tool used a few times a week meets without trying;
 * anything that asked repeatedly - a search as you type, say - would not, so
 * the pacing belongs to whoever calls this rather than here.
 */
export interface GeocodingEffects {
  /** The geocoder's own answer, unread: what it means is decided below. */
  search(query: string): Promise<unknown>
}

/**
 * What the creator mode is showing. Exactly one of these at a time, so the form
 * can render the whole of it and never a combination that does not exist.
 */
export type GeocodingState =
  | { readonly status: 'idle' }
  | { readonly status: 'found'; readonly candidates: readonly Candidate[] }
  | { readonly status: 'failed'; readonly message: string }

export const GEOCODING_IDLE: GeocodingState = { status: 'idle' }

/**
 * The candidates in a geocoder's answer.
 *
 * The answer is a list of records, each carrying a position and something to
 * read. A position is `lat` and `lon`, sent as strings by most geocoders and
 * taken here as either, because the string form is the one that arrives and
 * coercing it at the boundary saves every caller from doing it. The label is
 * the full address in `display_name`, with the short `name` beside it where the
 * service has one; with only the address, its part before the first comma
 * stands in as the name, since a list of whole addresses is unreadable and a
 * list of names is the point.
 *
 * Nothing usable comes back as an empty list rather than as an error. An
 * address that matches nothing is an ordinary answer, and a record missing its
 * position or its label is dropped rather than allowed to break the rest.
 */
export function candidatesFrom(response: unknown): readonly Candidate[] {
  if (!Array.isArray(response)) {
    return []
  }

  const candidates: Candidate[] = []

  for (const record of response) {
    const candidate = candidateFrom(record)

    if (candidate !== undefined) {
      candidates.push(candidate)
    }
  }

  return candidates
}

/**
 * The candidates for a search, or a state saying plainly that the search failed.
 * Failing is reported rather than thrown, because a blank result list and a
 * broken lookup read the same to whoever is standing there looking at them.
 *
 * A query that tidies away to nothing is not sent. The service is shared and
 * rate-limited, and asking it about nothing spends a request on an answer
 * nobody wanted.
 */
export async function findCandidates(
  query: string,
  effects: GeocodingEffects,
): Promise<GeocodingState> {
  const search = tidy(query)

  if (search === '') {
    return { status: 'found', candidates: [] }
  }

  try {
    return { status: 'found', candidates: candidatesFrom(await effects.search(search)) }
  } catch {
    return { status: 'failed', message: 'The place search did not answer.' }
  }
}

function candidateFrom(record: unknown): Candidate | undefined {
  if (!isRecord(record)) {
    return undefined
  }

  const position = positionFrom(record)
  const address = labelFrom(record['display_name'])
  const short = labelFrom(record['name'])

  if (position === undefined || (address === undefined && short === undefined)) {
    return undefined
  }

  const name = short ?? nameFrom(address ?? '')

  return address === undefined ? { name, position } : { name, address, position }
}

/** A position from the two fields a geocoder gives it in, if both are usable. */
function positionFrom(record: Record<string, unknown>): LatLng | undefined {
  const latitude = numberFrom(record['lat'])
  const longitude = numberFrom(record['lon'])

  if (latitude === undefined || latitude < -90 || latitude > 90) {
    return undefined
  }
  if (longitude === undefined || longitude < -180 || longitude > 180) {
    return undefined
  }

  return { latitude, longitude }
}

/** A number whether it arrives as one or as the string a geocoder usually sends. */
function numberFrom(value: unknown): number | undefined {
  const number = typeof value === 'string' ? Number(value) : value

  return typeof number === 'number' && Number.isFinite(number) ? number : undefined
}

/** A label worth showing, or nothing: whitespace is not a name for somewhere. */
function labelFrom(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const label = tidy(value)

  return label === '' ? undefined : label
}

/** The part of an address before the first comma: as short as a list row can be. */
function nameFrom(address: string): string {
  const [first] = address.split(',')
  const label = tidy(first ?? '')

  return label === '' ? address : label
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
