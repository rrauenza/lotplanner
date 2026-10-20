---
status: accepted
---

# Layouts embed their Vehicles; Vehicle Collections travel separately

A Layout must render for a stranger who received a link and has none of the sender's local
state, so it embeds its own copies of the Vehicles it uses rather than referencing a Vehicle
Collection. Collections are local to a browser and are shared as their own artifact. Importing
either always creates a new Collection and never merges into or overwrites an existing one, and
promoting a Layout's Vehicles into a Collection is an explicit action.

## Considered options

- **Reference Collections by content hash** (git/Nix-style content addressing). Elegant:
  identical contents share an identity, and editing a Collection changes its hash, so a Layout
  could never silently change meaning. Rejected because the recipient cannot resolve a hash and
  would see a blank screen, so the payload would have to travel anyway — leaving only
  deduplication. Editing would then either orphan Layouts or accumulate every historical
  version, which needs refs and garbage collection. And "same content → same id" requires a
  total canonical form. The idea survives in a weakened, safe form: a content hash may be used
  as a **duplicate hint** on Collection import, where nothing depends on it being right.
- **One link carrying both a Layout and a Collection.** Rejected: it reintroduces exactly the
  ambiguity this decision removes, because a Collection that arrived with a Layout is neither a
  local Collection nor an embedded snapshot.

## Consequences

- Opening a shared Layout never mutates the recipient's Collections. It renders, reports which
  Vehicles are not in their Collections, and offers one action to save them as a new Collection.
- A Layout's Vehicle copies are frozen: editing one edits that Layout only, and the promoted
  Collection is an independent living copy. Two things can therefore share a name and differ in
  geometry — which is why promotion is an explicit, named action rather than an automatic import.
- Because Vehicle definitions travel with every Layout, the **vehicle name is part of the shared
  payload**, so a short label directly reduces link size.
- A Layout also embeds its Site's georeference — identifier, bounding box and centre — rather than
  only an identifier, on the same principle: a shared Layout must not fail to resolve, even for a
  reader whose copy of the app predates that Site being added.
- A consequence worth knowing: because the copies are frozen, **correcting the System Collection
  never reaches existing Layouts.** New placements get the correction; saved ones keep the stale
  value. That is the intended meaning of "frozen", but it is invisible to the user, so an explicit
  "update this Layout from the System Collection" action remains a possible later addition — it is
  only possible because the vehicle name travels with the copy.