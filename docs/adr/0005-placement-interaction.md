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
- Rotation and placement snap to **candidate angles**: the Site Frame's rotation ± multiples of
  **15°**, plus the angles of nearby Placements.

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
- **North-relative angle snapping.** Rejected for the reason above.
- **A per-Layout frame drawn in-app, or rotating the map view.** Rejected: the frame is a property
  of the *place*, so it belongs to the Site; and Leaflet has no map bearing, so view rotation would
  reopen ADR 0001's library choice to buy readability rather than to fix snapping.

## Consequences

- Every gesture here is drivable by browser automation, which is what makes the e2e seam worth
  having.
- Site-wide snapping needs a Site Frame to be useful; Sites without one fall back to neighbour
  angles alone — degraded, not broken, and never a setup gate before placing anything.
- A lot with two wings at different angles cannot be expressed by one frame, which is why neighbour
  snapping is kept alongside it.