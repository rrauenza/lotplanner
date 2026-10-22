import { describe, expect, it } from 'vitest'

import { EDIT_LIMIT, canRedo, canUndo, edit, redo, startEditing, undo, type Editor } from './editor'
import {
  duplicateOf,
  newLayout,
  withEditedVehicle,
  withMovedPlacement,
  withPlacement,
  withRotatedPlacement,
  withoutPlacement,
  type Layout,
  type Placement,
} from './layout'
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
  return { id, vehicle: SUV, centre: { eastMetres: 0, northMetres: 0 }, rotationDegrees: 90 }
}

function ids(layout: Layout): string[] {
  return layout.placements.map((each) => each.id)
}

describe('undo and redo', () => {
  const start = newLayout(SITE)
  const one = withPlacement(start, at('a'))
  const two = withPlacement(one, at('b'))

  it('walks a table of edits, undos, redos and a new edit', () => {
    // Each row is a step and what should be true once it has been taken: the
    // ids on the ground, and whether there is anywhere to go back to or forward
    // to from there.
    const table: readonly (readonly [
      string,
      (editor: Editor) => Editor,
      string[],
      boolean,
      boolean,
    ])[] = [
      ['starts empty', (editor) => editor, [], false, false],
      ['places the first', (editor) => edit(editor, one), ['a'], true, false],
      ['places the second', (editor) => edit(editor, two), ['a', 'b'], true, false],
      ['undoes the second', undo, ['a'], true, true],
      ['undoes the first', undo, [], false, true],
      ['undoes nothing', undo, [], false, true],
      ['redoes the first', redo, ['a'], true, true],
      ['redoes the second', redo, ['a', 'b'], true, false],
      ['redoes nothing', redo, ['a', 'b'], true, false],
      ['undoes the second again', undo, ['a'], true, true],
      ['deletes the first, which is new work', (editor) => edit(editor, start), [], true, false],
      ['undoes the delete', undo, ['a'], true, true],
    ]

    let editor = startEditing(start)

    for (const [does, step, expected, undoable, redoable] of table) {
      editor = step(editor)

      expect([does, ids(editor.present)]).toEqual([does, expected])
      expect([does, canUndo(editor)]).toEqual([does, undoable])
      expect([does, canRedo(editor)]).toEqual([does, redoable])
    }
  })

  it('reverses every kind of edit the app can make, most recent first', () => {
    const kinds: readonly (readonly [string, (layout: Layout) => Layout])[] = [
      ['places a vehicle', () => one],
      ['moves it', (layout) => withMovedPlacement(layout, 'a', { eastMetres: 5, northMetres: 5 })],
      ['turns it', (layout) => withRotatedPlacement(layout, 'a', 45)],
      ['duplicates it', (layout) => withPlacement(layout, duplicateOf(at('a'), 'copy'))],
      ['deletes the copy', (layout) => withoutPlacement(layout, 'copy')],
      [
        'edits the vehicle',
        (layout) => withEditedVehicle(layout, SUV, vehicle({ ...SUV, widthInches: 84 })),
      ],
    ]

    let editor = startEditing(start)

    // What the Layout looked like immediately before each kind of edit, so that
    // each undo can be checked against the state it is supposed to put back.
    const tabulated: { readonly does: string; readonly then: Layout }[] = []

    for (const [does, make] of kinds) {
      tabulated.push({ does, then: editor.present })
      editor = edit(editor, make(editor.present))
    }

    // Six kinds of edit, so undoing walks back through all six, newest first.
    for (const { does, then } of [...tabulated].reverse()) {
      editor = undo(editor)

      // The very snapshot that was on the ground before that edit, rather than
      // a rebuilt one: undo is a pop, which is what makes it dependable for
      // edits of every shape.
      expect(editor.present, `after undoing: ${does}`).toBe(then)
    }

    expect(ids(editor.present)).toEqual([])
    expect(canUndo(editor)).toBe(false)
    expect(canRedo(editor)).toBe(true)
  })

  it('forgets the oldest edits once there are more than the cap', () => {
    let editor = startEditing(start)

    for (let step = 0; step < EDIT_LIMIT + 10; step += 1) {
      editor = edit(editor, withPlacement(editor.present, at(`step-${String(step)}`)))
    }

    expect(editor.past).toHaveLength(EDIT_LIMIT)

    // And it reaches back exactly that far, no further: undoing everything there
    // is to undo leaves the oldest state it still holds.
    for (let step = 0; step < EDIT_LIMIT; step += 1) {
      editor = undo(editor)
    }

    expect(canUndo(editor)).toBe(false)
    expect(editor.present.placements).toHaveLength(10)
  })

  it('does nothing at the ends rather than erroring', () => {
    const untouched = startEditing(start)

    expect(undo(untouched)).toBe(untouched)
    expect(redo(untouched)).toBe(untouched)

    const edited = edit(untouched, one)

    expect(redo(edited)).toBe(edited)
  })
})
