import { describe, expect, it } from 'vitest'

import { SYSTEM_COLLECTION_NAME, systemVehicles } from './collection'
import { newLayout, withPlacement, type Layout } from './layout'
import type { Site } from './site'
import { vehicle, type Vehicle } from './vehicle'
import {
  COLLECTIONS_NOT_KEPT,
  MAXIMUM_COLLECTION_NAME_LENGTH,
  SYSTEM_COLLECTION,
  SYSTEM_COLLECTION_ID,
  adopted,
  allCollections,
  contentHash,
  loadCollections,
  missingFrom,
  nameFor,
  nextCollectionName,
  readCollections,
  received,
  samenessHint,
  withCreated,
  withEditedVehicle,
  withRenamed,
  withVehicle,
  withoutCollection,
  withoutVehicle,
  writeCollections,
  type ArrivedCollection,
  type CollectionEffects,
  type VehicleCollection,
} from './vehicle-collection'
import { KEPT } from './saved'

/**
 * The visitor's own Vehicle Collections.
 *
 * The System Collection is not one of these - it is conjured from the vehicles
 * that ship with the app - so nothing here can rename, edit or delete it. That
 * is the shape the tests hold this module to.
 */

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

const SUV = vehicle({
  name: 'Car / SUV (Ford Explorer)',
  shortLabel: 'SUV',
  widthInches: 79,
  lengthInches: 199,
  colour: '#3b82f6',
})

const COACH = vehicle({
  name: 'Coach (45 ft, MCI J4500)',
  shortLabel: 'Coach',
  widthInches: 102,
  lengthInches: 547,
  colour: '#22c55e',
})

const ARRIVED: ArrivedCollection = { name: 'Fleet A', vehicles: [SUV, COACH] }

/** The visitor's own vehicle: in no collection that ships with the app. */
const TOW_TRUCK = vehicle({
  name: 'Tow truck',
  shortLabel: 'Tow',
  widthInches: 96,
  lengthInches: 240,
  colour: '#6b7280',
})

/** A second one of the visitor's own, so a report has two things to tell apart. */
const BOX_VAN = vehicle({
  name: 'Box van',
  shortLabel: 'Box van',
  widthInches: 90,
  lengthInches: 300,
  colour: '#f59e0b',
})

function mine(id: string, name: string, vehicles: readonly Vehicle[] = []): VehicleCollection {
  return { id, name, vehicles }
}

/** A Layout at the fixture Site with these Vehicles placed, one copy each. */
function laidWith(...used: readonly Vehicle[]): Layout {
  return used.reduce<Layout>(
    (layout, one, index) =>
      withPlacement(layout, {
        id: `p${String(index)}`,
        vehicle: one,
        centre: { eastMetres: index, northMetres: 0 },
        rotationDegrees: 0,
      }),
    newLayout(SITE),
  )
}

/** The name a typed name comes back as, or a failure naming what was wrong. */
function called(raw: string): string {
  const named = nameFor(raw)

  if (!named.usable) {
    throw new Error(`refused: ${named.reason}`)
  }

  return named.name
}

/**
 * Storage as the core sees it: a variable that can be a fixture, and can be made
 * to fail the way a browser refuses in private browsing or out of room. The same
 * fake the saved work is tested against, because the port is the same shape.
 */
class FakeStorage implements CollectionEffects {
  stored: unknown

  reads = 0
  writes = 0
  fails: 'read' | 'write' | undefined

  constructor(stored?: unknown) {
    this.stored = stored
  }

  read(): Promise<unknown> {
    this.reads += 1

    return this.fails === 'read' ? Promise.reject(new Error('no')) : Promise.resolve(this.stored)
  }

  write(collections: readonly VehicleCollection[]): Promise<void> {
    this.writes += 1

    if (this.fails === 'write') {
      return Promise.reject(new Error('no'))
    }

    // Through text, the way storage holds it.
    this.stored = JSON.parse(JSON.stringify(collections)) as unknown

    return Promise.resolve()
  }
}

