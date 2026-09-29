<script lang="ts">
  import { notice } from '../model/notice.svelte';
</script>

{#if notice.text}
  <p class="notice" class:failed={notice.tone === 'failed'} role="status">{notice.text}</p>
{/if}

<style>
  /* Стоит над подсказкой инструмента: вместе они друг друга не закрывают. */
  .notice {
    position: absolute;
    left: calc(var(--left-inset) + (100% - var(--left-inset) - var(--controls-inset)) / 2);
    bottom: calc(72px + var(--bottom-inset));
    transform: translateX(-50%);
    width: max-content;
    max-width: calc(100% - var(--left-inset) - var(--controls-inset) - 24px);
    margin: 0;
    padding: 8px 14px;
    background: var(--surface);
    border: 1px solid var(--edge);
    border-radius: var(--radius);
    box-shadow: var(--lift);
  }

  .failed {
    border-color: var(--unseen);
  }
</style>
