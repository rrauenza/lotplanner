import { describe, expect, it } from 'vitest'

import { offsetFromLatLng } from './geometry'
import { newLayout, rectangleOf, withMovedPlacement, withPlacement, type Placement } from './layout'
import type { Site } from './site'
import { vehicle } from './vehicle'

const SITE: Site = {
  id: 'cupertino-sample',
  name: 'Cupertino sample',
  origin: { latitude: 37.32, longitude: -122.03 },
  frame: {
    centre: { eastMetres: -132, northMetres: 199 },
    lengthMetres: 137,
    widthMetres: 98,
    rotationDegrees: 90,
  },
}

/** The Explorer from the System Collection: 199 by 79 inches. */
const SUV = vehicle({
  name: 'Car / SUV (Ford Explorer)',
  shortLabel: 'SUV',
  widthInches: 79,
  lengthInches: 199,
  colour: '#3b82f6',
})

function at(id: string, centre = { eastMetres: 0, northMetres: 0 }): Placement {
  return { id, vehicle: SUV, centre, rotationDegrees: 90 }
}

function centreOf(layout: { readonly placements: readonly Placement[] }, id: string) {
  return layout.placements.find((each) => each.id === id)?.centre
}

describe('a Layout', () => {
  it('carries the Site it belongs to, so it opens without the manifest', () => {
    const layout = newLayout(SITE)

    expect(layout.siteId).toBe('cupertino-sample')
    expect(layout.siteName).toBe('Cupertino sample')
    expect(layout.origin).toEqual(SITE.origin)
    expect(layout.frame).toEqual(SITE.frame)
    expect(layout.placements).toEqual([])
  })

  it('works for a Site with no frame, because a Site need not have one', () => {
    const frameless: Site = { id: SITE.id, name: SITE.name, origin: SITE.origin }

    expect(newLayout(frameless).frame).toBeUndefined()
  })

  it('carries the ground its picture covers, not only the frame inside it', () => {
    // The frame is 137 by 98 m and the context margin is 150 m on every side, so
    // the extent runs from 350.5 m west and 199 m south of the frame's centre to
    // 86.5 m east and 199 m north of it.
    const layout = newLayout(SITE)
    const southWest = offsetFromLatLng(SITE.origin, layout.bounds.southWest)

    expect(southWest.eastMetres).toBeCloseTo(-132 - 218.5, 3)
    expect(southWest.northMetres).toBeCloseTo(199 - 199, 3)
  })
})

describe('what a Placement covers on the ground', () => {
  it('is a rectangle at the size the vehicle publishes', () => {
    // 199 inches is 5.0546 m; 79 inches is 2.0066 m.
    const rectangle = rectangleOf(at('one'))

    expect(rectangle.lengthMetres).toBeCloseTo(5.0546, 4)
    expect(rectangle.widthMetres).toBeCloseTo(2.0066, 4)
    expect(rectangle.rotationDegrees).toBe(90)
    expect(rectangle.centre).toEqual({ eastMetres: 0, northMetres: 0 })
  })
})

describe('changing a Layout', () => {
  it('adds a Placement and leaves the earlier state empty', () => {
    const before = newLayout(SITE)
    const after = withPlacement(before, at('one'))

    expect(after.placements).toHaveLength(1)
    // The point of the discipline: the state before the edit is untouched, so it
    // can be kept and returned to rather than rebuilt.
    expect(before.placements).toHaveLength(0)
  })

  it('moves one Placement, leaves the others, and leaves the older state alone', () => {
    const start = withPlacement(withPlacement(newLayout(SITE), at('one')), at('two'))
    const moved = withMovedPlacement(start, 'two', { eastMetres: 12.5, northMetres: -3 })

    expect(centreOf(moved, 'two')).toEqual({ eastMetres: 12.5, northMetres: -3 })
    expect(centreOf(moved, 'one')).toEqual({ eastMetres: 0, northMetres: 0 })
    expect(centreOf(start, 'two')).toEqual({ eastMetres: 0, northMetres: 0 })
  })

  it('hands an untouched Placement through as the same object', () => {
    const start = withPlacement(newLayout(SITE), at('one'))
    const moved = withMovedPlacement(start, 'nobody', { eastMetres: 1, northMetres: 1 })

    expect(moved.placements[0]).toBe(start.placements[0])
  })
})