describe("the System Collection among the visitor's own", () => {
  it('is always there, whether or not the visitor has any collections', () => {
    expect(allCollections([])).toEqual([SYSTEM_COLLECTION])
    expect(allCollections([])[0]?.vehicles).toEqual(systemVehicles)
    expect(allCollections([mine('m', 'Mine')]).map((each) => each.name)).toEqual([
      SYSTEM_COLLECTION_NAME,
      'Mine',
    ])
  })

  it('cannot be renamed, deleted or edited by anything that names it by id', () => {
    const collections = [mine('m', 'Mine', [SUV])]

    expect(withRenamed(collections, SYSTEM_COLLECTION_ID, 'Hijacked')).toEqual(collections)
    expect(withoutCollection(collections, SYSTEM_COLLECTION_ID)).toEqual(collections)
    expect(withVehicle(collections, SYSTEM_COLLECTION_ID, COACH)).toEqual(collections)
    expect(withoutVehicle(collections, SYSTEM_COLLECTION_ID, SUV)).toEqual(collections)
    expect(withEditedVehicle(collections, SYSTEM_COLLECTION_ID, SUV, COACH)).toEqual(collections)
  })

  it("cannot be created as one of the visitor's own collections", () => {
    expect(withCreated([], SYSTEM_COLLECTION)).toEqual([])
  })
})

describe('naming a collection', () => {
  it('takes a typed name as the visitor meant it', () => {
    expect(called('  My \t fleet ')).toBe('My fleet')
  })

  it('refuses a name that is not a name', () => {
    for (const empty of ['', '   ', '\u0000\t ', '\u007f']) {
      expect(nameFor(empty).usable, JSON.stringify(empty)).toBe(false)
    }
  })

  it('trims an overlong name rather than refusing it', () => {
    expect(called('x'.repeat(MAXIMUM_COLLECTION_NAME_LENGTH + 20))).toHaveLength(
      MAXIMUM_COLLECTION_NAME_LENGTH,
    )
  })

  it("refuses the System Collection's name, however it is typed", () => {
    for (const attempt of [
      SYSTEM_COLLECTION_NAME,
      '  standard   vehicles ',
      'STANDARD VEHICLES',
      `\u0000${SYSTEM_COLLECTION_NAME}`,
    ]) {
      const named = nameFor(attempt)

      expect(named.usable, attempt).toBe(false)
      expect(named.usable ? '' : named.reason).toContain(SYSTEM_COLLECTION_NAME)
    }
  })
})

