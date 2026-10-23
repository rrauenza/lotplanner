---
status: accepted
---

# Layout edits are immutable snapshots, so undo is a stack pop

The Layout is the only editable state in the app: Vehicles inside a Layout are its own copies,
Collections are immutable or user-owned, Sites are authored, and the imagery is read-only. Editing
happens through drags and rotations, which are imprecise on a touch screen, so undo is a
requirement rather than a nicety. Layout state is kept as immutable snapshots on a stack, making
undo a pop and redo a push — rather than mutating state in place and reconstructing the inverse of
every gesture.

## Considered options

- **Mutable state with an inverse operation per gesture.** Less memory and no snapshot discipline,
  but every new edit type needs a correct inverse, and a wrong inverse silently corrupts history.
  Retrofitting snapshots later means rewriting the drag handlers — which is why this is decided
  before the editor exists.
- **No undo.** Rejected: on a phone, a mis-drag that cannot be undone makes the app feel broken, and
  touch-first authoring is the whole point.

## Consequences

- Because a Layout embeds its own Vehicle copies (ADR 0002), a snapshot is small: Placements plus
  their Vehicle copies, never the Site or the imagery.
- Because the stack is memory and nothing more, it lasts exactly as long as the session: a reload
  begins with nothing to undo. It is also capped, so a long afternoon of nudging one vehicle cannot
  grow without bound.
- **Naming and choosing are not Layout edits.** A Layout's name, and which of a Site's Layouts is
  open, belong to the saved work rather than to the arrangement (ADR 0008), so they are not on this
  stack and undo does not reach them.
- This is also why Collections stay out of the undo model — they are not edited in place while a
  Layout is open.
