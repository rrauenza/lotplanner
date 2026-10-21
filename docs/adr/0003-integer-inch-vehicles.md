---
status: accepted
---

# Vehicle sizes are stored as integer inches

Dimensions are typed as two integer boxes — feet and inches — and stored as one integer
number of inches. That makes both boundaries exact: `5` ft `3` in becomes 63, and 63 renders
back as `5'3"` with no rounding anywhere. The metre-based projection maths needs a conversion
either way, and inches × 0.0254 is the same single multiply as millimetres ÷ 1000.

## Considered options

- **Integer millimetres.** Unit-neutral, and the finest grain, so a metric entry would be exact
  rather than rounded to the nearest inch (2.50 m would survive as 2.500 m instead of becoming
  2.489 m). Rejected because the input UI is feet-and-inches by construction, so there is no
  metric entry path to protect — and millimetres would add a rounding step at both boundaries
  that inches does not need.
- **Integer centimetres.** Unit-neutral like millimetres and adequate in practice, but a
  coarser grain for no benefit.
- **Decimal feet in a single box.** Rejected: parsing decimals reintroduces rounding at input,
  and display in decimal feet is lossy — 3 in shows as 0.3 ft, which reads back as 4 in. Two
  integer boxes avoid both problems and suit a phone's numeric keypad.

## Consequences

- Every stored dimension is exactly as typed, which is what makes a Collection's content hash
  trustworthy for duplicate detection.
- Positions are unaffected: floats in the model, quantised separately when a Layout is serialised.
- **Reopen trigger:** if metric input is ever required, this is the decision to revisit. It is a
  genuine lock-in — saved Collections would need migrating.
