<script lang="ts">
  import { cssColour } from '../core/colour'
  import { toFeetAndInches } from '../core/units'
  import type { Vehicle } from '../core/vehicle'

  /**
   * A vehicle read at a glance: its colour, its name, and its published size.
   *
   * Four rows draw it - the palette's chips, the missing-vehicles report, the
   * collections sheet, and the offer of a shared collection - so it is drawn
   * once. How it sits in a row is part of it: the name takes the slack and the
   * size sits at the end, which is the same in every row that uses it. The
   * swatch is the app's shared one, so it stays a `.swatch` class here.
   */

  interface Props {
    of: Vehicle
  }

  let { of }: Props = $props()
</script>

<span class="swatch" style={`background: ${cssColour(of.colour)}`}></span>
<span class="name">{of.name}</span>
<span class="size">{toFeetAndInches(of.lengthInches)} x {toFeetAndInches(of.widthInches)}</span>

<style>
  .name {
    flex: 1;
  }

  .size {
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }
</style>
