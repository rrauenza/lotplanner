---
status: accepted
---

# Sites are created in-app and committed as manifest entries

A Site's manifest entry is not hand-written. The deployed app carries a hidden creator mode that finds
a candidate by address search, lets the creator draw a rectangle over the space and rotate it to match,
and emits the manifest entry to paste and commit. This exists because the alternative — determining
coordinates, an extent and a frame angle with outside tools — requires measuring a bearing by hand, and
because aligning a rectangle by eye against the imagery is both easier and more accurate than reading an
angle off a compass.

The mode is reached by a fragment — `#create`, and `#create/<site-id>` to correct an existing Site — and
by nothing else. A fragment is never sent to a server, so it works on GitHub Pages with no server route
and no rewrite rule, and nothing in the visitor's page links to it, names it or hints at it; the
creator's code is not even downloaded until its fragment is present. It is **hidden, not secret**: a
static app has no server to check a key against, and the mode changes nothing on the server — it emits
text and writes nowhere — so what it guarantees is only that nobody arrives by accident.

The app cannot write to the repository, so the creator mode's output is text the creator pastes into the
manifest and deploys. That keeps the manifest as the single source of truth and keeps the deployed app
free of any write path.

**The emitted text is not strict JSON, and does not claim to be.** It is a TypeScript object literal in
the manifest's own spelling — unquoted keys, single quotes, two spaces to a level, one key to a line, a
trailing comma so the entry can go anywhere in the list — because that is what is copied into
`manifest.ts` and committed. The ticket asked for the entry "as JSON"; this serves that ticket's intent
better than `JSON.stringify` would, since a strict JSON body would have to be edited by hand after every
copy, which is the step the creator exists to remove. What the text does guarantee is that a pasted entry
reads as the ones around it do, and that committing one is a diff of one entry.

## Considered options

- **Hand-authored manifest using outside tools.** Rejected: it requires measuring the space's orientation
  by hand, which is exactly the step the Site Frame exists to avoid, and it turns adding a Site into an
  exercise in arithmetic rather than in looking at the place.
- **A separate authoring tool, or a second bundle.** Rejected: it needs the same imagery, the same
  coordinate maths and the same codec, so a second bundle buys nothing but a second thing to deploy.
- **Persisting a creator-drawn Site to the browser rather than the manifest.** Rejected: it would be
  per-browser, invisible to every visitor, and impossible to share, because there is no backend.
- **A button, a link, or a keyboard chord on the visitor's page.** Rejected: anything on that page is in
  the visitor's bundle, discoverable and reachable by accident, and it would download the creator's code —
  geocoder and all — for every visitor. A fragment the visitor's page never names keeps the mode off the
  visitor's path entirely.
- **Strict JSON output (`JSON.stringify`).** Rejected: the manifest is a TypeScript module whose entries
  use unquoted keys and single quotes, and the point of the emit is to be pasted into it and committed, so
  strict JSON would need editing by hand after every copy. JSON is a shape; the manifest's spelling is
  what the creator actually needs.
- **A zero-dependency creator flow, panning to each site by hand.** Rejected as the default: a keyless
  geocoder is worth one third-party service with a usage policy, for a tool used occasionally by one
  person, where the policy (about one request per second, identifying the app) is trivially met.

## Consequences

- The app's dependencies on other people's services are USGS's imagery and its coarse basemap, both
  keyless, public domain and already named by ADR 0001, and the creator's geocoder, which is the only one
  of the three that is not USGS's. The geocoder is reachable only from the creator mode, and the e2e layer
  intercepts it.
- The creator mode also uses USGS's cached XYZ basemap for navigation, whose cache stops at z16 (about
  1.9 m/px): ample for finding a space, useless for drawing its edges. Hence the two-tier flow.
- **The imagery extent is not the Site Frame.** It is the frame expanded by a context margin, so the place
  is seen in its surroundings. Cropping the image to the rectangle was rejected outright: the approach,
  the entrance and the adjacent space are what tell you whether a layout is workable.
- The frame is a guide, never a constraint, so the fetched extent bounds panning only, never placement.
- Adding a Site costs one address search, one 15–22 s fetch, a rectangle, and a commit.
