import type { Layout } from './layout'

/**
 * Undo and redo over a Layout.
 *
 * Every change to a Layout returns a new one and leaves the old one exactly as it
 * was (ADR 0004), so history is a stack of Layouts rather than a set of inverse
 * operations. Undoing is popping and redoing is pushing back, and nothing
 * anywhere has to know how to un-rotate a vehicle or un-delete one - which is
 * what makes this the cheapest possible answer to the question, and the reason
 * that discipline was worth paying for when the Layout was built.
 *
 * Session-only by construction: this is memory, and nothing here writes anywhere.
 * Capped, because an afternoon of nudging one vehicle should not become an
 * unbounded pile of states, and nobody wants to undo forty times to get back to
 * where they could have gone with a delete.
 */

/** How many states back the history reaches. */
export const HISTORY_LIMIT = 50

export interface Editor {
  /** The Layout as it stands. */
  readonly present: Layout
  /** What it was before each edit, oldest first. */
  readonly past: readonly Layout[]
  /** What has been undone, nearest to being redone first. */
  readonly future: readonly Layout[]
}

/** An editor with a Layout in it and nowhere yet to go. */
export function startEditing(layout: Layout): Editor {
  return { present: layout, past: [], future: [] }
}

/**
 * The editor with an edit made.
 *
 * The redo stack goes: an edit made after undoing is a different history from
 * the one that was undone, so there is nothing left to go forward to.
 */
export function edit(editor: Editor, next: Layout): Editor {
  return {
    present: next,
    past: [...editor.past, editor.present].slice(-HISTORY_LIMIT),
    future: [],
  }
}

export function canUndo(editor: Editor): boolean {
  return editor.past.length > 0
}

export function canRedo(editor: Editor): boolean {
  return editor.future.length > 0
}

/** One step back, or the very same editor when there is nowhere to go. */
export function undo(editor: Editor): Editor {
  const previous = editor.past.at(-1)

  if (previous === undefined) {
    return editor
  }

  return {
    present: previous,
    past: editor.past.slice(0, -1),
    future: [editor.present, ...editor.future],
  }
}

/** One step forward, or the very same editor when there is nowhere to go. */
export function redo(editor: Editor): Editor {
  const next = editor.future[0]

  if (next === undefined) {
    return editor
  }

  return {
    present: next,
    past: [...editor.past, editor.present].slice(-HISTORY_LIMIT),
    future: editor.future.slice(1),
  }
}
