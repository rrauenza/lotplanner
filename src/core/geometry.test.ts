import { describe, expect, it } from 'vitest'

import {
  alongAndAcross,
  boundsForExtent,
  containsPoint,
  cornersOf,
  extentAroundFrame,
  latLngFromOffset,
  mercatorBoundsForExtent,
  metresPerPixel,
  offsetFromLatLng,
  zoomAtNativeResolution,
  type Offset,
} from './geometry'

/**
 * Expected values come from outside this code: the published Web Mercator
 * ground resolution of 2*pi*R/256, the classic 111.319 km degree of latitude,
 * the fact that cos 60 degrees is exactly one half, and corner positions worked
 * out by hand from the definition of a rotated rectangle.
 *
 * The precision asserted is there to catch mistakes - a wrong constant, a
 * swapped axis, a rotation applied to the label rather than the shape - and not
 * to claim accuracy. This is a visualisation: rectangles have to be honest
 * against the picture, not against the planet. Offsets are a local plane, so
 * anything asserted over a long distance is asserted in a direction that stays
 * exact.
 */

const METRES_PER_DEGREE = 111319.4907932736

/**
 * The area a ring of corners encloses, signed. Zero means they cross each other,
 * because the two halves cancel - which is what a bowtie does.
 */
function enclosedArea(corners: readonly Offset[]): number {
  let twiceArea = 0

  for (let index = 0; index < corners.length; index += 1) {
    const here = corners[index]
    const next = corners[(index + 1) % corners.length]

    if (here === undefined || next === undefined) {
      throw new Error('expected corners')
    }
    twiceArea += here.eastMetres * next.northMetres - next.eastMetres * here.northMetres
  }

  return Math.abs(twiceArea) / 2
}

/** Order-independent, so it cannot pin the order corners come back in. */
function asKeys(corners: readonly Offset[]): string[] {
  return corners
    .map((corner) => `${corner.eastMetres.toFixed(6)},${corner.northMetres.toFixed(6)}`)
    .sort()
}

describe('metresPerPixel', () => {
  it('is the whole world across 256 pixels at zoom zero', () => {
    expect(metresPerPixel(0, 0)).toBeCloseTo(156543.03392804097, 6)
  })

  it('halves with each zoom step', () => {
    expect(metresPerPixel(0, 1)).toBeCloseTo(156543.03392804097 / 2, 6)
    expect(metresPerPixel(0, 4)).toBeCloseTo(156543.03392804097 / 16, 6)
  })

  it('reports ground metres, so it shrinks with latitude', () => {
    // Mercator stretches the plane by 1/cos(lat), so a pixel covers less ground.
    expect(metresPerPixel(60, 0)).toBeCloseTo(156543.03392804097 / 2, 6)
    expect(metresPerPixel(60, 2)).toBeCloseTo(156543.03392804097 / 8, 6)
  })
})

describe('offsetFromLatLng', () => {
  it('measures a thousandth of a degree at the equator', () => {
    const offset = offsetFromLatLng(
      { latitude: 0, longitude: 0 },
      { latitude: 0.001, longitude: -0.002 },
    )

    expect(offset.northMetres).toBeCloseTo(METRES_PER_DEGREE / 1000, 3)
    expect(offset.eastMetres).toBeCloseTo(-METRES_PER_DEGREE / 500, 3)
  })

  it('narrows with longitude as you go north', () => {
    const offset = offsetFromLatLng({ latitude: 60, longitude: 0 }, { latitude: 60, longitude: 1 })

    expect(offset.eastMetres).toBeCloseTo(METRES_PER_DEGREE / 2, 3)
  })

  it('treats the origin as the zero of its own offsets', () => {
    const origin = { latitude: 37.32, longitude: -122.03 }

    const offset = offsetFromLatLng(origin, origin)

    expect(offset.eastMetres).toBeCloseTo(0, 6)
    expect(offset.northMetres).toBeCloseTo(0, 6)
  })
})

describe('latLngFromOffset', () => {
  it('is exact going east, because a parallel is a plain scale', () => {
    expect(
      latLngFromOffset(
        { latitude: 0, longitude: 0 },
        { eastMetres: METRES_PER_DEGREE / 100, northMetres: 0 },
      ).longitude,
    ).toBeCloseTo(0.01, 9)

    // A degree of longitude at 60 north is half as wide, so half the metres.
    expect(
      latLngFromOffset(
        { latitude: 60, longitude: 0 },
        { eastMetres: METRES_PER_DEGREE / 200, northMetres: 0 },
      ).longitude,
    ).toBeCloseTo(0.01, 9)
  })

  it('round trips an offset back to where it started', () => {
    const origin = { latitude: 37.32, longitude: -122.03 }
    const offset = { eastMetres: -132, northMetres: 199 }

    const back = offsetFromLatLng(origin, latLngFromOffset(origin, offset))

    expect(back.eastMetres).toBeCloseTo(-132, 3)
    expect(back.northMetres).toBeCloseTo(199, 3)
  })
})

