import { decodeArtifactFields, encodeArtifactFields, type Artifact, type Reading } from './codec'
import { tidy } from './text'

/**
 * The file's own half of sharing: an Artifact written whole, to be kept or sent.
 *
 * A file is the third place an Artifact travels from, after a link and storage,
 * and it is deliberately not spelled the way a link is. A link deflates and
 * base64urls to fit a URL fragment; a file has no such budget, so it is **plain
 * indented JSON** - a person can open it, read that it is a lotplanner layout
 * called "Option A", and `jq` it. The size a file loses by not being compressed
 * is worth less than the size it gains by being legible.
 *
 * What a file does share with a link is the artifact itself: the body is the
 * codec's own versioned tuple shape (codec.ts), reached through the codec's own
 * reader. That is on purpose. A file *could* have been spelled as an object with
 * named fields, which would read better still - but it would be a second shape
 * claiming the same version number, and the day the two disagreed about what
 * "version 1" means is the day one of them misreads the other. ADR 0009 rejects
 * two counters for one envelope for the same reason. So legibility is bought
 * where it is free: a named envelope and whitespace, never a second shape.
 *
 * The envelope carries one thing a link cannot: the Layout's **name**. A link
 * carries the arrangement without a name (ADR 0008), because a link is a budget
 * of characters and a name is not the arrangement. A file has room, and an
 * imported Layout that keeps the name it was exported under is the point of
 * exporting work to keep.
 *
 * The version field lives in the artifact, not the envelope: it is the codec's
 * one counter, and the envelope has no second one to disagree with it. Envelope
 * fields are additive - a reader ignores ones it has never heard of - so a later
 * app can add one without stranding an earlier one.
 */

/** What a file says it is, so one that is not ours is refused by name. */
export const FILE_FORMAT = 'lotplanner'

/** What a file is offered as: still plainly JSON, and plainly ours. */
export const FILE_EXTENSION = '.lotplanner.json'

/** Said when the text is not a file this app made. */
export const NOT_A_FILE =
  'This does not look like a lotplanner file. It may be a different kind of file, or a download that did not finish.'

/** Said when the file is one of ours but its contents cannot be read. */
export const UNREADABLE_FILE =
  'This lotplanner file could not be read. It may be damaged or incomplete. Nothing here has been changed.'

/** Said when the file was written by a newer app than the one reading it. */
export const TOO_NEW_FILE =
  'This file was made by a newer version of the app than the one you are using. Open it in an up-to-date app, or ask the sender to export it again.'

/** What reading a file gave back. A name only when the file carried one. */
export type FileRead =
  | { readonly kind: 'ok'; readonly artifact: Artifact; readonly name: string | undefined }
  | { readonly kind: 'unreadable'; readonly message: string }
  | { readonly kind: 'too-new'; readonly message: string }

/**
 * An artifact as a file: legible JSON, with the Layout's name when there is one.
 *
 * The name is for a Layout, whose name belongs to the saved work rather than to
 * the arrangement and so is not in the artifact. A Collection names itself
 * inside its artifact, so nothing is passed for one.
 */
export function encodeFile(artifact: Artifact, name?: string): string {
  return JSON.stringify(
    {
      format: FILE_FORMAT,
      name,
      artifact: encodeArtifactFields(artifact),
    },
    null,
    2,
  )
}

/** The artifact a file holds, or why it could not be read. */
export function decodeFile(text: string, reading: Reading = {}): FileRead {
  const parsed = parseObject(text)

  if (parsed?.['format'] !== FILE_FORMAT) {
    return { kind: 'unreadable', message: NOT_A_FILE }
  }

  const fields = parsed['artifact']

  if (!Array.isArray(fields)) {
    return { kind: 'unreadable', message: NOT_A_FILE }
  }

  // The codec reads the body, so the version field, the migrations, the
  // tolerance of unknown fields and the too-new refusal are its decisions here
  // exactly as they are for a link - a file cannot drift from a link about what
  // a version means, because there is only one reader.
  const decoded = decodeArtifactFields(fields, reading)

  if (decoded.kind === 'too-new') {
    // The codec's own sentence is about a link, so a file says its own.
    return { kind: 'too-new', message: TOO_NEW_FILE }
  }
  if (decoded.kind === 'unreadable') {
    return { kind: 'unreadable', message: UNREADABLE_FILE }
  }

  return { kind: 'ok', artifact: decoded.artifact, name: nameOf(parsed['name']) }
}

/**
 * What to offer the download as.
 *
 * Reduced to something every file system takes and a person can read: lower
 * case, runs of anything else collapsed to a hyphen. A name that leaves nothing
 * behind still names a file, because a download has to be called something.
 */
export function fileNameFor(name: string): string {
  const stem = tidy(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const short = stem.slice(0, 60).replace(/-+$/g, '')

  return `${short === '' ? 'layout' : short}${FILE_EXTENSION}`
}

/** A name read out of an envelope, or nothing when it is absent or not a name. */
function nameOf(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const tidied = tidy(value)

  return tidied === '' ? undefined : tidied
}

/** The envelope as a JSON object, or nothing when the text is not one. */
function parseObject(text: string): Record<string, unknown> | undefined {
  let value: unknown

  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }

  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
