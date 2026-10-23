<script lang="ts">
  /**
   * Where a received collection came from, said plainly.
   *
   * A name, and nothing else: there are no accounts, so nothing else is known or
   * claimed about the sender. The palette and the collections sheet both show it,
   * so it is written once; the spacing around it belongs to the place it is shown
   * in, so that stays with the place.
   */

  interface Props {
    source: string
  }

  let { source }: Props = $props()
</script>

<p class="source">Received from {source}</p>

<style>
  .source {
    font-size: 0.75rem;
    margin: 0;
    opacity: 0.75;
  }
</style>
