<script lang="ts">
  import { untrack } from 'svelte'

  import { MAXIMUM_LAYOUT_NAME_LENGTH, type SavedLayout } from '../core/saved'

  interface Props {
    /** The Site's saved Layouts, the one worked on most recently first. */
    saved: readonly SavedLayout[]
    /** Which of them is open. Nothing until an edit has named one. */
    openId: string | undefined
    /** What the open Layout is called, kept or not. */
    openName: string
    onopen: (id: string) => void
    onrename: (name: string) => void
    ondelete: (id: string) => void
    onnew: () => void
    onclose: () => void
  }

  let { saved, openId, openName, onopen, onrename, ondelete, onnew, onclose }: Props = $props()

  /** The row that has been asked to confirm, because deleting is not undoable. */
  let confirming = $state<string | undefined>(undefined)

  /**
   * The name box's own text while it is being typed in.
   *
   * A draft rather than the stored name, because a stored name is tidied as it
   * arrives: binding the box straight to it would take the space out from
   * between two words as they were typed. Seeded when the sheet opens, which is
   * the only time this Layout's name arrives from anywhere but the box.
   */
  let draftName = $state(untrack(() => openName))
</script>

<section class="sheet" aria-label="Layouts">
  <div class="bar">
    <h2>Layouts for this place</h2>
    <button type="button" onclick={onclose}>Done</button>
  </div>

  <ul class="saved">
    {#each saved as one (one.id)}
      <li>
        <button
          type="button"
          aria-current={one.id === openId}
          onclick={() => {
            onopen(one.id)
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
      <li>Nothing saved here yet. What you place is kept as you go.</li>
    {/each}
  </ul>

  {#if openId !== undefined}
    <label>
      Name
      <input
        value={draftName}
        maxlength={MAXIMUM_LAYOUT_NAME_LENGTH}
        oninput={(event) => {
          draftName = event.currentTarget.value
          onrename(draftName)
        }}
      />
    </label>
  {/if}

  <div class="bar">
    <button type="button" onclick={onnew}>New Layout</button>
  </div>
</section>

<style>
  .saved {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
  }

  .saved li {
    align-items: center;
    display: flex;
    font-size: 0.875rem;
    gap: 0.5rem;
  }

  .saved li + li {
    margin-top: 0.25rem;
  }

  .saved li > button:first-child {
    flex: 1;
    text-align: left;
  }

  .saved button {
    padding: 0.25rem 0.5rem;
  }

  .saved [aria-current='true'] {
    font-weight: 600;
    outline: 2px solid currentcolor;
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
</style>
