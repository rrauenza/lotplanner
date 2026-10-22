<script lang="ts">
  import { untrack } from 'svelte'

  import { cssColour } from '../core/colour'
  import { toFeetAndInches, toInches } from '../core/units'
  import { sameVehicle, vehicle, type Vehicle } from '../core/vehicle'

  interface Props {
    /** The vehicle to correct: the selected Placement's own copy of it. */
    of: Vehicle
    /** A corrected vehicle, whole, whenever the form holds one. */
    onchange: (next: Vehicle) => void
  }

  let { of, onchange }: Props = $props()

  // The boxes hold text while they are being typed in. A half-typed dimension is
  // not a dimension yet, and rounding one into the other mid-keystroke would be
  // fighting whoever is typing.
  // Read once, deliberately: the form starts from this vehicle and then belongs
  // to whoever is typing in it. A new selection remounts the component, and a
  // change to this vehicle from outside is taken up by the effect below, so no
  // draft outlives the vehicle it was made for either way.
  let name = $state(untrack(() => of.name))
  let shortLabel = $state(untrack(() => of.shortLabel))
  let widthFeet = $state(untrack(() => feetOf(of.widthInches)))
  let widthInches = $state(untrack(() => remainderOf(of.widthInches)))
  let lengthFeet = $state(untrack(() => feetOf(of.lengthInches)))
  let lengthInches = $state(untrack(() => remainderOf(of.lengthInches)))
  let colour = $state(untrack(() => cssColour(of.colour)))
  let complaint = $state('')

  /**
   * The vehicle the boxes were last known to describe - what this form last
   * handed over, or what it last took from outside. Not reactive: it is a
   * bookmark for comparing against, never something rendered.
   */
  let describing = untrack(() => of)

  function feetOf(totalInches: number): string {
    return String(Math.floor(totalInches / 12))
  }

  /** What is left over, which is what the second box holds. */
  function remainderOf(totalInches: number): string {
    return String(totalInches % 12)
  }

  /*
   * The form is a live projection of the vehicle rather than a copy of it: every
   * change to any box is turned into a whole vehicle and handed over, so a
   * corrected size reaches every copy of it on the ground as it is typed.
   *
   * The stored vehicle is read untracked, so that a change arriving from outside
   * cannot make this apply an edit of its own, and the echo of what was just
   * applied is recognised by comparison rather than applied twice.
   */
  $effect(() => {
    const width = toInches(widthFeet, widthInches)
    const length = toInches(lengthFeet, lengthInches)

    if (width === undefined || length === undefined) {
      complaint = 'A width and a length are whole inches, and more than nothing.'
      return
    }

    try {
      const corrected = vehicle({
        name,
        shortLabel,
        widthInches: width,
        lengthInches: length,
        colour,
      })

      describing = corrected

      if (
        !sameVehicle(
          corrected,
          untrack(() => of),
        )
      ) {
        onchange(corrected)
      }
      complaint = ''
    } catch (error) {
      complaint = error instanceof Error ? error.message : 'That is not a vehicle.'
    }
  })

  /*
   * The vehicle can also change without anyone typing here: undo puts back the
   * size that was there before, and another copy of the same vehicle being
   * corrected carries this one with it. Either way the boxes have to show what
   * is now stored, or the form would go on displaying a size that is nowhere on
   * the ground - and the next keystroke would put it back.
   *
   * The echo of this form's own edit is the vehicle the boxes describe, so it is
   * recognised and changes nothing. Only the stored vehicle is tracked, so this
   * does not run on every keystroke.
   */
  $effect(() => {
    const stored = of

    if (sameVehicle(stored, describing)) {
      return
    }

    take(stored)
  })

  /** Put a vehicle into the boxes, as the one they describe from now on. */
  function take(next: Vehicle): void {
    name = next.name
    shortLabel = next.shortLabel
    widthFeet = feetOf(next.widthInches)
    widthInches = remainderOf(next.widthInches)
    lengthFeet = feetOf(next.lengthInches)
    lengthInches = remainderOf(next.lengthInches)
    colour = cssColour(next.colour)
    describing = next
  }
</script>

<section aria-label="The selected vehicle">
  <h2>This vehicle</h2>

  <div class="fields">
    <label>
      Name
      <input bind:value={name} maxlength="64" />
    </label>

    <label>
      Short label
      <input bind:value={shortLabel} maxlength="12" />
    </label>

    <fieldset>
      <legend>Width</legend>
      <input bind:value={widthFeet} inputmode="numeric" aria-label="Width, feet" />
      <span>ft</span>
      <input bind:value={widthInches} inputmode="numeric" aria-label="Width, inches" />
      <span>in</span>
    </fieldset>

    <fieldset>
      <legend>Length</legend>
      <input bind:value={lengthFeet} inputmode="numeric" aria-label="Length, feet" />
      <span>ft</span>
      <input bind:value={lengthInches} inputmode="numeric" aria-label="Length, inches" />
      <span>in</span>
    </fieldset>

    <label>
      Colour
      <input type="color" bind:value={colour} />
    </label>
  </div>

  <!-- The size as stored, read back the way the specifications publish it, so a
       size typed as published can be seen to have landed. -->
  <p class="size">{toFeetAndInches(of.lengthInches)} by {toFeetAndInches(of.widthInches)}</p>

  {#if complaint !== ''}
    <p role="alert">{complaint}</p>
  {/if}
</section>

<style>
  section {
    border-top: 1px solid color-mix(in srgb, currentcolor 25%, transparent);
    padding-top: 0.5rem;
  }

  h2 {
    font-size: 0.875rem;
    font-weight: 600;
    margin: 0 0 0.375rem;
  }

  .fields {
    align-items: flex-end;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
  }

  label,
  fieldset {
    border: 0;
    display: flex;
    flex-direction: column;
    font-size: 0.75rem;
    gap: 0.125rem;
    margin: 0;
    padding: 0;
  }

  fieldset {
    flex-direction: row;
    align-items: flex-end;
    gap: 0.25rem;
  }

  legend {
    font-size: 0.75rem;
    padding: 0;
  }

  input {
    font: inherit;
    padding: 0.125rem 0.25rem;
    width: 8rem;
  }

  fieldset input {
    width: 3.5rem;
  }

  span {
    font-size: 0.75rem;
    padding-bottom: 0.25rem;
  }

  .size,
  [role='alert'] {
    font-size: 0.75rem;
    margin: 0.375rem 0 0;
  }

  [role='alert'] {
    font-weight: 600;
  }
</style>