describe('containsPoint', () => {
  const rectangle = {
    centre: { eastMetres: 0, northMetres: 0 },
    lengthMetres: 20,
    widthMetres: 10,
    rotationDegrees: 0,
  }

  it('knows a point inside from one outside, on both axes', () => {
    expect(containsPoint(rectangle, { eastMetres: 0, northMetres: 0 })).toBe(true)
    expect(containsPoint(rectangle, { eastMetres: 4, northMetres: 9 })).toBe(true)
    expect(containsPoint(rectangle, { eastMetres: 6, northMetres: 0 })).toBe(false)
    expect(containsPoint(rectangle, { eastMetres: 0, northMetres: 11 })).toBe(false)
  })

  it('turns with the rectangle rather than testing a box around it', () => {
    const turned = { ...rectangle, rotationDegrees: 90 }

    // Nine metres north is well inside a rectangle lying north-south, and well
    // outside one lying east-west, where north is only five metres across.
    expect(containsPoint(rectangle, { eastMetres: 0, northMetres: 9 })).toBe(true)
    expect(containsPoint(turned, { eastMetres: 0, northMetres: 9 })).toBe(false)
    expect(containsPoint(turned, { eastMetres: 9, northMetres: 0 })).toBe(true)
  })

  it('pads for a finger without moving the rectangle', () => {
    const justOutside = { eastMetres: 5.5, northMetres: 0 }

    expect(containsPoint(rectangle, justOutside)).toBe(false)
    expect(containsPoint(rectangle, justOutside, 1)).toBe(true)
  })
})

describe('alongAndAcross', () => {
  it('puts a point where the corners of the rectangle say it is', () => {
    // A quarter turn: the length runs east, so half of it along is ten metres
    // east of the middle, and nothing north of it.
    const nose = alongAndAcross(
      {
        centre: { eastMetres: 3, northMetres: -7 },
        lengthMetres: 20,
        widthMetres: 10,
        rotationDegrees: 90,
      },
      10,
      0,
    )

    expect(nose.eastMetres).toBeCloseTo(13, 6)
    expect(nose.northMetres).toBeCloseTo(-7, 6)
  })

  it('carries across to the side, which is not the same direction as along', () => {
    // Square to north: the length runs north, so across runs east.
    const right = alongAndAcross(
      {
        centre: { eastMetres: 0, northMetres: 0 },
        lengthMetres: 20,
        widthMetres: 10,
        rotationDegrees: 0,
      },
      0,
      5,
    )

    expect(right.eastMetres).toBeCloseTo(5, 6)
    expect(right.northMetres).toBeCloseTo(0, 6)
  })
})

describe('cornersOf', () => {
  it('travels the length north and the width east when rotation is north', () => {
    const corners = cornersOf({
      centre: { eastMetres: 0, northMetres: 0 },
      lengthMetres: 20,
      widthMetres: 10,
      rotationDegrees: 0,
    })

    expect(asKeys(corners)).toEqual(
      [
        '-5.000000,-10.000000',
        '-5.000000,10.000000',
        '5.000000,-10.000000',
        '5.000000,10.000000',
      ].sort(),
    )
  })

  it('walks the perimeter, so the shape drawn from it is a rectangle', () => {
    // A polygon is drawn in the order its corners arrive. Out of order they
    // cross each other into a bowtie and the area cancels out - which is the
    // only thing here that notices, because a bowtie has exactly the same
    // bounding box as the rectangle it should have been.
    for (const rotationDegrees of [0, 30, 90]) {
      const corners = cornersOf({
        centre: { eastMetres: 3, northMetres: -7 },
        lengthMetres: 20,
        widthMetres: 10,
        rotationDegrees,
      })

      expect(enclosedArea(corners)).toBeCloseTo(20 * 10, 6)
    }
  })

  it('turns the whole rectangle, not just its label', () => {
    const corners = cornersOf({
      centre: { eastMetres: 10, northMetres: 20 },
      lengthMetres: 40,
      widthMetres: 20,
      rotationDegrees: 90,
    })

    expect(asKeys(corners)).toEqual(
      [
        '-10.000000,10.000000',
        '-10.000000,30.000000',
        '30.000000,10.000000',
        '30.000000,30.000000',
      ].sort(),
    )
  })
})