describe('importing a collection, which is always a fork', () => {
  it('makes a new collection out of what arrived, and leaves what was there alone', () => {
    const collections = [mine('m', 'Fleet A')]
    const forked = received(collections, ARRIVED, 'new-id')

    expect(forked.id).toBe('new-id')
    expect(forked.vehicles).toEqual([SUV, COACH])
    // Nothing was merged into and nothing was overwritten: the list it was
    // handed is exactly as it was, and the arrival is not touched either.
    expect(collections).toEqual([mine('m', 'Fleet A')])
    expect(ARRIVED).toEqual({ name: 'Fleet A', vehicles: [SUV, COACH] })
  })

  it('suffixes a name that is already taken rather than refusing or overwriting', () => {
    const collections = [mine('m', 'Fleet A', [SUV])]
    const forked = received(collections, ARRIVED, 'new-id')

    expect(forked.name).toBe('Fleet A (2)')
    expect(collections[0]?.vehicles).toEqual([SUV])
  })

  it('keeps going until it finds a free name', () => {
    const collections = [mine('a', 'Fleet A'), mine('b', 'Fleet A (2)'), mine('c', 'Fleet A (3)')]

    expect(received(collections, ARRIVED, 'new-id').name).toBe('Fleet A (4)')
  })

  it('treats a name that differs only in case as taken', () => {
    // Two rows a reader cannot tell apart are not a list, so the comparison is
    // made on what is read rather than on what was typed.
    const collections = [mine('a', 'fleet a')]

    expect(received(collections, ARRIVED, 'new-id').name).toBe('Fleet A (2)')
  })

  it("suffixes the System Collection's name rather than refusing the arrival", () => {
    const forked = received([], { name: SYSTEM_COLLECTION_NAME, vehicles: [SUV] }, 'new-id')

    expect(forked.name).toBe(`${SYSTEM_COLLECTION_NAME} (2)`)
    expect(forked.id).toBe('new-id')
    expect(forked.id).not.toBe(SYSTEM_COLLECTION_ID)
  })

  it('records the name it came from as provenance, and nothing else', () => {
    const forked = received([], ARRIVED, 'new-id')

    expect(forked.source).toBe('Fleet A')
    // There are no accounts, so there is no person, no address and no identity:
    // the source is a name to show, and the whole of it is the fields here.
    expect(Object.keys(forked).sort()).toEqual(['id', 'name', 'source', 'vehicles'])
  })

  it('has nothing to say about where it came from when the arrival is unnamed', () => {
    const forked = received([], { name: '   ', vehicles: [SUV] }, 'new-id')

    expect(forked.name).toBe('Received collection')
    expect(forked.source).toBeUndefined()
  })

  it('never merges two arrivals that hold the same vehicles', () => {
    let collections: readonly VehicleCollection[] = []

    collections = withCreated(collections, received(collections, ARRIVED, 'one'))
    collections = withCreated(collections, received(collections, ARRIVED, 'two'))

    expect(collections.map((each) => each.name)).toEqual(['Fleet A', 'Fleet A (2)'])
  })

  it('gives the fork vehicles of its own, so editing it cannot reach the arrival', () => {
    const forked = received([], ARRIVED, 'new-id')
    const edited = withEditedVehicle([forked], 'new-id', SUV, COACH)
    const back = edited[0]

    expect(back?.vehicles).toEqual([COACH, COACH])
    expect(ARRIVED.vehicles).toEqual([SUV, COACH])
  })
})

describe("which of a Layout's vehicles are absent", () => {
  it('counts the System Collection, so a vehicle dragged from the palette is never missing', () => {
    expect(missingFrom([], laidWith(SUV, COACH))).toEqual([])
  })

  it('finds nothing missing in a Layout with nothing on it', () => {
    expect(missingFrom([], newLayout(SITE))).toEqual([])
  })

  it('names exactly the vehicles that are in none of the collections', () => {
    const collections = [mine('m', 'Mine', [TOW_TRUCK])]

    expect(missingFrom(collections, laidWith(SUV, TOW_TRUCK, BOX_VAN))).toEqual([BOX_VAN])
  })

  it("counts the visitor's own collections as well as the System Collection", () => {
    expect(missingFrom([mine('m', 'Mine', [BOX_VAN])], laidWith(BOX_VAN))).toEqual([])
  })

  it('compares by value, so a copy that came back from storage is the same vehicle', () => {
    // A Layout carries copies (ADR 0002), and a trip through storage leaves two
    // equal vehicles that are not the same object. A report by reference would
    // call every vehicle missing, every time.
    const stored = JSON.parse(JSON.stringify(BOX_VAN)) as Vehicle

    expect(missingFrom([mine('m', 'Mine', [stored])], laidWith(BOX_VAN))).toEqual([])
  })

  it('says one vehicle once, however many copies of it are placed', () => {
    expect(missingFrom([], laidWith(BOX_VAN, BOX_VAN, BOX_VAN))).toEqual([BOX_VAN])
  })

  it('reports in the order the Layout first uses them', () => {
    expect(missingFrom([], laidWith(BOX_VAN, TOW_TRUCK, BOX_VAN))).toEqual([BOX_VAN, TOW_TRUCK])
  })
})

