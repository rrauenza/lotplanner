<script lang="ts">
  import { SYSTEM_COLLECTION_NAME } from '../core/collection'
  import { cssColour } from '../core/colour'
  import { toFeetAndInches } from '../core/units'
  import { vehicle, type Vehicle } from '../core/vehicle'
  import {
    MAXIMUM_COLLECTION_NAME_LENGTH,
    nameFor,
    type VehicleCollection,
  } from '../core/vehicle-collection'
  import VehicleEditor from './VehicleEditor.svelte'

  /**
   * The visitor's own collections: made, named, filled and deleted here.
   *
   * The System Collection is not in any of this. It cannot be renamed, cannot
   * be deleted and its vehicles cannot be corrected, so it is not a row in this
   * sheet at all - there is nothing here to do to it.
   */

  interface Props {
    /** The visitor's own collections, in the order they were made. */
    collections: readonly VehicleCollection[]
    /** Which one the palette is showing, so the sheet opens on the same one. */
    chosen: string
    onchoose: (id: string) => void
    oncreate: () => void
    onrename: (id: string, name: string) => void
    ondelete: (id: string) => void
    onaddvehicle: (id: string, vehicle: Vehicle) => void
    oneditvehicle: (id: string, before: Vehicle, after: Vehicle) => void
    onremovevehicle: (id: string, vehicle: Vehicle) => void
    onclose: () => void
  }

  let {
    collections,
    chosen,
    onchoose,
    oncreate,
    onrename,
    ondelete,
    onaddvehicle,
    oneditvehicle,
    onremovevehicle,
    onclose,
  }: Props = $props()

  /** The collection whose details are open, if the palette is showing one of ours. */
  const shown = $derived(collections.find((each) => each.id === chosen))

  /** The row that has been asked to confirm, because deleting is not undoable. */
  let confirming = $state<string | undefined>(undefined)

  /**
   * The name box's own text while it is being typed in, and what the core said
   * about it.
   *
   * A draft rather than the stored name, because a stored name is tidied as it
   * arrives: binding the box straight to it would take the space out from
   * between two words as they were typed. Seeded whenever the sheet is pointed
   * at a different collection, which is the only time a name arrives here from
   * anywhere but the box.
   */
  let draftName = $state('')
  let complaint = $state('')
  let seededFor = $state<string | undefined>(undefined)

  $effect(() => {
    const current = shown

    if (current === undefined || seededFor === current.id) {
      return
    }

    draftName = current.name
    complaint = ''
    seededFor = current.id
  })

  /**
   * The vehicle form that is up, if any.
   *
   * `adding` says whether the first change to the form puts a vehicle into the
   * collection or corrects one that is already there. Past the first change the
   * vehicle exists, so the same form goes on correcting it rather than adding
   * another copy every keystroke.
   */
  let form = $state<
    { readonly inCollection: string; readonly of: Vehicle; readonly adding: boolean } | undefined
  >(undefined)

  /**
   * Changes on every opening of the form, so that picking a different vehicle
   * starts the form afresh rather than leaving the last one's text in the boxes.
   */
  let formId = $state(0)

  /** What a new vehicle starts from: something to change, not a guess at a fleet. */
  const A_NEW_VEHICLE = vehicle({
    name: 'New vehicle',
    widthInches: 72,
    lengthInches: 180,
    colour: '#6b7280',
  })

  function size(of: Vehicle): string {
    return `${toFeetAndInches(of.lengthInches)} x ${toFeetAndInches(of.widthInches)}`
  }

  function renameTo(raw: string): void {
    draftName = raw

    const named = nameFor(raw)

    if (!named.usable) {
      // The name is the app's own, or is not a name. The old one stands and the
      // reason is said plainly rather than the name silently changing.
      complaint = named.reason
      return
    }

    complaint = ''

    if (shown !== undefined) {
      onrename(shown.id, named.name)
    }
  }

  function addVehicle(id: string): void {
    formId += 1
    form = { inCollection: id, of: A_NEW_VEHICLE, adding: true }
  }

  function editVehicle(id: string, which: Vehicle): void {
    formId += 1
    form = { inCollection: id, of: which, adding: false }
  }

  function corrected(requested: Vehicle): void {
    const open = form

    if (open === undefined) {
      return
    }

    // A new vehicle starts from a placeholder with a label of its own, so
    // without this a fleet of new vehicles would all be labelled "New vehicle".
    // The name follows through the same rule the core applies to a vehicle made
    // with no label at all, and only until the visitor gives one themselves.
    const next = open.adding ? labelled(requested) : requested

    if (open.adding) {
      onaddvehicle(open.inCollection, next)
    } else {
      oneditvehicle(open.inCollection, open.of, next)
    }

    form = { inCollection: open.inCollection, of: next, adding: false }
  }

  function labelled(corrected: Vehicle): Vehicle {
    return corrected.shortLabel === A_NEW_VEHICLE.shortLabel
      ? vehicle({ ...corrected, shortLabel: '' })
      : corrected
  }

  function show(id: string): void {
    form = undefined
    onchoose(id)
  }
