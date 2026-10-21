---
status: accepted
---

# Sites are created in-app and committed as manifest entries

A Site's manifest entry is not hand-written. The deployed app carries a hidden creator mode that finds
a place by address search, lets the creator draw a rectangle over the space and rotate it to match, and
emits the manifest entry as JSON to commit. This exists because the alternative — determining
coordinates, an extent and a frame angle with outside tools — requires measuring a bearing by hand, and
because aligning a rectangle by eye against the imagery is both easier and more accurate than reading an
angle off a compass.

The app cannot write to the repository, so the creator mode's output is text the creator pastes into the
manifest and deploys. That keeps the manifest as the single source of truth and keeps the deployed app
free of any write path.

## Considered options

- **Hand-authored manifest using outside tools.** Rejected: it requires measuring the space's orientation
  by hand, which is exactly the step the Site Frame exists to avoid, and it turns adding a Site into an
  exercise in arithmetic rather than in looking at the place.
- **A separate authoring tool, or a second bundle.** Rejected: it needs the same imagery, the same
  coordinate maths and the same codec, so a second bundle buys nothing but a second thing to deploy.
- **Persisting a creator-drawn Site to the browser rather than the manifest.** Rejected: it would be
  per-browser, invisible to every visitor, and impossible to share, because there is no backend.
- **A zero-dependency creator flow, panning to each site by hand.** Rejected as the default: a keyless
  geocoder is worth the app's only third-party runtime dependency for a tool used occasionally by one
  person, where the usage policy (about one request per second, identifying the app) is trivially met.

## Consequences

- The app acquires its **only third-party runtime dependency** — a keyless geocoder — reachable only from
  the creator mode. Visitors never touch it, and the e2e layer intercepts it.
- The creator mode also uses the cached XYZ basemap for navigation, whose cache stops at z16 (about
  1.9 m/px): ample for finding a space, useless for drawing its edges. Hence the two-tier flow.
- **The imagery extent is not the Site Frame.** It is the frame expanded by a context margin, so the place
  is seen in its surroundings. Cropping the image to the rectangle was rejected outright: the approach,
  the entrance and the adjacent space are what tell you whether a layout is workable.
- The frame is a guide, never a constraint, so the fetched extent bounds panning only, never placement.
- Adding a Site costs one address search, one 15–22 s fetch, a rectangle, and a commit.