describe("adopting a Layout's missing vehicles", () => {
  it('makes a new collection of exactly the missing vehicles, named for a new one', () => {
    const collections = [mine('m', 'Mine', [TOW_TRUCK])]
    const after = withCreated(collections, adopted(collections, [BOX_VAN], 'new-id'))

    expect(after.map((each) => each.name)).toEqual(['Mine', 'Collection 1'])
    expect(after[1]).toEqual({ id: 'new-id', name: 'Collection 1', vehicles: [BOX_VAN] })
  })

  it('names it past the names already taken', () => {
    const collections = [mine('a', 'Collection 1'), mine('b', 'Collection 2')]

    expect(adopted(collections, [BOX_VAN], 'new-id').name).toBe('Collection 3')
  })

  it('leaves every collection the visitor already has byte-identical', () => {
    const collections = [mine('m', 'Mine', [TOW_TRUCK, COACH])]
    const before = JSON.stringify(collections)

    withCreated(collections, adopted(collections, [BOX_VAN], 'new-id'))

    expect(JSON.stringify(collections)).toBe(before)
  })

  it('has nothing to say about where it came from, since no one sent it', () => {
    // Provenance is a name somebody else's collection had. This one came off the
    // ground in front of the visitor, so there is no sender to name.
    expect(adopted([], [BOX_VAN], 'new-id').source).toBeUndefined()
  })

  it('makes the missing vehicles present, so there is nothing left to report', () => {
    const collections = [mine('m', 'Mine', [TOW_TRUCK])]
    const laid = laidWith(TOW_TRUCK, BOX_VAN)
    const missing = missingFrom(collections, laid)

    expect(missing).toEqual([BOX_VAN])

    const after = withCreated(collections, adopted(collections, missing, 'new-id'))

    expect(missingFrom(after, laid)).toEqual([])
  })
})

describe('a content hash, which is a duplicate hint and nothing more', () => {
  it('hashes the fleet rather than the order it arrived in', () => {
    expect(contentHash([SUV, COACH])).toBe(contentHash([COACH, SUV]))
  })

  it('tells two different fleets apart', () => {
    expect(contentHash([SUV])).not.toBe(contentHash([SUV, COACH]))
  })

  it('points at a collection the visitor already has', () => {
    const collections = [mine('m', 'Fleet A', [COACH, SUV])]

    expect(samenessHint(collections, ARRIVED)?.id).toBe('m')
  })

  it('says nothing when the visitor has nothing like it', () => {
    expect(samenessHint([mine('m', 'Fleet A', [SUV])], ARRIVED)).toBeUndefined()
    expect(samenessHint([], ARRIVED)).toBeUndefined()
  })

  it('is not consulted by an import, so a duplicate is still a fork', () => {
    // The hint said this arrival is already here. It makes no difference: an
    // import is always a new collection, and an import whose hint is wrong,
    // stale or absent behaves exactly the same way.
    const collections = [mine('m', 'Fleet A', [SUV, COACH])]

    expect(samenessHint(collections, ARRIVED)?.id).toBe('m')

    const after = withCreated(collections, received(collections, ARRIVED, 'fork'))

    expect(after).toHaveLength(2)
    expect(after[1]?.name).toBe('Fleet A (2)')
    expect(after[0]?.vehicles).toEqual([SUV, COACH])
  })
})

