import { describe, expect, it } from 'vitest'

import { angleBetween, snapAngle, snapCandidates } from './snapping'

describe('the angles a vehicle can snap to', () => {
  it('offers the space its own angle, which is where a row usually runs', () => {
    expect(snapCandidates(37, [])).toEqual([37])
  })

  it('offers the angles of the vehicles already on the ground in it', () => {
    expect(snapCandidates(37, [122])).toEqual([37, 122])
  })

  it('offers nothing for a space with no frame and nothing in it yet', () => {
    expect(snapCandidates(undefined, [])).toEqual([])
  })

  it('offers the neighbours alone when a Site has no frame', () => {
    expect(snapCandidates(undefined, [12, 8])).toEqual([12, 8])
  })

  it('never offers a north-relative angle the space does not have', () => {
    // A space at 7 degrees offers 7. It does not offer 0, 15, 45 or 90, which is
    // the whole point of not snapping to the compass.
    const candidates = snapCandidates(7, [])

    expect(candidates).not.toContain(0)
    expect(candidates).not.toContain(15)
    expect(candidates).not.toContain(45)
    expect(candidates).not.toContain(90)
  })
})

describe('choosing an angle to snap to', () => {
  it('takes a candidate when one is close enough', () => {
    expect(snapAngle(93, [90])).toBe(90)
    expect(snapAngle(41, [37])).toBe(37)
  })

  it('leaves the angle alone when nothing is close enough, so any angle is possible', () => {
    expect(snapAngle(97, [90])).toBe(97)
    expect(snapAngle(80, [37, 122])).toBe(80)
  })

  it('takes the nearer of two candidates', () => {
    expect(snapAngle(125, [122, 130])).toBe(122)
    expect(snapAngle(128, [122, 130])).toBe(130)
  })

  it('measures the short way round the circle', () => {
    // A vehicle at 183 degrees is three degrees from 180, not a hundred and
    // seventy-seven.
    expect(angleBetween(183, 180)).toBe(-3)
    expect(snapAngle(183, [180])).toBe(180)
  })

  it('hands back an angle near the one asked about, not half a turn away', () => {
    // 273 is three degrees from 270, which is the same orientation as 90. It is
    // handed back as 270 so that turning round the circle does not make it jump.
    expect(snapAngle(273, [90])).toBe(270)
  })

  it('snaps at exactly the tolerance and not a degree beyond it', () => {
    expect(snapAngle(95, [90], 5)).toBe(90)
    expect(snapAngle(96, [90], 5)).toBe(96)
  })

  it('snaps a first vehicle in a row to the space, which is the one gesture a hand sets', () => {
    // The fixture Site's frame is at 90 degrees, so a hand-set 93 lands on it.
    expect(snapAngle(93, snapCandidates(90, []))).toBe(90)
  })
})
