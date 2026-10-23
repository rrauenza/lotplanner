import { describe, expect, it } from 'vitest'

import {
  KEPT,
  MAXIMUM_LAYOUT_NAME_LENGTH,
  NOTHING_KEPT,
  writeSaved,
  loadSaved,
  mostRecentOf,
  nextName,
  readSaved,
  withSaved,
  withRenamed,
  savedWith,
  withoutSaved,
  type SavedEffects,
  type SavedLayout,
} from './saved'
import { newLayout, withPlacement, type Layout, type Placement } from './layout'
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

const SUV = vehicle({
  name: 'Car / SUV (Ford Explorer)',
  shortLabel: 'SUV',
  widthInches: 79,
  lengthInches: 199,
  colour: '#3b82f6',
})

function at(id: string): Placement {
  return { id, vehicle: SUV, centre: { eastMetres: 12.34, northMetres: -5.6 }, rotationDegrees: 90 }
}

function laid(): Layout {
  return withPlacement(newLayout(SITE), at('one'))
}

function entry(id: string, name: string): SavedLayout {
  return { id, name, layout: laid() }
}

/**
 * Storage as the core sees it: a variable that can be a fixture, and can be made
 * to fail the way a browser refuses when it is in private browsing or out of
 * room. Nothing here is a mocking framework, because the port is small enough
 * not to need one.
 */
class FakeStorage implements SavedEffects {
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

  write(_siteId: string, saved: readonly SavedLayout[]): Promise<void> {
    this.writes += 1

    if (this.fails === 'write') {
      return Promise.reject(new Error('no'))
    }

    // Through text, the way storage holds it: what comes back has to be plain
    // data rather than anything that only lived in this tab.
    this.stored = JSON.parse(JSON.stringify(saved)) as unknown

    return Promise.resolve()
  }
}

describe('the Layouts a Site holds', () => {
  it('keeps a Layout at the front, which is the one that was just worked on', () => {
    const kept = withSaved(withSaved([], entry('a', 'First')), entry('b', 'Second'))

    expect(kept.map((each) => each.name)).toEqual(['Second', 'First'])
    expect(mostRecentOf(kept)?.name).toBe('Second')
  })

  it('replaces a Layout it already holds rather than adding a second one', () => {
    const once = withSaved([entry('a', 'First')], entry('a', 'First'))
    const twice = withSaved(once, { ...entry('a', 'First'), layout: laid() })

    expect(twice).toHaveLength(1)
    expect(twice[0]?.id).toBe('a')
  })

  it('keeps every Layout it is given, however many there are', () => {
    let saved: readonly SavedLayout[] = []

    for (let number = 0; number < 60; number += 1) {
      saved = withSaved(saved, entry(`id-${String(number)}`, `Layout ${String(number)}`))
    }

    // Nothing is quietly dropped. The only limit is what the browser will hold,
    // and running out of room is reported rather than paid for with somebody's
    // oldest work.
    expect(saved).toHaveLength(60)
    expect(saved[0]?.id).toBe('id-59')
    expect(saved[59]?.id).toBe('id-0')
  })

  it('renames a Layout where it sits, and refuses a name that is not one', () => {
    const saved = [entry('a', 'First'), entry('b', 'Second')]
    const named = withRenamed(saved, 'b', '  The   far   option ')

    expect(named.map((each) => each.name)).toEqual(['First', 'The far option'])

    // Whitespace and control characters only: the row has to stay readable, so
    // the old name stands rather than the list going blank.
    expect(withRenamed(saved, 'b', ' \u0000\t ') === saved).toBe(true)
  })

  it('trims an overlong name rather than refusing it', () => {
    const long = 'x'.repeat(MAXIMUM_LAYOUT_NAME_LENGTH + 20)
    const named = withRenamed([entry('a', 'First')], 'a', long)

    expect(named[0]?.name).toHaveLength(MAXIMUM_LAYOUT_NAME_LENGTH)
  })

  it('takes a Layout away without touching the others', () => {
    const left = withoutSaved([entry('a', 'First'), entry('b', 'Second')], 'a')

    expect(left.map((each) => each.name)).toEqual(['Second'])
  })

  it('finds a Layout by id, and is not fooled by no id at all', () => {
    const saved = [entry('a', 'First')]

    expect(savedWith(saved, 'a')?.name).toBe('First')
    expect(savedWith(saved, 'nowhere')).toBeUndefined()
    expect(savedWith(saved, undefined)).toBeUndefined()
  })

  it('offers a name for a new Layout that no other one has taken', () => {
    expect(nextName([])).toBe('Layout 1')
    expect(nextName([entry('a', 'Layout 1')])).toBe('Layout 2')

    // Names can be anything, including ones that look like generated ones, so a
    // generated name is checked against what is actually there.
    expect(nextName([entry('a', 'Layout 1'), entry('b', 'Layout 2'), entry('c', 'Layout 4')])).toBe(
      'Layout 5',
    )
  })
})