describe("editing the visitor's own collections", () => {
  it('keeps them in the order they were made', () => {
    let collections: readonly VehicleCollection[] = []

    collections = withCreated(collections, mine('a', 'First'))
    collections = withCreated(collections, mine('b', 'Second'))

    expect(collections.map((each) => each.name)).toEqual(['First', 'Second'])
  })

  it("refuses a collection under the System Collection's name, and takes none of it", () => {
    const collections = [mine('a', 'First')]

    expect(withCreated(collections, mine('b', SYSTEM_COLLECTION_NAME))).toEqual(collections)
    expect(withCreated(collections, mine('c', '  standard vehicles '))).toEqual(collections)
  })

  it('offers a name for a new collection that nothing has taken', () => {
    expect(nextCollectionName([])).toBe('Collection 1')
    expect(nextCollectionName([mine('a', 'Collection 1')])).toBe('Collection 2')

    // Names can be anything, including ones that look generated.
    expect(nextCollectionName([mine('a', 'Collection 1'), mine('b', 'Collection 3')])).toBe(
      'Collection 2',
    )
  })

  it('does not take a second collection under an id it already holds', () => {
    const collections = [mine('a', 'First', [SUV])]

    expect(withCreated(collections, mine('a', 'Imposter'))).toEqual(collections)
  })

  it('renames one where it sits, and refuses a name that is not one', () => {
    const collections = [mine('a', 'First'), mine('b', 'Second')]

    expect(withRenamed(collections, 'b', '  The   far   fleet ').map((each) => each.name)).toEqual([
      'First',
      'The far fleet',
    ])
    expect(withRenamed(collections, 'b', ' \u0000\t ')).toEqual(collections)
    expect(withRenamed(collections, 'b', SYSTEM_COLLECTION_NAME)).toEqual(collections)
  })

  it('takes one away without touching the others', () => {
    const collections = [mine('a', 'First'), mine('b', 'Second')]

    expect(withoutCollection(collections, 'a').map((each) => each.name)).toEqual(['Second'])
  })

  it('adds a vehicle, and does not hold the same vehicle twice', () => {
    const collections = [mine('a', 'First', [SUV])]
    const more = withVehicle(collections, 'a', COACH)

    expect(more[0]?.vehicles).toEqual([SUV, COACH])
    expect(withVehicle(more, 'a', COACH)[0]?.vehicles).toEqual([SUV, COACH])
    // A vehicle nobody has is a collection nobody has, and nothing happens.
    expect(withVehicle(collections, 'nowhere', COACH)).toEqual(collections)
  })

  it('corrects a vehicle in one collection and leaves the others alone', () => {
    const collections = [mine('a', 'First', [SUV]), mine('b', 'Second', [SUV])]
    const wider = { ...SUV, widthInches: 96 }
    const corrected = withEditedVehicle(collections, 'b', SUV, wider)

    expect(corrected[0]?.vehicles).toEqual([SUV])
    expect(corrected[1]?.vehicles).toEqual([wider])
    expect(collections[1]?.vehicles).toEqual([SUV])
  })

  it('removes a vehicle, leaving the rest', () => {
    const collections = [mine('a', 'First', [SUV, COACH])]

    expect(withoutVehicle(collections, 'a', SUV)[0]?.vehicles).toEqual([COACH])
    expect(withoutVehicle(collections, 'a', { ...SUV })[0]?.vehicles).toEqual([COACH])
  })
})

describe('deleting a collection', () => {
  it('cannot break a Layout, because a Layout carries its own vehicles', () => {
    const collections = [mine('m', 'Fleet A', [SUV, COACH])]
    const laid: Layout = withPlacement(newLayout(SITE), {
      id: 'one',
      vehicle: COACH,
      centre: { eastMetres: 12.5, northMetres: -3.25 },
      rotationDegrees: 90,
    })

    // Correcting the collection's copy does not reach the Layout's copy, and
    // neither does throwing the collection away (ADR 0002).
    const wider = { ...COACH, widthInches: 96 }
    const edited = withEditedVehicle(collections, 'm', COACH, wider)
    const left = withoutCollection(edited, 'm')

    expect(left).toEqual([])
    expect(laid.placements[0]?.vehicle).toEqual(COACH)
    expect(laid.placements[0]?.centre).toEqual({ eastMetres: 12.5, northMetres: -3.25 })
  })
})

