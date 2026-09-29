<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    side?: 'left' | 'right';
    onclose: () => void;
    children: Snippet;
  }

  let { title, side = 'left', onclose, children }: Props = $props();
</script>

<section class="panel {side}" aria-label={title}>
  <header>
    <h2>{title}</h2>
    <button type="button" aria-label="Закрыть" title="Закрыть" onclick={onclose}>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d="m5 5 10 10M15 5 5 15" />
      </svg>
    </button>
  </header>
  <div class="body">
    {@render children()}
  </div>
</section>

<style>
  .panel {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    width: min(var(--panel-width), 100%);
    background: var(--surface);
    box-shadow: var(--lift);
  }

  .left {
    left: 0;
    border-right: 1px solid var(--edge);
  }

  .right {
    right: 0;
    border-left: 1px solid var(--edge);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: none;
    height: 44px;
    padding-left: 14px;
    border-bottom: 1px solid var(--edge);
  }

  h2 {
    margin: 0;
    font-size: var(--text);
    font-weight: 600;
  }

  header button {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    color: var(--ink-soft);
  }

  header button:hover {
    color: var(--ink);
    background: var(--surface-raised);
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 14px 16px;
  }

  @media (max-width: 640px) {
    .right {
      top: auto;
      left: 0;
      width: 100%;
      max-height: 55%;
      border-left: 0;
      border-top: 1px solid var(--edge);
    }
  }
</style>
