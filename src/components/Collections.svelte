<script lang="ts">
  import { SYSTEM_COLLECTION_NAME } from '../core/collection'
  import { sameVehicle, shortLabelFor, vehicle, type Vehicle } from '../core/vehicle'
  import { MAXIMUM_COLLECTION_NAME_LENGTH, nameFor } from '../core/vehicle-collection'
  import { collections } from '../state/collections.svelte'
  import { sharing } from '../state/sharing.svelte'
  import ReceivedFrom from './ReceivedFrom.svelte'
  import VehicleEditor from './VehicleEditor.svelte'
  import VehicleSummary from './VehicleSummary.svelte'

  /**
   * The visitor's own collections: made, named, filled and deleted here.
   *
   * The System Collection is not in any of this. It cannot be renamed, cannot
   * be deleted and its vehicles cannot be corrected, so it is not a row in this
   * sheet at all - there is nothing here to do to it.
   *
   * The Collections themselves are read from the module that holds them, not
   * handed in through the App: this sheet edits the same list the palette
   * presents, so making, renaming or deleting one here is seen there at once
   * without the App in between. Offering one as a file is the sharing module's,
   * for the same reason: it is not about a Site either.
   */

  /** The collection whose details are open, if the palette is showing one of ours. */
  const shown = $derived((collections.mine ?? []).find((each) => each.id === collections.chosen))

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

  /**
   * Said when a vehicle equal to one already in the collection is added.
   *
   * A collection holds each vehicle once, because it is a set of vehicle types
   * rather than a tally of rigs. That rule is the core's and is not changed; all
   * this does is say why nothing appeared, since a visitor adding what looks like
   * a second identical rig would otherwise be left guessing.
   */
  let vehicleComplaint = $state('')

  const ALREADY_IN_COLLECTION =
    'This collection already has that vehicle. A collection holds each vehicle once; to use two of it, place a second on the Layout.'

  /** What a new vehicle starts from: something to change, not a guess at a fleet. */
  const A_NEW_VEHICLE = vehicle({
    name: 'New vehicle',
    widthInches: 72,
    lengthInches: 180,
    colour: '#6b7280',
  })

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
      collections.rename(shown.id, named.name)
    }
  }

  function addVehicle(id: string): void {
    formId += 1
    vehicleComplaint = ''
    form = { inCollection: id, of: A_NEW_VEHICLE, adding: true }
  }

  function editVehicle(id: string, which: Vehicle): void {
    formId += 1
    vehicleComplaint = ''
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

    // The core refuses a second equal vehicle by leaving the collection as it
    // was. Say so here rather than letting the form quietly do nothing: the
    // visitor keeps the form open (still adding) so changing the name or colour
    // makes a distinct vehicle and it can be added.
    if (open.adding && shown?.vehicles.some((one) => sameVehicle(one, next))) {
      vehicleComplaint = ALREADY_IN_COLLECTION
      form = { inCollection: open.inCollection, of: next, adding: true }
      return
    }

    vehicleComplaint = ''

    if (open.adding) {
      collections.addVehicle(open.inCollection, next)
    } else {
      collections.editVehicle(open.inCollection, open.of, next)
    }

    form = { inCollection: open.inCollection, of: next, adding: false }
  }

  function labelled(corrected: Vehicle): Vehicle {
    return corrected.shortLabel === A_NEW_VEHICLE.shortLabel
      ? { ...corrected, shortLabel: shortLabelFor(corrected.name) }
      : corrected
  }

  function show(id: string): void {
    form = undefined
    collections.choose(id)
  }
</script>

<section class="sheet" aria-label="Your collections">
  <div class="bar">
    <h2>Your collections</h2>
    <button
      type="button"
      onclick={() => {
        collections.close()
      }}>Done</button
    >
  </div>

  <ul class="own">
    {#each collections.mine ?? [] as one (one.id)}
      <li>
        <button
          type="button"
          aria-current={one.id === collections.chosen}
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
              collections.remove(one.id)
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
    <button
      type="button"
      onclick={() => {
        collections.create()
      }}>New collection</button
    >
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
      <div class="source">
        <ReceivedFrom source={shown.source} />
      </div>
    {/if}

    <div class="bar">
      <!-- A file, because this collection may be too much for a link and is the
           way to keep it or send it outside one. -->
      <button
        type="button"
        onclick={() => {
          sharing.exportCollection(shown.id)
        }}>Export this collection</button
      >
    </div>

    {#if complaint !== ''}
      <p role="alert">{complaint}</p>
    {/if}

    <h3>Vehicles</h3>
    <ul class="vehicles">
      {#each shown.vehicles as one, index (index)}
        <li>
          <VehicleSummary of={one} />
          <button
            type="button"
            onclick={() => {
              editVehicle(shown.id, one)
            }}>Edit</button
          >
          <button
            type="button"
            onclick={() => {
              collections.removeVehicle(shown.id, one)
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
        {#if vehicleComplaint !== ''}
          <p role="alert">{vehicleComplaint}</p>
        {/if}
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
    margin: 0.25rem 0 0;
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
</style>
