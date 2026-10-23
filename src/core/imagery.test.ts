import { describe, expect, it } from 'vitest'

import { resizedFrame } from './frame-sketch'
import {
  exportImageUrl,
  imageryPlanFor,
  imageryPlanForExtent,
  imagerySize,
  loadImagery,
  MAX_IMAGE_PIXELS,
  NATIVE_METRES_PER_PIXEL,
  PROVISIONAL_FETCH_AREA_SIDE_METRES,
  provisionalFetchArea,
  type ImageryState,
} from './imagery'
import { CONTEXT_MARGIN_METRES, extentForSite } from './site'

const SERVICE = 'https://imagery.example.test/USGSNAIPImagery/ImageServer'

describe('imagerySize', () => {
  it('asks for the imagery at its own resolution when that fits the cap', () => {
    // 300 m by 200 m of ground at 0.3 m per pixel.
    const size = imagerySize({ halfEastMetres: 150, halfNorthMetres: 100 }, 0.3, 4000)

    expect(size.width).toBe(1000)
    expect(size.height).toBe(667)
    expect(size.metresPerPixel).toBeCloseTo(0.3, 6)
  })

  it('loses resolution rather than failing, when the extent is too big for the cap', () => {
    // 6 km square would be 20000 px at native, so the cap gives 1.5 m per pixel.
    const size = imagerySize({ halfEastMetres: 3000, halfNorthMetres: 3000 }, 0.3, 4000)

    expect(size.width).toBe(4000)
    expect(size.height).toBe(4000)
    expect(size.metresPerPixel).toBeCloseTo(1.5, 6)
  })

  it('keeps the shape of the picture, because a stretched picture lies', () => {
    const size = imagerySize({ halfEastMetres: 4000, halfNorthMetres: 2000 }, 0.3, 4000)

    expect(size.width).toBe(4000)
    expect(size.height).toBe(2000)
  })

  it('leaves the shape exact enough that the service returns the extent asked for', () => {
    // The service expands a bbox whose aspect does not match the size, so the
    // size has to agree with the extent to within a rounding of a pixel.
    const extent = { halfEastMetres: 217, halfNorthMetres: 131 }
    const size = imagerySize(extent, 0.3, 4000)

    expect(size.width / size.height).toBeCloseTo(extent.halfEastMetres / extent.halfNorthMetres, 2)
  })

  it('does not magnify to fill the cap', () => {
    // 0.9 m across at 0.3 m per pixel is three pixels, not four thousand.
    const size = imagerySize({ halfEastMetres: 0.45, halfNorthMetres: 0.45 }, 0.3, 4000)

    expect(size.width).toBe(3)
    expect(size.height).toBe(3)
  })
})

describe('exportImageUrl', () => {
  const size = { width: 1024, height: 768, metresPerPixel: 1 }

  it('names the plane on both sides, so the picture is not stretched', () => {
    expect(
      exportImageUrl({
        serviceUrl: SERVICE,
        mercator: { minX: 1, minY: 2, maxX: 3, maxY: 4 },
        size,
      }),
    ).toBe(
      `${SERVICE}/exportImage?bbox=1,2,3,4&bboxSR=3857&imageSR=3857&size=1024,768&format=jpeg&f=image`,
    )
  })

  it('rounds the bbox to centimetres, so the url is stable and nothing visible moves', () => {
    expect(
      exportImageUrl({
        serviceUrl: SERVICE,
        mercator: {
          minX: -13584443.206241706,
          minY: 4483679.273867047,
          maxX: 1.006,
          maxY: 2,
        },
        size,
      }),
    ).toContain('bbox=-13584443.21,4483679.27,1.01,2&')
  })
})

describe('imageryPlanFor', () => {
  const site = {
    id: 'sample',
    name: 'Sample',
    origin: { latitude: 37.32, longitude: -122.03 },
    frame: {
      centre: { eastMetres: -132, northMetres: 199 },
      lengthMetres: 137,
      widthMetres: 98,
      rotationDegrees: 90,
    },
  }

  it('asks for a bbox whose shape matches the size exactly', () => {
    // Otherwise the service expands the bbox, and the map draws the picture by
    // the bbox it asked for, which would stretch it very slightly.
    const plan = imageryPlanFor(site, SERVICE)
    const bbox = new URL(plan.requestUrl).searchParams.get('bbox')
    expect(bbox).not.toBeNull()

    const [minX = 0, minY = 0, maxX = 0, maxY = 0] = (bbox ?? '').split(',').map(Number)

    // The url rounds the bbox to centimetres, so the two shapes agree only to
    // about a millionth. That is what matters: a mismatch the service could act
    // on would grow the bbox by a fraction of a millimetre, far under a pixel.
    const bboxShape = (maxX - minX) / (maxY - minY)
    const sizeShape = plan.size.width / plan.size.height
    expect(Math.abs(bboxShape / sizeShape - 1)).toBeLessThan(1e-5)
  })

  it('caps the zoom where zooming magnifies pixels instead of revealing detail', () => {
    // log2(156543.03392804097 * cos(37.32) / 0.3) is 18.66, so the ceiling is 19.
    expect(imageryPlanFor(site, SERVICE).maxZoom).toBe(19)
  })

  it('asks for the whole ground extent at the imagery own resolution', () => {
    // The frame is 137 m by 98 m and the context margin is 150 m a side, so the
    // extent is 437 m across and 398 m down at 0.3 m per pixel.
    const plan = imageryPlanFor(site, SERVICE)

    expect(plan.size.width).toBe(1457)
    expect(plan.size.height).toBe(1327)
    expect(plan.size.metresPerPixel).toBeCloseTo(0.3, 3)
  })
})