describe('what storage gave back', () => {
  it('reads back exactly what was written, vehicle copies and all', () => {
    const saved = [entry('a', 'First'), entry('b', 'Second')]

    // Through text, which is how a browser keeps it.
    const stored: unknown = JSON.parse(JSON.stringify(saved)) as unknown

    expect(readSaved(stored)).toEqual(saved)
  })

  it('drops what it cannot read rather than refusing to open', () => {
    const readable = entry('good', 'Good')
    const junk: readonly unknown[] = [
      undefined,
      null,
      'not a layout',
      42,
      [],
      { id: 'no-name', layout: readable.layout },
      { id: '', name: 'No id', layout: readable.layout },
      { id: 'no-layout', name: 'No layout' },
      { id: 'loose-layout', name: 'Loose', layout: { siteId: 'x' } },
      { id: 'no-origin', name: 'No origin', layout: { ...readable.layout, origin: undefined } },
      {
        id: 'nan-origin',
        name: 'Not a number',
        layout: { ...readable.layout, origin: { latitude: Number.NaN, longitude: 0 } },
      },
      { id: 'frame-junk', name: 'Frame', layout: { ...readable.layout, frame: { centre: 3 } } },
    ]

    for (const one of junk) {
      expect(readSaved([readable, one]), JSON.stringify(one)).toEqual([readable])
    }
  })

  it('drops a placement it cannot read, and the Layout with it', () => {
    const good = entry('good', 'Good')
    const placements = good.layout.placements

    expect(readSaved([good])).toHaveLength(1)
    expect(readSaved([{ ...good, layout: { ...good.layout, placements: 'no' } }])).toEqual([])
    expect(readSaved([{ ...good, layout: { ...good.layout, placements: [{}] } }])).toEqual([])

    // A vehicle has to be a vehicle: a zero width is not a rectangle.
    expect(
      readSaved([
        {
          ...good,
          layout: {
            ...good.layout,
            placements: placements.map((one) => ({
              ...one,
              vehicle: { ...one.vehicle, widthInches: 0 },
            })),
          },
        },
      ]),
    ).toEqual([])
  })

  it('keeps the first of two entries sharing an id', () => {
    const saved = readSaved([entry('a', 'First'), entry('a', 'Imposter')])

    expect(saved.map((each) => each.name)).toEqual(['First'])
  })

  it('reads nothing out of anything but a list', () => {
    expect(readSaved(undefined)).toEqual([])
    expect(readSaved({ layouts: [] })).toEqual([])
    expect(readSaved('[]')).toEqual([])
  })

  it('reads a record of any length, whole and in the order it was written', () => {
    const crowded = Array.from({ length: 60 }, (_, number) =>
      entry(`id-${String(number)}`, `Layout ${String(number)}`),
    )
    const read = readSaved(crowded)

    expect(read).toHaveLength(60)
    expect(read[0]?.name).toBe('Layout 0')
    expect(read[59]?.name).toBe('Layout 59')
  })
})

describe('reaching storage', () => {
  it('loads what a Site holds', async () => {
    const storage = new FakeStorage([entry('a', 'First')])
    const loaded = await loadSaved(SITE.id, storage)

    expect(loaded.saved.map((each) => each.name)).toEqual(['First'])
    expect(loaded.saving).toBe(KEPT)
  })

  it('starts with nothing when a Site has never been opened', async () => {
    const loaded = await loadSaved(SITE.id, new FakeStorage(undefined))

    expect(loaded.saved).toEqual([])
    expect(loaded.saving.kept).toBe(true)
  })

  it('keeps the Site work it is given, and says it did', async () => {
    const storage = new FakeStorage(undefined)
    const saving = await writeSaved(SITE.id, [entry('a', 'First')], storage)

    expect(saving).toBe(KEPT)
    expect(storage.writes).toBe(1)
    expect(storage.stored).toEqual([entry('a', 'First')])
  })

  it('carries on in memory, and says so, when storage will not give anything', async () => {
    const storage = new FakeStorage(undefined)
    storage.fails = 'read'

    const loaded = await loadSaved(SITE.id, storage)

    expect(loaded.saved).toEqual([])
    expect(loaded.saving.kept).toBe(false)
    expect(loaded.saving.kept ? '' : loaded.saving.message).toBe(NOTHING_KEPT)
  })

  it('carries on in memory, and says so, when storage will not keep anything', async () => {
    const storage = new FakeStorage(undefined)
    storage.fails = 'write'

    const saving = await writeSaved(SITE.id, [entry('a', 'First')], storage)

    expect(saving.kept).toBe(false)
    expect(saving.kept ? '' : saving.message).toBe(NOTHING_KEPT)
  })

  it('goes through text on the way in, as a browser does', async () => {
    const storage = new FakeStorage(undefined)
    await writeSaved(SITE.id, [entry('a', 'First')], storage)

    // What came back is plain data, so a Layout read back is a Layout and not a
    // reference to anything this tab was holding.
    expect(readSaved(storage.stored)).toEqual([entry('a', 'First')])
  })
})
