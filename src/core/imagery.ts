import type { Extent, LatLng, LatLngBounds, MercatorBounds } from './geometry'
import { boundsForExtent, mercatorBoundsForExtent, zoomAtNativeResolution } from './geometry'
import { extentForSite, type Site } from './site'

/** The National Map's NAIP image service, which needs no key. */
export const USGS_NAIP_SERVICE_URL =
  'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer'

/**
 * The service's own numbers, read from its metadata once and recorded here so
 * that nothing has to be fetched before a Site can be planned.
 *
 * `0.3` is its `pixelSize`, `4000` its `maxImageWidth` and `maxImageHeight`.
 */
export const NATIVE_METRES_PER_PIXEL = 0.3
export const MAX_IMAGE_PIXELS = 4000

/** A photograph, so JPEG: PNG would be several times the bytes for no gain. */
const FORMAT = 'jpeg'

/** Stated by number rather than by name, so it cannot drift with a map library. */
const WEB_MERCATOR_WKID = '3857'

export interface ImagerySize {
  readonly width: number
  readonly height: number
  /** The ground resolution obtained, which may be coarser than native. */
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
 * Width and height are integers because the request demands them, so their ratio
 * is only ever near the extent's. `extentMatching` closes that gap.
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

/**
 * The extent grown by well under a pixel on one axis, so its shape matches the
 * size exactly.
 *
 * This is what makes the returned extent equal the requested one. The service
 * *expands* a bbox whose aspect does not match the size it was given, and the
 * map places the picture by the bbox the app asked for, so any disagreement
 * would be drawn as a slight stretch - the one kind of error that quietly
 * falsifies every rectangle laid over the picture.
 *
 * The url rounds its bbox to centimetres, which leaves the two shapes differing
 * by about a millionth - a mismatch the service cannot act on, since growing the
 * bbox to fix it would move its edge by a fraction of a millimetre.
 */
function extentMatching(size: ImagerySize, extent: Extent): Extent {
  const wanted = size.width / size.height
  const have = extent.halfEastMetres / extent.halfNorthMetres

  return have < wanted
    ? { ...extent, halfEastMetres: extent.halfNorthMetres * wanted }
    : { ...extent, halfNorthMetres: extent.halfEastMetres / wanted }
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

export interface ImageryPlan {
  readonly requestUrl: string
  /** Where the returned picture belongs, in degrees. */
  readonly bounds: LatLngBounds
  readonly size: ImagerySize
  /** Past this, zooming magnifies pixels rather than revealing more. */
  readonly maxZoom: number
}

/**
 * Everything about a Site's picture that arithmetic decides, so the shell has
 * nothing left to choose and the policy can be tested without a browser.
 */
export function imageryPlanFor(site: Site, serviceUrl: string): ImageryPlan {
  return imageryPlanForExtent(site.origin, extentForSite(site), serviceUrl)
}

/** The same plan, for a piece of ground that is not a Site's own extent. */
export function imageryPlanForExtent(
  origin: LatLng,
  wanted: Extent,
  serviceUrl: string,
): ImageryPlan {
  const size = imagerySize(wanted, NATIVE_METRES_PER_PIXEL, MAX_IMAGE_PIXELS)
  const extent = extentMatching(size, wanted)

  return {
    requestUrl: exportImageUrl({
      serviceUrl,
      mercator: mercatorBoundsForExtent(origin, extent),
      size,
    }),
    bounds: boundsForExtent(origin, extent),
    size,
    maxZoom: Math.ceil(
      zoomAtNativeResolution((extent.halfEastMetres * 2) / size.width, origin.latitude),
    ),
  }
}

/**
 * How big the provisional Fetch Area is, a side at a time: the service's pixel
 * cap at the imagery's own resolution, in ground metres. Worked out from the
 * same two constants the fetch itself uses rather than chosen by eye.
 */
export const PROVISIONAL_FETCH_AREA_SIDE_METRES = MAX_IMAGE_PIXELS * NATIVE_METRES_PER_PIXEL

/**
 * The Fetch Area a brand-new Site is fetched for, before anyone has drawn a
 * frame on it: a square, centred on the candidate.
 *
 * A picture is fetched before anything can be drawn on it, so a new place needs
 * some ground to plan its fetch around even though it has no frame yet. A frame
 * drawn inside this square - up to the cap less the context margin on each side
 * - then gets the same surroundings a visitor sees, and sits within what the
 * creator already drew on.
 */
export function provisionalFetchArea(): Extent {
  const half = PROVISIONAL_FETCH_AREA_SIDE_METRES / 2

  return {
    centre: { eastMetres: 0, northMetres: 0 },
    halfEastMetres: half,
    halfNorthMetres: half,
  }
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
 * What the app says while the one picture is on its way.
 *
 * The wait is 15-22 seconds the first time a place is opened and nothing at all
 * afterwards, so the sentence has to explain both. It lives beside the states
 * because the visitor's page and the creator's say the same thing about the
 * same wait.
 */
export const IMAGERY_LOADING_MESSAGE =
  'Fetching the photograph. The first visit to a place takes a few seconds; after that it is instant.'

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
