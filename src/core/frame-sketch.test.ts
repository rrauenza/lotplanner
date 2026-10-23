import { describe, expect, it } from 'vitest'

import { frameFromCorners, MINIMUM_FRAME_SIDE_METRES, resizedFrame } from './frame-sketch'
import type { SiteFrame } from './geometry'

describe('frameFromCorners', () => {
  it('takes the drawn box as the rectangle, square to north', () => {
    const frame = frameFromCorners(
      { eastMetres: 10, northMetres: 20 },
      { eastMetres: 147, northMetres: 118 },
    )

    expect(frame).toStrictEqual({
      centre: { eastMetres: 78.5, northMetres: 69 },
      lengthMetres: 98,
      widthMetres: 137,
      rotationDegrees: 0,
    })
  })

  it('does not care which corner the drag began in', () => {
    const one = frameFromCorners(
      { eastMetres: 0, northMetres: 0 },
      { eastMetres: -80, northMetres: 40 },
    )
    const other = frameFromCorners(
      { eastMetres: -80, northMetres: 40 },
      { eastMetres: 0, northMetres: 0 },
    )

    expect(one).toStrictEqual(other)
  })

  it('refuses a drag too small to be a space', () => {
    expect(
      frameFromCorners({ eastMetres: 0, northMetres: 0 }, { eastMetres: 0.5, northMetres: 50 }),
    ).toBeUndefined()
    expect(
      frameFromCorners({ eastMetres: 0, northMetres: 0 }, { eastMetres: 50, northMetres: 0.5 }),
    ).toBeUndefined()
    // Exactly the minimum is still a space, so the refusal is a floor and not a wall.
    expect(
      frameFromCorners(
        { eastMetres: 0, northMetres: 0 },
        { eastMetres: MINIMUM_FRAME_SIDE_METRES, northMetres: MINIMUM_FRAME_SIDE_METRES },
      ),
    ).not.toBeUndefined()
  })
})

describe('resizedFrame', () => {
  // 100 m along its length (north, until turned) and 60 m across.
  const square: SiteFrame = {
    centre: { eastMetres: 0, northMetres: 0 },
    lengthMetres: 100,
    widthMetres: 60,
    rotationDegrees: 0,
  }

  it('holds the opposite corner still and keeps the angle', () => {
    // The corner at 30 m east, 50 m north is dragged to 120 m east, 90 m north.
    const resized = resizedFrame(
      square,
      { eastMetres: -30, northMetres: -50 },
      { eastMetres: 120, northMetres: 90 },
    )

    expect(resized).toStrictEqual({
      centre: { eastMetres: 45, northMetres: 20 },
      lengthMetres: 140,
      widthMetres: 150,
      rotationDegrees: 0,
    })
  })

  it('measures the drag along the axes of the frame rather than of the compass', () => {
    // A frame turned a quarter turn: its length now runs east and its width south.
    const turned: SiteFrame = { ...square, rotationDegrees: 90 }

    const resized = resizedFrame(
      turned,
      { eastMetres: 0, northMetres: 0 },
      { eastMetres: 80, northMetres: 200 },
    )

    // 80 m east is 80 m along the length; 200 m north is 200 m across the width.
    // Close to, because a sine of a right angle is a rounding of one.
    expect(resized?.rotationDegrees).toBe(90)
    expect(resized?.lengthMetres).toBeCloseTo(80, 9)
    expect(resized?.widthMetres).toBeCloseTo(200, 9)
    expect(resized?.centre).toStrictEqual({ eastMetres: 40, northMetres: 100 })
  })

  it('refuses a drag that would leave a side too small to be a space', () => {
    expect(
      resizedFrame(square, { eastMetres: 0, northMetres: 0 }, { eastMetres: 0.5, northMetres: 50 }),
    ).toBeUndefined()
  })
})