describe('what storage gave back', () => {
  const good: VehicleCollection = {
    id: 'good',
    name: 'Fleet A',
    vehicles: [SUV, COACH],
    source: 'Fleet A',
  }

  it('reads back exactly what was written, provenance and all', () => {
    const collections = [good, mine('other', 'Second', [SUV])]
    const stored: unknown = JSON.parse(JSON.stringify(collections)) as unknown

    expect(readCollections(stored)).toEqual(collections)
  })

  it('drops what it cannot read rather than refusing to open', () => {
    const junk: readonly unknown[] = [
      undefined,
      null,
      42,
      'not a list',
      {},
      { collections: [] },
      { id: '', name: 'No id', vehicles: [] },
      { id: 'no-name', vehicles: [] },
      { id: 'blank-name', name: ' \u0000 ', vehicles: [] },
      { id: 'no-vehicles', name: 'No vehicles' },
      { id: 'loose-vehicles', name: 'Loose', vehicles: 'no' },
      {
        id: 'nameless-vehicle',
        name: 'Nameless',
        vehicles: [{ name: '', shortLabel: 'X', widthInches: 1, lengthInches: 1, colour: 1 }],
      },
      {
        id: 'zero-width',
        name: 'Zero',
        vehicles: [{ name: 'Zero', shortLabel: 'Z', widthInches: 0, lengthInches: 1, colour: 1 }],
      },
      { id: SYSTEM_COLLECTION_ID, name: 'Imposter', vehicles: [SUV] },
    ]

    for (const one of junk) {
      expect(readCollections([good, one]), JSON.stringify(one)).toEqual([good])
    }
  })

  it('reads nothing out of anything that is not a list', () => {
    expect(readCollections(undefined)).toEqual([])
    expect(readCollections(null)).toEqual([])
    expect(readCollections({ mine: [] })).toEqual([])
    expect(readCollections('[]')).toEqual([])
  })

  it("will not let a stored record take the System Collection's name", () => {
    const read = readCollections([
      { id: 'imposter', name: `  ${SYSTEM_COLLECTION_NAME} `, vehicles: [SUV] },
    ])

    // Renamed rather than dropped: the name cannot be taken, and the vehicles
    // are the part worth keeping.
    expect(read).toHaveLength(1)
    expect(read[0]?.name).toBe(`${SYSTEM_COLLECTION_NAME} (2)`)
    expect(read[0]?.vehicles).toEqual([SUV])
  })

  it("keeps two of the visitor's own collections that share a name", () => {
    // They were allowed to type it, so it is not the reader's business to
    // rename one of them out from under them.
    const read = readCollections([mine('a', 'Fleet'), mine('b', 'Fleet')])

    expect(read.map((each) => each.name)).toEqual(['Fleet', 'Fleet'])
  })

  it('keeps the first of two entries sharing an id', () => {
    const read = readCollections([mine('a', 'First'), mine('a', 'Imposter')])

    expect(read.map((each) => each.name)).toEqual(['First'])
  })
})

describe('reaching storage', () => {
  it('loads what the visitor has', async () => {
    const storage = new FakeStorage([mine('a', 'Fleet A')])
    const loaded = await loadCollections(storage)

    expect(loaded.collections.map((each) => each.name)).toEqual(['Fleet A'])
    expect(loaded.saving).toBe(KEPT)
  })

  it('starts with nothing when there is nothing there', async () => {
    const loaded = await loadCollections(new FakeStorage(undefined))

    expect(loaded.collections).toEqual([])
    expect(loaded.saving.kept).toBe(true)
  })

  it('keeps what it is given, and says it did', async () => {
    const storage = new FakeStorage(undefined)
    const saving = await writeCollections([mine('a', 'Fleet A')], storage)

    expect(saving).toBe(KEPT)
    expect(storage.writes).toBe(1)
    expect(storage.stored).toEqual([mine('a', 'Fleet A')])
  })

  it('carries on in memory, and says so, when storage will not give anything', async () => {
    const storage = new FakeStorage(undefined)
    storage.fails = 'read'

    const loaded = await loadCollections(storage)

    expect(loaded.collections).toEqual([])
    expect(loaded.saving.kept).toBe(false)
    expect(loaded.saving.kept ? '' : loaded.saving.message).toBe(COLLECTIONS_NOT_KEPT)
  })

  it('carries on in memory, and says so, when storage will not keep anything', async () => {
    const storage = new FakeStorage(undefined)
    storage.fails = 'write'

    const saving = await writeCollections([mine('a', 'Fleet A')], storage)

    expect(saving.kept).toBe(false)
    expect(saving.kept ? '' : saving.message).toBe(COLLECTIONS_NOT_KEPT)
  })

  it('goes through text on the way in, as a browser does', async () => {
    const storage = new FakeStorage(undefined)
    await writeCollections([mine('a', 'Fleet A', [SUV])], storage)

    expect(readCollections(storage.stored)).toEqual([mine('a', 'Fleet A', [SUV])])
  })
})
