import type { Site } from './core/site'

/**
 * The Sites a visitor chooses between. The manifest is the whole list.
 *
 * Hand-written and one entry deep for now. The creator mode authors these by
 * drawing a rectangle over the imagery and emits the entry to paste in here, so
 * this file is a placeholder that a real list will replace.
 * Until then this entry doubles as the end-to-end fixture, which is why the
 * numbers are round: the tests assert against them.
 *
 * The frame was measured off an 800 m preview render at about 0.78 m per pixel:
 * an area north of the origin where vehicles are parked, its rows running
 * roughly east-west. It is rough, and it is meant to be replaced by somewhere
 * someone actually cares about rather than refined.
 */
export const SITES: readonly Site[] = [
  {
    id: 'cupertino-sample',
    name: 'Cupertino sample',
    origin: { latitude: 37.32, longitude: -122.03 },
    frame: {
      centre: { eastMetres: -132, northMetres: 199 },
      lengthMetres: 137,
      widthMetres: 98,
      rotationDegrees: 90,
    },
  },
]
