---
status: accepted
---

# Every shared artifact is versioned before it travels

A Layout and a Vehicle Collection can leave the browser as a link or, later, as a file, and each is
spelled the same way either way. The payload is compact JSON — arrays rather than objects, so no field
name is paid for — with every ground position quantised to the centimetre and every angle to a tenth of
a degree. A link then compresses that text with `deflate-raw` and spells the bytes as unpadded
base64url after the fragment. A plausible 40-placement layout of four vehicle types measures **672
characters including the prefix**, inside the roughly 750 the spec allows; the number is asserted in
`src/core/link.test.ts`, using the browser's own `CompressionStream`, so it cannot drift unnoticed.

**Every artifact carries a kind and a version in its first two elements.** This is the decision that
cannot be retrofitted: unversioned data in the wild cannot be identified as anything, so a reader can
only guess at it. With a version, a reader migrates what it can, ignores fields it has never heard of,
and — when the version is _newer_ than itself — refuses politely rather than misreading. Migrations run
on read, keyed by the version they lift from; unknown fields are tolerated by reading only the
positions this version knows and letting the rest fall off. A refusal and an unreadable payload are
values, not exceptions, so a caller cannot forget to handle them.

## Considered options

- **Objects with field names.** Readable in a debugger, and the obvious default. Rejected because the
  names are pure overhead on a link: at 40 placements they are most of the payload, and deflate cannot
  recover what was never information.
- **Full floating-point positions.** Honest to the last micrometre. Rejected as false precision: this is
  a plan of where vehicles go, the picture is drawn at roughly 30 cm per pixel, and centimetres are
  already below what anyone can see — while rounding them away roughly halves the link.
- **gzip or zlib framing.** Rejected because both add header and checksum bytes that a link pays for on
  every share and gets nothing from.
- **A version per artifact kind.** One counter per shape, closer to how migrations are written.
  Rejected because two numbers can disagree about a payload that changed both shapes, and one envelope
  is one thing to remember to bump.
- **Refusing to read anything unexpected.** Safe in the narrow sense. Rejected: dropping somebody's
  layout because a later writer added a field is worse than the field being ignored, and the spec asks
  for tolerance.

## Consequences

- A link carries the whole artifact — Site identifier, name, georeference and bounding box, the Site
  Frame, and the Layout's own Vehicle copies — so it opens for a recipient with no account, no install
  and none of the sender's collections (ADR 0002).
- Placements carry no ids on the wire: an id is this session's handle on one, so the reader makes its
  own and saves the characters for the ground.
- Files (issue #14) reuse the same codec and the same version discipline; only the compression and the
  base64url are the link's own, and they live apart from the codec for exactly that reason.
- Because the shape is fixed here, a change to it means a new version and a migration, never a quiet
  edit to the current one.
