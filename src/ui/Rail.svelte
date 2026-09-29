<script lang="ts" module>
  import type { PanelKey } from '../core/hotkeys';

  export type PanelId = PanelKey;
</script>

<script lang="ts">
  import { panelKey } from '../core/hotkeys';
  import { redo, undo, undoState } from '../model/scenario.svelte';

  interface Props {
    active: PanelId | null;
    /** Открыть список клавиш. */
    onhelp: () => void;
  }

  let { active = $bindable(), onhelp }: Props = $props();

  const PANELS: { id: PanelId; label: string }[] = [
    { id: 'layers', label: 'Слои' },
    { id: 'palette', label: 'Фишки' },
    { id: 'graphics', label: 'Графика' },
    { id: 'routes', label: 'Маршруты' },
    { id: 'roster', label: 'Состав' },
    { id: 'ruler', label: 'Линейка' },
    { id: 'sight', label: 'Видимость' },
    { id: 'coords', label: 'Координаты' },
    { id: 'scenario', label: 'Сценарий' },
  ];
</script>

<nav class="rail" aria-label="Инструменты">
  {#each PANELS as panel (panel.id)}
    <button
      type="button"
      class="tab"
      aria-pressed={active === panel.id}
      title="{panel.label} ({panelKey(panel.id)})"
      onclick={() => (active = active === panel.id ? null : panel.id)}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        {#if panel.id === 'layers'}
          <path d="M12 4 3 8.5l9 4.5 9-4.5L12 4Z" />
          <path d="m3 12.5 9 4.5 9-4.5" />
          <path d="m3 16.5 9 4.5 9-4.5" />
        {:else if panel.id === 'palette'}
          <rect x="3" y="6" width="18" height="12" />
          <path d="m3 6 18 12M21 6 3 18" />
        {:else if panel.id === 'graphics'}
          <path d="M3 20 8 6a18 18 0 0 1 13 8L3 20Z" />
          <path d="M13 4h7v7" />
        {:else if panel.id === 'routes'}
          <path d="M6 18.5c8 0 3.5-7 9-7s3-6 3-6" />
          <circle cx="4.5" cy="18.5" r="1.5" />
          <path d="m15 5.5 3-1.5 1.5 3" />
        {:else if panel.id === 'roster'}
          <path d="M9 6h12M9 12h12M9 18h12" />
          <path d="M3.5 6h1M3.5 12h1M3.5 18h1" />
        {:else if panel.id === 'ruler'}
          <path d="m3 16.5 13.5-13.5 4.5 4.5L7.5 21 3 16.5Z" />
          <path d="m7 12.5 2 2M10 9.5l2 2M13 6.5l2 2" />
        {:else if panel.id === 'sight'}
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        {:else if panel.id === 'coords'}
          <circle cx="12" cy="12" r="5.5" />
          <path d="M12 2.5v6M12 15.5v6M2.5 12h6M15.5 12h6" />
        {:else}
          <path d="M6 3h8l4 4v14H6V3Z" />
          <path d="M14 3v4h4M9 13h6M9 17h6" />
        {/if}
      </svg>
      <span>{panel.label}</span>
    </button>
  {/each}

  <div class="history">
    <button type="button" class="step" aria-label="Клавиши" title="Клавиши (?)" onclick={onhelp}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M9.5 14h5M18 14h.01" />
      </svg>
    </button>
    <button
      type="button"
      class="step"
      aria-label="Отменить"
      title="Отменить (Ctrl+Z)"
      disabled={!undoState.canUndo}
      onclick={undo}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M9 7 4 12l5 5" />
        <path d="M4 12h10a5 5 0 0 1 0 10h-2" />
      </svg>
    </button>
    <button
      type="button"
      class="step"
      aria-label="Повторить"
      title="Повторить (Ctrl+Shift+Z)"
      disabled={!undoState.canRedo}
      onclick={redo}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="m15 7 5 5-5 5" />
        <path d="M20 12H10a5 5 0 0 0 0 10h2" />
      </svg>
    </button>
  </div>
</nav>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    width: 84px;
    background: var(--surface-deep);
    border-right: 1px solid var(--edge);
    overflow-y: auto;
  }

  button {
    display: grid;
    justify-items: center;
    color: var(--ink-soft);
  }

  button:hover:not(:disabled) {
    color: var(--ink);
    background: var(--surface);
  }

  button:disabled {
    color: var(--ink-faint);
    cursor: default;
  }

  .tab {
    gap: 3px;
    padding: 10px 2px 8px;
    font-size: var(--text-small);
    border-left: 3px solid transparent;
    border-right: 3px solid transparent;
  }

  .tab[aria-pressed='true'] {
    color: var(--ink);
    background: var(--surface);
    border-left-color: var(--accent);
  }

  .history {
    display: grid;
    margin-top: auto;
    padding: 6px 0;
    border-top: 1px solid var(--edge);
  }

  .step {
    height: 40px;
    align-content: center;
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
