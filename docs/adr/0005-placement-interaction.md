---
status: accepted
---

# Placement interaction: drag on a Placement moves it, drag elsewhere pans

The touch conflict is not "drag versus pan" — it is **padding versus panning**. A 6.5 ft car at a
zoomed-out scale is a handful of pixels, so hit targets must be padded well beyond the drawn
rectangle, and a generous pad then swallows touches meant for the map. The model is therefore:

- A one-finger drag **beginning on a Placement** moves it; beginning anywhere else pans the map.
- A **tap** selects, showing an outline and a rotation handle.
- **Rotation is only ever the handle**, so rotating can never be confused with moving.
- **Two fingers always pan and zoom**, including with one finger resting on a Placement — the
  escape hatch when a drag was a mis-grab.
- A **lock toggle** makes every gesture pan, for reviewing a finished layout and for bulk panning
  while placing many.
- A **long-press** selects as an alternative to a tap, for small or overlapping targets.
- Rotation snaps to **candidate angles**: the Site Frame's own rotation, plus the angles of the
  Placements already in the Layout. A vehicle can still be set to **any angle at all** - the
  candidates are a magnet rather than a set of permitted positions.

Absolute north-relative snapping is deliberately **not** used. A lot is typically not aligned to
north, so snapping to 15°/45°/90° from north pulls vehicles off the row they are meant to match.
The Site Frame supplies the axes that north cannot.

## Considered options

- **A lock toggle alone.** Rejected as the sole mechanism: it forces a mode the user must remember,
  and forgetting it makes dragging silently do nothing.
- **Select-then-drag exclusively** — only a selected Placement can be moved. Rejected: workable, but
  it adds a step to every adjustment and bulk work suffers.
- **Long-press alone.** Rejected: unambiguous and familiar, but a 300–500 ms hold before each
  adjustment is tedious when placing dozens.
- **A 15° ladder around the frame.** This ADR said so until a vehicle could be placed and turned at
  all. It turned out to buy convenience rather than capability - a 45 or a 60 degree arrangement
  inside the frame - while costing a step size, a tolerance that then had to fight that step size,
  and an answer for every angle exactly halfway between two candidates. The case that matters is a
  row lining up with a row already laid, and no ladder reaches it: only the vehicles themselves do.
- **North-relative angle snapping.** Rejected for the reason above.
- **A per-Layout frame drawn in-app, or rotating the map view.** Rejected: the frame is a property
  of the _place_, so it belongs to the Site; and Leaflet has no map bearing, so view rotation would
  reopen ADR 0001's library choice to buy readability rather than to fix snapping.

## Consequences

- Every gesture here is drivable by browser automation, which is what makes the e2e seam worth
  having.
- Site-wide snapping needs a Site Frame to be useful; Sites without one fall back to neighbour
  angles alone — degraded, not broken, and never a setup gate before placing anything.
- A lot with two wings at different angles cannot be expressed by one frame, which is why neighbour
  snapping is kept alongside it.

## What building it settled

- **The pad is a number of screen pixels, not of metres.** A car is under seven pixels wide where
  this app opens, and a metre of padding would be invisible exactly where it is needed. The target
  is grown by about a fingertip in every direction; the drawing is not, so a vehicle still occupies
  the ground it occupies.
- **A press travels before it moves anything.** A vehicle a few pixels across cannot be selected by
  a finger that also nudges it, so the move arms on movement beyond a small slop, or on the long
  press. The long press is what makes the small or overlapping target reliable: the move is armed
  while the finger is still, so the next movement is a move and not a pan. A picked-up vehicle is
  marked until the finger is lifted, because the hold has to say that it took.
- **A tap is select, so double-tap-to-zoom is off.** Leaflet fires a double tap for any two taps
  within 200 ms, wherever they landed, so on a map where a tap selects, tapping a vehicle and then
  tapping the ground to let it go zoomed the picture towards the second tap. Two fingers zoom, and
  the zoom control is there for everything else.
- **The lock is a view of the session, not part of the work.** It is not written into a Layout, it
  does not survive a reload, and it is not on the undo stack (ADR 0008) — the same reasoning that
  keeps the map's viewport and the opacity out of a Layout. Locking also lets go of the selection,
  because a handle and a form are things to touch.
