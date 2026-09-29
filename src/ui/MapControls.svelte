<script lang="ts">
  import type { Map as MlMap } from 'maplibre-gl';
  import { view } from '../model/view.svelte';

  interface Props {
    map: MlMap | null;
    /** Сохранить вид карты картинкой. */
    onsnapshot: () => void;
  }

  let { map, onsnapshot }: Props = $props();

  const turned = $derived(Math.abs(view.bearing) > 0.5);
</script>

<div class="controls">
  <div class="group" role="group" aria-label="Режим рельефа">
    <button
      type="button"
      class="mode"
      aria-pressed={!view.terrain3d}
      title="Плоская карта (T)"
      onclick={() => (view.terrain3d = false)}
    >
      2D
    </button>
    <button
      type="button"
      class="mode"
      aria-pressed={view.terrain3d}
      title="Карта с рельефом (T)"
      onclick={() => (view.terrain3d = true)}
    >
      3D
    </button>
  </div>

  <div class="group">
    <button
      type="button"
      aria-label="Приблизить"
      title="Приблизить (+)"
      disabled={!map}
      onclick={() => map?.zoomIn()}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d="M10 4v12M4 10h12" />
      </svg>
    </button>
    <button
      type="button"
      aria-label="Отдалить"
      title="Отдалить (−)"
      disabled={!map}
      onclick={() => map?.zoomOut()}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d="M4 10h12" />
      </svg>
    </button>
  </div>

  <div class="group">
    <button
      type="button"
      class="compass"
      class:turned
      aria-label="Повернуть карту на север"
      title="Повернуть карту на север (N)"
      disabled={!map}
      onclick={() => map?.easeTo({ bearing: 0, duration: 400 })}
    >
      <svg
        viewBox="0 0 20 20"
        width="20"
        height="20"
        aria-hidden="true"
        style:transform="rotate({-view.bearing}deg)"
      >
        <path class="north" d="M10 2 6.5 10h7L10 2Z" />
        <path class="south" d="M10 18 6.5 10h7L10 18Z" />
      </svg>
    </button>
  </div>

  <div class="group">
    <button
      type="button"
      aria-label="Сохранить вид карты в PNG"
      title="Сохранить вид карты в PNG (P)"
      disabled={!map}
      onclick={onsnapshot}
    >
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
        <path d="M3 6.5h3l1.5-2h5l1.5 2h3v9H3v-9Z" />
        <circle cx="10" cy="10.75" r="2.75" />
      </svg>
    </button>
  </div>
</div>

<style>
  .controls {
    position: absolute;
    top: 12px;
    right: calc(12px + var(--controls-inset));
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }

  .group {
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--edge);
    border-radius: var(--radius);
    box-shadow: var(--lift);
    overflow: hidden;
  }

  .group[role='group'] {
    flex-direction: row;
  }

  button {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
  }

  button:hover:not(:disabled) {
    background: var(--surface-raised);
  }

  button:disabled {
    color: var(--ink-faint);
    cursor: default;
  }

  .group:not([role='group']) button + button {
    border-top: 1px solid var(--edge);
  }

  .mode {
    width: 44px;
    font-weight: 600;
    font-variant-numeric: lining-nums;
  }

  .mode[aria-pressed='true'],
  .mode[aria-pressed='true']:hover {
    background: var(--accent);
    color: var(--accent-ink);
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .compass svg {
    stroke: none;
  }

  .north {
    fill: var(--ink-soft);
  }

  .south {
    fill: var(--ink-faint);
  }

  .compass.turned .north {
    fill: var(--accent);
  }
</style>