describe('provisionalFetchArea', () => {
  it('is the largest square the service will give at the imagery own resolution', () => {
    const side = provisionalFetchArea().halfEastMetres * 2

    expect(side).toBeCloseTo(MAX_IMAGE_PIXELS * NATIVE_METRES_PER_PIXEL, 6)
  })

  it('is centred on the candidate and square to north', () => {
    const half = PROVISIONAL_FETCH_AREA_SIDE_METRES / 2

    expect(provisionalFetchArea()).toStrictEqual({
      centre: { eastMetres: 0, northMetres: 0 },
      halfEastMetres: half,
      halfNorthMetres: half,
    })
  })

  it('plans a picture at the service pixel cap', () => {
    const plan = imageryPlanForExtent(
      { latitude: 0, longitude: 0 },
      provisionalFetchArea(),
      SERVICE,
    )

    expect(plan.size.width).toBe(4000)
    expect(plan.size.height).toBe(4000)
  })

  it('covers a lot drawn inside it, with the context margin to spare', () => {
    // The fixture lot, turned to match: 137 m by 98 m, centred on the candidate.
    // The frame it is drawn from is the largest that still gets its margin.
    const roomiest = PROVISIONAL_FETCH_AREA_SIDE_METRES - 2 * CONTEXT_MARGIN_METRES
    const lot = resizedFrame(
      {
        centre: { eastMetres: 0, northMetres: 0 },
        lengthMetres: roomiest,
        widthMetres: roomiest,
        rotationDegrees: 90,
      },
      { eastMetres: -68.5, northMetres: -49 },
      { eastMetres: 68.5, northMetres: 49 },
    )

    expect(lot).not.toBeUndefined()

    if (lot === undefined) {
      throw new Error('expected a lot drawn inside the fetch area')
    }

    const fetched = provisionalFetchArea()
    const wanted = extentForSite({
      id: 'draft',
      name: 'Draft',
      origin: { latitude: 0, longitude: 0 },
      frame: lot,
    })

    expect(wanted.halfEastMetres).toBeLessThanOrEqual(fetched.halfEastMetres)
    expect(wanted.halfNorthMetres).toBeLessThanOrEqual(fetched.halfNorthMetres)
  })
})

type Ready = Extract<ImageryState, { status: 'ready' }>

function asReady(state: ImageryState): Ready {
  if (state.status !== 'ready') {
    throw new Error(`expected a picture, got ${state.status}`)
  }
  return state
}

describe('loadImagery', () => {
  const url = 'https://imagery.example.test/exportImage?bbox=1,2,3,4'
  const image = new Blob(['pixels'])

  it('uses what it already has, and does not touch the network to do it', async () => {
    let fetched = 0
    const state = await loadImagery(url, {
      readCache: () => Promise.resolve(image),
      writeCache: () => Promise.resolve(),
      fetchImage: () => {
        fetched += 1
        return Promise.resolve(image)
      },
    })

    expect(asReady(state).image).toBe(image)
    expect(asReady(state).fromCache).toBe(true)
    expect(fetched).toBe(0)
  })

  it('fetches when it has nothing, and keeps what it fetched', async () => {
    const written: string[] = []
    const state = await loadImagery(url, {
      readCache: () => Promise.resolve(undefined),
      writeCache: (key) => {
        written.push(key)
        return Promise.resolve()
      },
      fetchImage: () => Promise.resolve(image),
    })

    expect(asReady(state).fromCache).toBe(false)
    expect(written).toEqual([url])
  })

  it('reports a failure rather than pretending, and does not cache one', async () => {
    let written = 0
    const state = await loadImagery(url, {
      readCache: () => Promise.resolve(undefined),
      writeCache: () => {
        written += 1
        return Promise.resolve()
      },
      fetchImage: () => Promise.reject(new Error('502 Bad Gateway')),
    })

    expect(state.status).toBe('failed')
    expect(state.status === 'failed' && state.message.length).toBeGreaterThan(0)
    expect(written).toBe(0)
  })

  it('still shows the picture when storage does not work, which is private browsing', async () => {
    const state = await loadImagery(url, {
      readCache: () => Promise.reject(new Error('storage is unavailable')),
      writeCache: () => Promise.reject(new Error('storage is unavailable')),
      fetchImage: () => Promise.resolve(image),
    })

    expect(asReady(state).image).toBe(image)
  })
})
