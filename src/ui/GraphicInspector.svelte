<script lang="ts">
  import { tick } from 'svelte';
  import { angleCircle, angleSuffix, fromAngleUnit, toAngleUnit } from '../core/angles';
  import { normalizeAzimuth } from '../core/geodesy';
  import {
    GRAPHIC_COLORS,
    GRAPHIC_DASHES,
    GRAPHIC_WIDTHS,
    RANGE_MAX,
    RANGE_MIN,
    canFill,
    clampRange,
    clampSpread,
    graphicKind,
    type Graphic,
    type GraphicColor,
    type GraphicDash,
    type GraphicWidth,
  } from '../core/graphics';
  import { formatArea, formatLength, measure } from '../core/measure';
  import { removeGraphic, select, selection, updateGraphic } from '../model/scenario.svelte';
  import { settings } from '../model/settings.svelte';
  import GraphicIcon from './GraphicIcon.svelte';
  import SidePanel from './SidePanel.svelte';

  let { graphic }: { graphic: Graphic } = $props();

  let label: HTMLInputElement;

  $effect(() => {
    if (!selection.fresh) return;
    selection.fresh = false;
    tick().then(() => label?.focus());
  });

  const size = $derived.by(() => {
    if (graphic.kind === 'point' || graphic.kind === 'sector') return null;
    return measure($state.snapshot(graphic.points) as [number, number][], graphic.kind === 'area');
  });

  const unit = $derived(`${angleSuffix(settings.angles)}`);
  const circle = $derived(angleCircle(settings.angles));

  function angle(event: Event & { currentTarget: HTMLInputElement }): number | null {
    const value = event.currentTarget.valueAsNumber;
    return Number.isFinite(value) ? fromAngleUnit(value, settings.angles) : null;
  }

  function setAzimuth(event: Event & { currentTarget: HTMLInputElement }) {
    const degrees = angle(event);
    if (degrees !== null) {
      updateGraphic(graphic.id, { azimuth: normalizeAzimuth(degrees) }, 'azimuth');
    }
  }

  function setSpread(event: Event & { currentTarget: HTMLInputElement }) {
    const degrees = angle(event);
    if (degrees !== null) updateGraphic(graphic.id, { spread: clampSpread(degrees) }, 'spread');
  }

  function setRange(event: Event & { currentTarget: HTMLInputElement }) {
    const meters = event.currentTarget.valueAsNumber;
    if (Number.isFinite(meters)) {
      updateGraphic(graphic.id, { range: clampRange(meters) }, 'range');
    }
  }
</script>

<SidePanel title="Знак" side="right" onclose={() => select(null)}>
  <div class="heading">
    <GraphicIcon kind={graphic.kind} color={graphic.color} dashed={graphic.dash === 'dashed'} />
    <p>
      {graphicKind(graphic.kind).label}{#if size}, {formatLength(size.length)}{/if}
      {#if size && size.area !== null}
        <span class="extra">Площадь {formatArea(size.area)}</span>
      {/if}
    </p>
  </div>

  <label class="field">
    <span>Подпись</span>
    <input
      bind:this={label}
      type="text"
      value={graphic.label}
      maxlength="40"
      oninput={(event) => updateGraphic(graphic.id, { label: event.currentTarget.value }, 'label')}
    />
  </label>

  <label class="field">
    <span>Цвет</span>
    <select
      value={graphic.color}
      onchange={(event) =>
        updateGraphic(graphic.id, { color: event.currentTarget.value as GraphicColor })}
    >
      {#each GRAPHIC_COLORS as color (color.id)}
        <option value={color.id}>{color.label}</option>
      {/each}
    </select>
  </label>

  {#if graphic.kind !== 'point'}
    <div class="pair">
      <label class="field">
        <span>Линия</span>
        <select
          value={graphic.dash}
          onchange={(event) =>
            updateGraphic(graphic.id, { dash: event.currentTarget.value as GraphicDash })}
        >
          {#each GRAPHIC_DASHES as dash (dash.id)}
            <option value={dash.id}>{dash.label}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>Толщина</span>
        <select
          value={graphic.width}
          onchange={(event) =>
            updateGraphic(graphic.id, { width: event.currentTarget.value as GraphicWidth })}
        >
          {#each GRAPHIC_WIDTHS as width (width.id)}
            <option value={width.id}>{width.label}</option>
          {/each}
        </select>
      </label>
    </div>
  {/if}

  {#if canFill(graphic.kind)}
    <label class="row">
      <input
        type="checkbox"
        checked={graphic.fill}
        onchange={(event) => updateGraphic(graphic.id, { fill: event.currentTarget.checked })}
      />
      <span>Заливка</span>
    </label>
  {/if}

  {#if graphic.kind === 'sector'}
    <div class="pair">
      <label class="field">
        <span>Азимут оси, {unit}</span>
        <input
          type="number"
          min="0"
          max={circle}
          step={settings.angles === 'deg' ? 1 : 10}
          value={toAngleUnit(graphic.azimuth, settings.angles)}
          oninput={setAzimuth}
        />
      </label>
      <label class="field">
        <span>Раствор, {unit}</span>
        <input
          type="number"
          min="1"
          max={circle}
          step={settings.angles === 'deg' ? 5 : 50}
          value={toAngleUnit(graphic.spread, settings.angles)}
          oninput={setSpread}
        />
      </label>
    </div>
    <label class="field">
      <span>Дальность, м</span>
      <input
        type="number"
        min={RANGE_MIN}
        max={RANGE_MAX}
        step="50"
        value={Math.round(graphic.range)}
        oninput={setRange}
      />
    </label>
  {/if}

  <p class="note">
    {#if graphic.kind === 'sector'}
      Ручка на оси задаёт направление и дальность, ручки на краях дуги — раствор.
    {:else if graphic.kind === 'point'}
      Точку можно перетаскивать по карте.
    {:else}
      Вершины перетаскиваются. Ручка посреди отрезка добавляет вершину, двойной щелчок по
      вершине убирает её.
    {/if}
  </p>

  <div class="actions">
    <button type="button" class="action" onclick={() => removeGraphic(graphic.id)}>Удалить</button>
  </div>
</SidePanel>

<style>
  .heading {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding-top: 8px;
  }

  .heading p {
    margin: 0;
    color: var(--ink-soft);
  }

  .extra {
    display: block;
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 32px;
    margin-top: 10px;
    cursor: pointer;
  }

  .note {
    margin: 14px 0;
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  .actions {
    display: grid;
  }
</style>
