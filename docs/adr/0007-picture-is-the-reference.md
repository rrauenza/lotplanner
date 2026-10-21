---
status: accepted
---

# The picture is the reference, not the planet

The question this app answers is "do these vehicles fit in this space?", and it answers it by laying
rectangles over a photograph. What has to be right is that a rectangle drawn over the photograph
measures the same as the vehicles already in it, and keeps measuring that while the view is zoomed.
Nothing depends on where the space is to the metre, on the shape of the earth, or on a datum.

Distances are therefore kept in real ground metres - a vehicle's length is published in them - and the
geometry is a **local plane** centred on the Site: one stretch factor per latitude, applied to both
axes, exact across the few hundred metres a Site spans. A Site's absolute coordinates exist for one
reason only, which is that the imagery service needs them to return the right photograph. Nothing else
reads them.

One consequence carries real weight and is easy to get wrong: **imagery must be requested in the same
plane the map draws in**, which means EPSG:3857 on both sides. Asking for degrees returns a picture
whose pixels are evenly spaced in degrees, which the map then stretches unevenly north to south - and
every rectangle laid over it is quietly false.

## Considered options

- **Survey-grade geodesy** - a proper ellipsoid, datum handling, ground-control points. Rejected: it
  buys accuracy that nothing in the app asks for. No visitor's question is answered better by knowing
  a rectangle is 40 cm out across a 100 m space than by knowing it sits where they put it.
- **A degree-based local grid**, avoiding the projection altogether. Rejected: it is exactly the
  stretched-picture error above, and vehicle dimensions would stop being true north to south.
- **Being a mapping tool** - a scale bar, a coordinate readout, a distance measure. Rejected: each one
  is a promise of accuracy that this is not making, and each one invites the precision work the first
  option describes.

## Consequences

- Absolute accuracy is deliberately not a goal, and nothing should be added that implies it. There is
  no scale bar, no coordinates read out, and no measurement tool.
- The _rendering_ is where precision does matter, and it is not negotiable: the picture, the map and
  the rectangles have to work in one plane, or the tool's single claim fails.
- Sites can be authored by eye, straight off the imagery, which is what makes the creator mode's
  "draw a rectangle and rotate it" flow sufficient rather than a compromise.
- A Site cannot be moved on the earth without re-fetching its picture, because a picture is a window
  onto one place. An imagery alignment offset, if one is ever needed, is a nudge rather than a survey.
- Distances asserted in tests are there to catch mistakes - a wrong constant, a swapped axis, a
  rotation applied to the label instead of the shape - and not to claim accuracy.
