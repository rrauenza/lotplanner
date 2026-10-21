import { vehicle, type Vehicle } from './vehicle'

/**
 * The System Collection: the vehicles that ship with the app, so that nobody has
 * to look up the length of a 53 foot trailer before they can lay anything out.
 * Always present, never editable, never deletable.
 *
 * Colours are picked to be told apart at a glance, not to be pretty, and are
 * plain mid-tones so that a vehicle's own name stays readable over it.
 */

export const SYSTEM_COLLECTION_NAME = 'Standard vehicles'

export const systemVehicles: readonly Vehicle[] = [
  vehicle({
    name: 'Car / SUV (Ford Explorer)',
    shortLabel: 'SUV',
    widthInches: 79,
    lengthInches: 199,
    colour: '#3b82f6',
  }),
  vehicle({
    name: 'Semi + 53 ft trailer',
    shortLabel: 'Semi',
    widthInches: 102,
    lengthInches: 840,
    colour: '#ef4444',
  }),
  vehicle({
    name: 'Coach (45 ft, MCI J4500)',
    shortLabel: 'Coach',
    widthInches: 102,
    lengthInches: 547,
    colour: '#22c55e',
  }),
  vehicle({
    name: 'F-250 + utility trailer',
    shortLabel: 'F-250',
    widthInches: 84,
    lengthInches: 524,
    colour: '#a855f7',
  }),
]
