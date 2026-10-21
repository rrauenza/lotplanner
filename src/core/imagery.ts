import type { Extent, MercatorBounds } from './geometry'

/** The National Map's NAIP image service, which needs no key. */
export const USGS_NAIP_SERVICE_URL =
  'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer'

/** A photograph, so JPEG: PNG would be several times the bytes for no gain. */
const FORMAT = 'jpeg'

/** Stated by number rather than by name, so it cannot drift with a map library. */
const WEB_MERCATOR_WKID = '3857'

export interface ImagerySize {
  readonly width: number
  readonly height: number
  /** The ground resolution actually obtained, which may be coarser than native. */
  readonly metresPerPixel: number
}

/**
 * How many pixels to ask for: as close to the imagery's own resolution as the
 * service will give, and never finer than that.
 *
 * The service refuses a request past its pixel cap rather than quietly shrinking
 * it, so an extent needing more pixels is asked for at a coarser resolution and
 * the picture is softer. Losing detail beats losing the Site, and for a space
 * seen from 0.3 m the difference is not what decides whether a coach fits.
 *
 * The width and height come from the one extent and the one resolution, so their
 * ratio already matches the extent's. That matters: the service *expands* a bbox
 * whose aspect does not match the size it was given, and the map then places the
 * picture by the bbox it asked for, so a mismatch would shift everything.
 */
export function imagerySize(
  ground: Pick<Extent, 'halfEastMetres' | 'halfNorthMetres'>,
  nativeMetresPerPixel: number,
  maxPixels: number,
): ImagerySize {
  const widthMetres = ground.halfEastMetres * 2
  const heightMetres = ground.halfNorthMetres * 2

  const nativeWidth = widthMetres / nativeMetresPerPixel
  const nativeHeight = heightMetres / nativeMetresPerPixel
  const shrink = Math.min(1, maxPixels / Math.max(nativeWidth, nativeHeight))

  const width = Math.max(1, Math.round(nativeWidth * shrink))
  const height = Math.max(1, Math.round(nativeHeight * shrink))

  return { width, height, metresPerPixel: widthMetres / width }
}

export interface ImageryRequest {
  readonly serviceUrl: string
  readonly mercator: MercatorBounds
  readonly size: ImagerySize
}

/**
 * The image url.
 *
 * `f=image` rather than `f=json`: the json form answers with a link into a
 * temporary output directory, which is neither stable nor cacheable, and a Site
 * is meant to be fetched once and then work with no signal.
 *
 * The bbox is rounded to centimetres, which keeps the url stable enough to be
 * recognised on a second visit. A centimetre is a thirtieth of a pixel at the
 * imagery's own resolution, so nothing visible moves.
 */
export function exportImageUrl(request: ImageryRequest): string {
  const { minX, minY, maxX, maxY } = request.mercator
  const bbox = [minX, minY, maxX, maxY].map(roundToCentimetres).join(',')
  const size = [request.size.width, request.size.height].join(',')

  const query = [
    `bbox=${bbox}`,
    `bboxSR=${WEB_MERCATOR_WKID}`,
    `imageSR=${WEB_MERCATOR_WKID}`,
    `size=${size}`,
    `format=${FORMAT}`,
    'f=image',
  ].join('&')

  return `${request.serviceUrl}/exportImage?${query}`
}

function roundToCentimetres(metres: number): number {
  return Math.round(metres * 100) / 100
}

/**
 * What the map is showing. Exactly one of these at a time, so the shell can
 * render the whole of it and never a combination that does not exist.
 */
export type ImageryState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly image: Blob; readonly fromCache: boolean }
  | { readonly status: 'failed'; readonly message: string }

export const IMAGERY_IDLE: ImageryState = { status: 'idle' }
export const IMAGERY_LOADING: ImageryState = { status: 'loading' }

/**
 * Everything that reaches outside the app, passed in rather than reached for,
 * which is what lets the core be tested with three one-line fakes instead of a
 * mocking framework.
 */
export interface ImageryEffects {
  fetchImage(url: string): Promise<Blob>
  readCache(url: string): Promise<Blob | undefined>
  writeCache(url: string, image: Blob): Promise<void>
}

/**
 * The picture for a url: from storage if it is already there, from the network
 * if it is not. A Site is fetched once and then has to work with no signal, so
 * storage is consulted first, and finding nothing is an ordinary outcome rather
 * than an error.
 *
 * Storage may be missing entirely - private browsing, a full quota - and that is
 * never allowed to cost the visitor the picture, so both cache operations are
 * treated as optional and a failure to store is swallowed. Failing to *fetch* is
 * not: it comes back as a state the visitor can read, rather than as a blank
 * screen with nothing said.
 */
export async function loadImagery(url: string, effects: ImageryEffects): Promise<ImageryState> {
  const cached = await effects.readCache(url).catch(() => undefined)
  if (cached !== undefined) {
    return { status: 'ready', image: cached, fromCache: true }
  }

  let image: Blob
  try {
    image = await effects.fetchImage(url)
  } catch {
    return { status: 'failed', message: 'The photograph could not be fetched.' }
  }

  await effects.writeCache(url, image).catch(() => undefined)

  return { status: 'ready', image, fromCache: false }
}
