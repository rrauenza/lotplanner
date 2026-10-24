---
status: accepted
---

# Keyless USGS imagery with Leaflet, one image per Site

Google Maps' JavaScript API would give sharper imagery (15–30 cm) but requires a Cloud
project, a billing account and a card, forbids caching or storing imagery, and forbids
pairing Google content with a non-Google map library — so it also dictates the library.
USGS NAIP imagery is public domain, needs no key, card or quota, sends CORS headers,
permits caching, and serves ~0.3 m, which is enough to place vehicles against curbs and
lot edges. We render with Leaflet 1.9.4.

We fetch **one image per Site** rather than tiling or refetching per viewport, because a
cold `exportImage` render takes 15–22 seconds while a repeated identical URL takes ~75 ms.
Any pan-triggered refetch is therefore unusable, and "one image, then pan and zoom inside
it" is the only workable shape.

## Considered options

- **Google Maps JavaScript API** — sharpest imagery and real address search, but a card, a
  billing account, and a quota we would fund for anonymous visitors; no bundling, no
  offline, no image export. Rejected on ownership, not on quality.
- **Cached USGS XYZ basemap** (`USGSImageryOnly`) — keyless, but its tile cache stops at
  zoom 16 ≈ 1.9 m/px at US latitudes; a stall is barely a pixel. Too coarse.
- **`USGSNAIPPlus`** (NAIP + high-resolution ortho, ~0.15 m) — measured returning 502/504,
  and 24–70 s when it answers. Unreliable.
- **Tiled `exportImage` via `L.GridLayer`** — dozens of dynamic renders per pan gesture
  against an un-metered public service with no SLA. Abusive and slow.
- **`esri-leaflet`'s `imageMapLayer`** — implements the viewport pattern with a race guard
  and crossfade, but refetches on every `moveend`, which at 15–22 s per cold render stalls
  every pan. Its guard and crossfade logic was copied; the dependency was not.
- **MapLibre GL JS** — viable, as USGS does send CORS, but its WebGL tiling model is a
  worse fit for one raster image plus DOM overlays. Unnecessary.

## Consequences

- Imagery is **US-only** and ~0.3 m: lot structure, curbs and individual vehicles are
  visible; painted stripes are sub-pixel.
- A Site's first load costs one 15–22 s render, cached thereafter (the service sends
  `cache-control: max-age=43200`). Panning and zooming within a Site cost nothing.
- Site definitions are a hand-authored manifest — name, coordinates and an optional Site Frame.
  **Imagery is never committed to the repository.** It is
  fetched lazily and cached client-side indefinitely in IndexedDB, so a Site works offline after
  its first load. This matters because the app is used standing in a parking lot, and because the
  service intermittently returns 504s.
- Arbitrary address browsing is impractical — every new area is another cold render. This
  is why Sites are a curated list rather than a search box.
- A Site image has a fixed pixel count, so zooming past ~1:1 magnifies pixels rather than
  revealing detail. `maxZoom` should be capped accordingly.
- USGS attribution is a courtesy rather than an obligation (public domain), but is shown.
- If 0.3 m later proves insufficient, this decision must be reopened **in full**: it is a
  package deal, and Google would bring the card, the quota and the library lock with it.
