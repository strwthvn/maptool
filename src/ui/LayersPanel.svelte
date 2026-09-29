<script lang="ts">
  import { BASE_LABELS } from '../map/sources';
  import { view, type BaseLayerId } from '../model/view.svelte';

  const BASES = Object.keys(BASE_LABELS) as BaseLayerId[];

  const satelliteIsBase = $derived(view.base === 'satellite');

  function percent(value: number): string {
    return `${Math.round(value * 100)} %`;
  }
</script>

<fieldset>
  <legend>Подложка</legend>
  {#each BASES as id (id)}
    <label class="row">
      <input type="radio" name="base" value={id} bind:group={view.base} />
      <span>{BASE_LABELS[id]}</span>
    </label>
  {/each}
</fieldset>

<fieldset>
  <legend>Поверх подложки</legend>

  <div class="overlay">
    <label class="row" class:disabled={satelliteIsBase}>
      <input type="checkbox" bind:checked={view.satellite.on} disabled={satelliteIsBase} />
      <span>Спутник</span>
    </label>
    <label class="amount">
      <span class="visually-hidden">Непрозрачность спутника</span>
      <input
        type="range"
        min="0.1"
        max="1"
        step="0.05"
        bind:value={view.satellite.opacity}
        disabled={satelliteIsBase || !view.satellite.on}
      />
      <output>{percent(view.satellite.opacity)}</output>
    </label>
  </div>

  <div class="overlay">
    <label class="row">
      <input type="checkbox" bind:checked={view.hillshade.on} />
      <span>Отмывка рельефа</span>
    </label>
    <label class="amount">
      <span class="visually-hidden">Сила отмывки</span>
      <input
        type="range"
        min="0.1"
        max="1"
        step="0.05"
        bind:value={view.hillshade.strength}
        disabled={!view.hillshade.on}
      />
      <output>{percent(view.hillshade.strength)}</output>
    </label>
  </div>

  <label class="row">
    <input type="checkbox" bind:checked={view.contours.on} />
    <span>Горизонтали</span>
  </label>

  <label class="row">
    <input type="checkbox" bind:checked={view.grid.on} />
    <span>Сетка MGRS</span>
  </label>
</fieldset>

<fieldset>
  <legend>Вокруг всех фишек</legend>
  <label class="row">
    <input type="checkbox" bind:checked={view.rings.weapons} />
    <span>Дальности оружия</span>
  </label>
  <label class="row">
    <input type="checkbox" bind:checked={view.rings.reach} />
    <span>Досягаемость за ход</span>
  </label>
  <p class="note">У отдельной фишки кольца включаются в её редакторе.</p>
</fieldset>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 32px;
    cursor: pointer;
  }

  .row.disabled {
    color: var(--ink-faint);
    cursor: default;
  }

  .overlay {
    margin-bottom: 4px;
  }

  .note {
    margin: 4px 0 0;
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  .amount {
    display: grid;
    grid-template-columns: 1fr 44px;
    align-items: center;
    gap: 8px;
    padding-left: 28px;
  }

  .amount output {
    font-size: var(--text-small);
    color: var(--ink-soft);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .amount:has(input:disabled) output {
    color: var(--ink-faint);
  }
</style>
