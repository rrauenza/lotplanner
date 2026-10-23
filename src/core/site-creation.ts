import { orientation, type LatLng, type SiteFrame } from './geometry'
import type { Candidate } from './geocoding'
import type { Site } from './site'
import { tidy } from './text'

/**
 * Turning what the creator drew into a manifest entry, and back again.
 *
 * The creator mode finds a candidate, draws a rectangle over it and turns that
 * rectangle to match the space; what comes out is one entry for the manifest
 * (ADR 0006). None of that needs a browser, so it is decided here and the shell
 * only has to draw what these functions return.
 *
 * The **candidate**, not the rectangle, fixes the Site's origin. A Site is a
 * place before it is a shape: the frame is a guide that can be redrawn or left
 * out altogether, and a Site with no frame still has to open on the place rather
 * than on nothing (see `UNFRAMED_EXTENT_HALF_METRES`). So the origin is the
 * position the geocoder gave, the way the hand-written entry's origin is the
 * point its maintainer chose, and the frame is an offset from it - which is the
 * shape `extentForSite` and the rest of the app already read.
 */

/**
 * A Site as the creator form works on it: the candidate found for it and the
 * rectangle drawn over it. The same shape whether the form is adding a Site or
 * correcting one, so there is only one thing to build and one to show.
 *
 * `id` is present only when the form was opened on a Site already in the
 * manifest. A correction keeps that id rather than minting one from a possibly
 * different name, because a Site's saved Layouts are kept under its id (ADR
 * 0008) and a rename must not orphan a visitor's work.
 */
export interface SiteDraft {
  /** The candidate it was found at. The name here is what the creator named it. */
  readonly candidate: Candidate
  /** The rectangle, in ground metres from the place. A guide, never a limit. */
  readonly frame?: SiteFrame
  /** The identity of the Site being corrected, when there is one. */
  readonly id?: string
}

/**
 * The finest a manifest entry records: a centimetre of ground, and a tenth of a
 * degree.
 *
 * Both sit under what the picture can show - a pixel is about 30 cm (ADR 0001) -
 * and a rectangle drawn with a mouse arrives with eleven more digits of noise
 * than anything here can mean. Cutting that where the entry is written keeps a
 * committed number reading as a measurement rather than as arithmetic.
 */
const CENTIMETRES_PER_METRE = 100
const TENTHS_PER_DEGREE = 10

/**
 * The id a Site is listed under, spelled the way the manifest's ids are: a
 * name's letters and digits, joined by single dashes, in lower case.
 *
 * A name with none of those - punctuation, or a script this spelling cannot
 * carry - still has to produce an id, and `site` is the one that says nothing
 * about the place rather than something wrong about it.
 */