describe('extentAroundFrame', () => {
  const squareOn: Offset = { eastMetres: 10, northMetres: 20 }

  it('is the frame itself when there is no margin', () => {
    const extent = extentAroundFrame(
      { centre: squareOn, lengthMetres: 40, widthMetres: 20, rotationDegrees: 0 },
      0,
    )

    expect(extent.centre).toEqual(squareOn)
    expect(extent.halfEastMetres).toBeCloseTo(10, 6)
    expect(extent.halfNorthMetres).toBeCloseTo(20, 6)
  })

  it('grows by the margin on every side', () => {
    const extent = extentAroundFrame(
      { centre: squareOn, lengthMetres: 40, widthMetres: 20, rotationDegrees: 0 },
      5,
    )

    expect(extent.halfEastMetres).toBeCloseTo(15, 6)
    expect(extent.halfNorthMetres).toBeCloseTo(25, 6)
  })

  it('takes the bounding box of a frame at an angle', () => {
    // Half-length 50 along 30 degrees clockwise from north, half-width 30 across.
    // East: 50*sin30 + 30*cos30 = 25 + 25.980762. North: 50*cos30 + 30*sin30.
    const extent = extentAroundFrame(
      {
        centre: { eastMetres: 0, northMetres: 0 },
        lengthMetres: 100,
        widthMetres: 60,
        rotationDegrees: 30,
      },
      0,
    )

    expect(extent.halfEastMetres).toBeCloseTo(50.98076211353316, 9)
    expect(extent.halfNorthMetres).toBeCloseTo(58.30127018922193, 9)
  })

  it('grows an angled frame along its own axes, so the margin is a real distance', () => {
    const extent = extentAroundFrame(
      {
        centre: { eastMetres: 0, northMetres: 0 },
        lengthMetres: 100,
        widthMetres: 60,
        rotationDegrees: 30,
      },
      20,
    )

    expect(extent.halfEastMetres).toBeCloseTo(70 * 0.5 + 50 * 0.8660254037844386, 9)
    expect(extent.halfNorthMetres).toBeCloseTo(70 * 0.8660254037844386 + 50 * 0.5, 9)
  })
})

describe('boundsForExtent', () => {
  it('reports the extent as degrees, which is how the map places the picture', () => {
    const bounds = boundsForExtent(
      { latitude: 0, longitude: 0 },
      {
        centre: { eastMetres: 0, northMetres: 0 },
        halfEastMetres: METRES_PER_DEGREE / 100,
        halfNorthMetres: METRES_PER_DEGREE / 100,
      },
    )

    expect(bounds.southWest.longitude).toBeCloseTo(-0.01, 9)
    expect(bounds.southWest.latitude).toBeCloseTo(-0.01, 6)
    expect(bounds.northEast.longitude).toBeCloseTo(0.01, 9)
    expect(bounds.northEast.latitude).toBeCloseTo(0.01, 6)
  })

  it('carries its own offset away from the origin', () => {
    const bounds = boundsForExtent(
      { latitude: 0, longitude: 0 },
      {
        centre: { eastMetres: METRES_PER_DEGREE / 100, northMetres: 0 },
        halfEastMetres: METRES_PER_DEGREE / 200,
        halfNorthMetres: METRES_PER_DEGREE / 200,
      },
    )

    expect(bounds.southWest.longitude).toBeCloseTo(0.005, 9)
    expect(bounds.northEast.longitude).toBeCloseTo(0.015, 9)
  })
})

describe('mercatorBoundsForExtent', () => {
  it('is the extent itself at the equator, where mercator does not stretch', () => {
    const mercator = mercatorBoundsForExtent(
      { latitude: 0, longitude: 0 },
      { centre: { eastMetres: 0, northMetres: 0 }, halfEastMetres: 500, halfNorthMetres: 250 },
    )

    expect(mercator.minX).toBeCloseTo(-500, 6)
    expect(mercator.minY).toBeCloseTo(-250, 6)
    expect(mercator.maxX).toBeCloseTo(500, 6)
    expect(mercator.maxY).toBeCloseTo(250, 6)
  })

  it('doubles at 60 degrees north, where mercator stretches by two', () => {
    const mercator = mercatorBoundsForExtent(
      { latitude: 60, longitude: 0 },
      { centre: { eastMetres: 0, northMetres: 0 }, halfEastMetres: 500, halfNorthMetres: 250 },
    )

    // The Mercator origin sits far north of the equator, so the span is what
    // shows the stretch - twice as wide here as the ground distance.
    expect(mercator.maxX - mercator.minX).toBeCloseTo(2000, 6)
    expect(mercator.maxY - mercator.minY).toBeCloseTo(1000, 6)
  })

  it('carries the extent offset east and north of the origin', () => {
    const mercator = mercatorBoundsForExtent(
      { latitude: 0, longitude: 0 },
      { centre: { eastMetres: 100, northMetres: 40 }, halfEastMetres: 10, halfNorthMetres: 10 },
    )

    expect(mercator.minX).toBeCloseTo(90, 6)
    expect(mercator.minY).toBeCloseTo(30, 6)
    expect(mercator.maxX).toBeCloseTo(110, 6)
    expect(mercator.maxY).toBeCloseTo(50, 6)
  })
})

describe('zoomAtNativeResolution', () => {
  it('is the zoom whose pixels cover the same ground as the imagery', () => {
    // Asking for the resolution of a known zoom makes that zoom the answer.
    expect(zoomAtNativeResolution(metresPerPixel(0, 12), 0)).toBeCloseTo(12, 9)
    expect(zoomAtNativeResolution(metresPerPixel(37.32, 15), 37.32)).toBeCloseTo(15, 9)
  })

  it('goes up for sharper imagery and down for coarser', () => {
    const atTwelve = metresPerPixel(37.32, 12)

    expect(zoomAtNativeResolution(atTwelve / 2, 37.32)).toBeCloseTo(13, 9)
    expect(zoomAtNativeResolution(atTwelve * 4, 37.32)).toBeCloseTo(10, 9)
  })
})