</script>

<section class="sheet" aria-label="Your collections">
  <div class="bar">
    <h2>Your collections</h2>
    <button type="button" onclick={onclose}>Done</button>
  </div>

  <ul class="own">
    {#each collections as one (one.id)}
      <li>
        <button
          type="button"
          aria-current={one.id === chosen}
          onclick={() => {
            show(one.id)
          }}
        >
          {one.name}
        </button>
        {#if confirming === one.id}
          <button
            type="button"
            onclick={() => {
              confirming = undefined
              ondelete(one.id)
            }}>Delete it</button
          >
          <button
            type="button"
            onclick={() => {
              confirming = undefined
            }}>Keep it</button
          >
        {:else}
          <button
            type="button"
            onclick={() => {
              confirming = one.id
            }}>Delete</button
          >
        {/if}
      </li>
    {:else}
      <li>
        You have no collections of your own yet. The {SYSTEM_COLLECTION_NAME} are always here.
      </li>
    {/each}
  </ul>

  <div class="bar">
    <button type="button" onclick={oncreate}>New collection</button>
  </div>

  {#if shown !== undefined}
    <label>
      Name
      <input
        value={draftName}
        maxlength={MAXIMUM_COLLECTION_NAME_LENGTH}
        oninput={(event) => {
          renameTo(event.currentTarget.value)
        }}
      />
    </label>

    {#if shown.source !== undefined}
      <!-- Where it came from, as the sender called it. A name, and nothing
           else: there are no accounts, so nothing else is known or claimed. -->
      <p class="source">Received from {shown.source}</p>
    {/if}

    {#if complaint !== ''}
      <p role="alert">{complaint}</p>
    {/if}

    <h3>Vehicles</h3>
    <ul class="vehicles">
      {#each shown.vehicles as one, index (index)}
        <li>
          <span class="swatch" style={`background: ${cssColour(one.colour)}`}></span>
          <span>{one.name}</span>
          <span class="size">{size(one)}</span>
          <button
            type="button"
            onclick={() => {
              editVehicle(shown.id, one)
            }}>Edit</button
          >
          <button
            type="button"
            onclick={() => {
              onremovevehicle(shown.id, one)
            }}>Remove</button
          >
        </li>
      {:else}
        <li>Nothing in this collection yet.</li>
      {/each}
    </ul>

    <!-- The same form a placed vehicle is corrected in, so a vehicle is entered
         one way wherever it is entered. -->
    {#if form !== undefined}
      {#key formId}
        <VehicleEditor of={form.of} onchange={corrected} />
        <button
          type="button"
          onclick={() => {
            form = undefined
          }}>Done with this vehicle</button
        >
      {/key}
    {:else}
      <div class="bar">
        <button
          type="button"
          onclick={() => {
            addVehicle(shown.id)
          }}>Add a vehicle</button
        >
      </div>
    {/if}
  {/if}
</section>

<style>
  .own {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
  }

  .own li {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.875rem;
    gap: 0.5rem;
  }

  .own li + li {
    margin-top: 0.25rem;
  }

  .own li > button:first-child {
    flex: 1;
    text-align: left;
  }

  .own [aria-current='true'] {
    font-weight: 600;
    outline: 2px solid currentcolor;
  }

  .own button,
  .vehicles button,
  .bar ~ .vehicles button {
    padding: 0.25rem 0.5rem;
  }

  label {
    display: flex;
    flex-direction: column;
    font-size: 0.75rem;
    gap: 0.125rem;
  }

  input {
    font: inherit;
    padding: 0.125rem 0.25rem;
    width: 12rem;
  }

  .source {
    font-size: 0.75rem;
    margin: 0.25rem 0 0;
    opacity: 0.75;
  }

  [role='alert'] {
    font-size: 0.75rem;
    font-weight: 600;
    margin: 0.25rem 0 0;
  }

  h3 {
    font-size: 0.75rem;
    font-weight: 600;
    margin: 0.75rem 0 0.25rem;
  }

  .vehicles {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
  }

  .vehicles li {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.75rem;
    gap: 0.5rem;
  }

  .vehicles li + li {
    margin-top: 0.25rem;
  }

  .vehicles .size {
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }

  .vehicles li > span:nth-child(2) {
    flex: 1;
  }
</style>