export function siteIdFor(name: string): string {
  const id = tidy(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return id === '' ? 'site' : id
}

/**
 * The manifest entry for what the creator has drawn, made distinct from the
 * Sites the manifest already holds.
 *
 * A name that collides is numbered rather than left alone, because the id is
 * what a Site's saved work is kept under: two Sites sharing one id would share
 * their Layouts, which is exactly the sort of quiet mixing-up the id exists to
 * prevent. A Site being corrected keeps its own id and so cannot collide with
 * itself.
 *
 * The candidate's address is read by no one here. A manifest entry has no field
 * for one - it is only ever how the search list told two candidates apart - so
 * the entry a creator commits carries the candidate's name and its position and
 * no more.
 */
export function manifestEntry(draft: SiteDraft, taken: readonly Site[]): Site {
  const name = siteName(draft.candidate.name)
  const origin = placedAt(draft.candidate.position)
  const frame = draft.frame === undefined ? undefined : measuredFrame(draft.frame)

  const entry: Site = {
    id: draft.id ?? distinctId(name, new Set(taken.map((site) => site.id))),
    name,
    origin,
  }

  return frame === undefined ? entry : { ...entry, frame }
}

/**
 * The entry as it is pasted into the manifest.
 *
 * JSON in shape and key order, written in the manifest's own spelling: single
 * quotes, two spaces to a level, one key to a line, and a trailing comma so the
 * entry can go anywhere in the list. A pasted entry then reads as the ones
 * around it do, and committing one is a diff of one entry.
 */
export function manifestEntryText(entry: Site): string {
  const lines = [
    '{',
    `  id: ${quoted(entry.id)},`,
    `  name: ${quoted(entry.name)},`,
    `  origin: { latitude: ${numberText(entry.origin.latitude)}, longitude: ${numberText(entry.origin.longitude)} },`,
  ]

  if (entry.frame !== undefined) {
    lines.push(
      '  frame: {',
      `    centre: { eastMetres: ${numberText(entry.frame.centre.eastMetres)}, northMetres: ${numberText(entry.frame.centre.northMetres)} },`,
      `    lengthMetres: ${numberText(entry.frame.lengthMetres)},`,
      `    widthMetres: ${numberText(entry.frame.widthMetres)},`,
      `    rotationDegrees: ${numberText(entry.frame.rotationDegrees)},`,
      '  },',
    )
  }

  lines.push('},')

  return lines.join('\n')
}

/**
 * What the form works in when it opens a Site that is already in the manifest.
 *
 * A Site has no address, so the place it stands for has only a name and a
 * position: there is nothing to invent an address from, and the manifest entry
 * a correction emits carries none either. Correcting a Site and emitting it
 * again therefore gives back exactly the Site it started as.
 */
export function draftFrom(site: Site): SiteDraft {
  const draft: SiteDraft = {
    id: site.id,
    candidate: { name: site.name, position: site.origin },
  }

  return site.frame === undefined ? draft : { ...draft, frame: site.frame }
}

/**
 * An id for this name that the manifest is not already using.
 *
 * Numbered from two, because the second Site of a name is the first one that
 * needs a number, and it keeps counting so that a third name still lands
 * somewhere free however many of the earlier numbers are taken.
 */
function distinctId(name: string, taken: ReadonlySet<string>): string {
  const base = siteIdFor(name)

  if (!taken.has(base)) {
    return base
  }

  for (let number = 2; ; number += 1) {
    const candidate = `${base}-${String(number)}`

    if (!taken.has(candidate)) {
      return candidate
    }
  }
}

/** The name an entry is listed under, or an error saying there is not one. */
function siteName(raw: string): string {
  const name = tidy(raw)

  if (name === '') {
    throw new Error('A Site needs a name.')
  }

  return name
}

/** The origin an entry points at, checked because nothing downstream can use a NaN. */
function placedAt(position: LatLng): LatLng {
  if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) {
    throw new Error('A Site needs a position on the earth.')
  }

  return { latitude: position.latitude, longitude: position.longitude }
}

/**
 * A drawn rectangle as the manifest records it: to the centimetre, at an angle
 * in the half turn a person reads, so that an entry says which way the space
 * faces rather than which way the last drag happened to sweep.
 */
function measuredFrame(frame: SiteFrame): SiteFrame {
  if (!(frame.lengthMetres > 0) || !(frame.widthMetres > 0)) {
    throw new Error('A Site Frame needs a length and a width.')
  }
  if (!Number.isFinite(frame.rotationDegrees)) {
    throw new Error('A Site Frame needs an angle.')
  }

  return {
    centre: {
      eastMetres: toCentimetres(frame.centre.eastMetres),
      northMetres: toCentimetres(frame.centre.northMetres),
    },
    lengthMetres: toCentimetres(frame.lengthMetres),
    widthMetres: toCentimetres(frame.widthMetres),
    rotationDegrees: toTenths(orientation(frame.rotationDegrees)),
  }
}

/** Rounded for the manifest, not for the app: the drawn value stands until then. */
function toCentimetres(metres: number): number {
  if (!Number.isFinite(metres)) {
    throw new Error('A Site Frame needs distances that are numbers.')
  }

  return Math.round(metres * CENTIMETRES_PER_METRE) / CENTIMETRES_PER_METRE
}

function toTenths(degrees: number): number {
  return Math.round(degrees * TENTHS_PER_DEGREE) / TENTHS_PER_DEGREE
}

/** A name as a single-quoted string, escaped so an apostrophe cannot end it early. */
function quoted(text: string): string {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** A number as the shortest text that reads back as itself. */
function numberText(value: number): string {
  return String(value)
}
