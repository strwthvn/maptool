<script lang="ts">
  import { formatAzimuth } from '../core/angles';
  import { formatArea, formatLength } from '../core/measure';
  import { armRuler } from '../model/arming';
  import {
    clearRuler,
    finishRuler,
    removeLastRulerPoint,
    ruler,
    rulerMeasurement,
    type RulerMode,
  } from '../model/ruler.svelte';
  import { ANGLE_UNITS, settings } from '../model/settings.svelte';

  /** Вызывается, когда линейка ждёт щелчков по карте. */
  let { onarm }: { onarm: () => void } = $props();

  const MODES: { id: RulerMode; label: string }[] = [
    { id: 'line', label: 'Расстояние' },
    { id: 'area', label: 'Площадь' },
  ];

  const result = $derived(rulerMeasurement());

  /** Отрезки с этого номера ещё не поставлены: они тянутся к курсору. */
  const pending = $derived(
    ruler.drawing && ruler.cursor ? Math.max(0, ruler.points.length - 1) : Infinity,
  );

  function start() {
    armRuler();
    onarm();
  }
</script>

<fieldset>
  <legend>Что измерить</legend>
  <div class="modes">
    {#each MODES as mode (mode.id)}
      <label class="mode" class:chosen={ruler.mode === mode.id}>
        <input
          class="visually-hidden"
          type="radio"
          name="ruler-mode"
          value={mode.id}
          bind:group={ruler.mode}
        />
        <span>{mode.label}</span>
      </label>
    {/each}
  </div>
</fieldset>

<div class="actions">
  {#if ruler.drawing}
    <button type="button" class="action primary" onclick={finishRuler}>Закончить</button>
    <button
      type="button"
      class="action"
      disabled={ruler.points.length === 0}
      onclick={removeLastRulerPoint}
    >
      Убрать точку
    </button>
  {:else}
    <button type="button" class="action primary" onclick={start}>
      {ruler.points.length > 0 ? 'Измерить заново' : 'Начать измерение'}
    </button>
    <button
      type="button"
      class="action"
      disabled={ruler.points.length === 0}
      onclick={clearRuler}
    >
      Стереть
    </button>
  {/if}
</div>

{#if result.segments.length > 0}
  <table>
    <caption class="visually-hidden">Отрезки измерения</caption>
    <thead>
      <tr>
        <th scope="col">Отрезок</th>
        <th scope="col">Длина</th>
        <th scope="col">Азимут</th>
      </tr>
    </thead>
    <tbody>
      {#each result.segments as segment, index (index)}
        <tr class:pending={index >= pending}>
          <th scope="row">{index + 1}</th>
          <td>{formatLength(segment.length)}</td>
          <td>{segment.length > 0 ? formatAzimuth(segment.azimuth, settings.angles) : '—'}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <dl class="totals">
    <div>
      <dt>{result.area === null ? 'Всего' : 'Периметр'}</dt>
      <dd>{formatLength(result.length)}</dd>
    </div>
    {#if result.area !== null}
      <div>
        <dt>Площадь</dt>
        <dd>{formatArea(result.area)}</dd>
      </div>
    {/if}
  </dl>
{:else}
  <p class="note">
    Точки ставятся щелчками по карте. Щелчок по фишке ставит точку точно в её место.
  </p>
{/if}

{#if !ruler.drawing && ruler.points.length > 0}
  <p class="note">Точки готового измерения можно перетаскивать.</p>
{/if}

<fieldset>
  <legend>Азимут</legend>
  {#each ANGLE_UNITS as unit (unit.id)}
    <label class="row">
      <input type="radio" name="angle-unit" value={unit.id} bind:group={settings.angles} />
      <span>{unit.label}</span>
    </label>
  {/each}
</fieldset>

<p class="note">Азимут истинный: отсчитывается от направления на географический север.</p>

<style>
  .modes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .mode {
    display: grid;
    place-items: center;
    min-height: 36px;
    border: 1px solid var(--edge);
    border-radius: var(--radius);
    cursor: pointer;
  }

  .mode:hover {
    background: var(--surface-raised);
  }

  .mode.chosen {
    border-color: var(--accent);
    background: var(--surface-raised);
  }

  .mode:has(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    margin-top: 12px;
  }

  table {
    width: 100%;
    margin-top: 14px;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 5px 0;
    text-align: right;
    border-bottom: 1px solid var(--edge);
  }

  th:first-child {
    text-align: left;
  }

  thead th {
    font-size: var(--text-small);
    font-weight: 400;
    color: var(--ink-soft);
  }

  tbody th {
    font-weight: 400;
    color: var(--ink-soft);
  }

  .pending td {
    color: var(--ink-soft);
  }

  .totals {
    margin: 10px 0 0;
  }

  .totals div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 2px 0;
  }

  .totals dt {
    color: var(--ink-soft);
  }

  .totals dd {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 32px;
    cursor: pointer;
  }

  .note {
    margin: 12px 0 0;
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  fieldset + .note {
    margin-top: 6px;
  }
</style>
