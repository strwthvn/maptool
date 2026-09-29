<script lang="ts">
  import { tick } from 'svelte';
  import { formatPosition } from '../core/coords';
  import { formatLength } from '../core/measure';
  import { MOVEMENT_PROFILES, type MovementProfileId } from '../core/movement';
  import { describeReach } from '../core/rings';
  import { formatDuration, routeTitle, type Route } from '../core/route';
  import {
    AFFILIATIONS,
    ECHELONS,
    STATUSES,
    UNIT_TYPES,
    hasEchelon,
    retype,
    unitDescription,
    type Affiliation,
    type EchelonId,
    type Unit,
    type UnitStatus,
    type UnitTypeId,
    type WeaponRange,
  } from '../core/units';
  import { advanceUnits, stationOf } from '../model/clock.svelte';
  import { routeReport } from '../model/reports.svelte';
  import {
    profileOf,
    removeUnit,
    routesOf,
    scenario,
    select,
    selection,
    updateUnit,
  } from '../model/scenario.svelte';
  import { settings } from '../model/settings.svelte';
  import type { SightTask } from '../model/sight.svelte';
  import RouteIcon from './RouteIcon.svelte';
  import SidePanel from './SidePanel.svelte';
  import SymbolIcon from './SymbolIcon.svelte';

  interface Props {
    unit: Unit;
    onduplicate: (unit: Unit) => void;
    /** Проложить маршрут от фишки. */
    onroute: (unit: Unit) => void;
    /** Открыть маршрут фишки. */
    onshowroute: (route: Route) => void;
    /** Показать, что видит фишка, или проверить, видит ли она цель. */
    onsight: (unit: Unit, task: SightTask) => void;
  }

  let { unit, onduplicate, onroute, onshowroute, onsight }: Props = $props();

  const routes = $derived(routesOf(unit.id));
  const reach = $derived(describeReach(profileOf(unit.movement), scenario.clock.turnMinutes));

  /** Где фишке быть на текущем ходу по её маршруту. */
  const station = $derived(stationOf(unit));
  const away = $derived(
    station?.point
      ? Math.abs(station.point.position[0] - unit.position[0]) > 1e-9 ||
          Math.abs(station.point.position[1] - unit.position[1]) > 1e-9
      : false,
  );

  function totals(route: Route): string {
    const report = routeReport(route.id);
    return report ? `${formatLength(report.length)} · ${formatDuration(report.time)}` : '';
  }

  let callsign: HTMLInputElement;

  $effect(() => {
    if (!selection.fresh) return;
    selection.fresh = false;
    tick().then(() => callsign?.focus());
  });

  function setRange(index: number, patch: Partial<WeaponRange>, field: string) {
    const ranges = unit.ranges.map((range, i) => (i === index ? { ...range, ...patch } : range));
    updateUnit(unit.id, { ranges }, `ranges.${index}.${field}`);
  }

  function addRange() {
    updateUnit(unit.id, { ranges: [...unit.ranges, { name: '', meters: 0 }] });
  }

  function removeRange(index: number) {
    updateUnit(unit.id, { ranges: unit.ranges.filter((_, i) => i !== index) });
  }
</script>

<SidePanel title="Фишка" side="right" onclose={() => select(null)}>
  <div class="heading">
    <SymbolIcon spec={unit} size={24} />
    <p>{unitDescription(unit)}</p>
  </div>

  <label class="field">
    <span>Позывной</span>
    <input
      bind:this={callsign}
      type="text"
      value={unit.callsign}
      maxlength="24"
      oninput={(event) => updateUnit(unit.id, { callsign: event.currentTarget.value }, 'callsign')}
    />
  </label>

  <label class="field">
    <span>Сторона</span>
    <select
      value={unit.affiliation}
      onchange={(event) =>
        updateUnit(unit.id, { affiliation: event.currentTarget.value as Affiliation })}
    >
      {#each AFFILIATIONS as side (side.id)}
        <option value={side.id}>{side.label}</option>
      {/each}
    </select>
  </label>

  <label class="field">
    <span>Тип</span>
    <select
      value={unit.type}
      onchange={(event) =>
        updateUnit(unit.id, retype(unit, event.currentTarget.value as UnitTypeId))}
    >
      {#each UNIT_TYPES as type (type.id)}
        <option value={type.id}>{type.label}</option>
      {/each}
    </select>
  </label>

  {#if hasEchelon(unit.type)}
    <label class="field">
      <span>Эшелон</span>
      <select
        value={unit.echelon}
        onchange={(event) =>
          updateUnit(unit.id, { echelon: event.currentTarget.value as EchelonId })}
      >
        {#each ECHELONS as size (size.id)}
          <option value={size.id}>{size.label}</option>
        {/each}
      </select>
    </label>
  {/if}

  <label class="field">
    <span>Состояние</span>
    <select
      value={unit.status}
      onchange={(event) => updateUnit(unit.id, { status: event.currentTarget.value as UnitStatus })}
    >
      {#each STATUSES as state (state.id)}
        <option value={state.id}>{state.label}</option>
      {/each}
    </select>
  </label>

  <label class="field">
    <span>Как движется</span>
    <select
      value={unit.movement}
      onchange={(event) =>
        updateUnit(unit.id, { movement: event.currentTarget.value as MovementProfileId })}
    >
      {#each MOVEMENT_PROFILES as profile (profile.id)}
        <option value={profile.id}>{profile.label}</option>
      {/each}
    </select>
  </label>

  <label class="row">
    <input
      type="checkbox"
      checked={unit.showReach}
      onchange={(event) => updateUnit(unit.id, { showReach: event.currentTarget.checked })}
    />
    <span>Показывать досягаемость за ход</span>
  </label>
  {#if reach}
    <p class="note">За ход в {scenario.clock.turnMinutes} мин: {reach}.</p>
  {/if}

  <fieldset>
    <legend>Дальности оружия</legend>
    {#each unit.ranges as range, index (index)}
      <div class="range">
        <input
          type="text"
          aria-label="Оружие"
          placeholder="Оружие"
          value={range.name}
          oninput={(event) => setRange(index, { name: event.currentTarget.value }, 'name')}
        />
        <input
          type="number"
          aria-label="Дальность, м"
          min="0"
          step="50"
          placeholder="0"
          value={range.meters || ''}
          oninput={(event) =>
            setRange(index, { meters: Math.max(0, event.currentTarget.valueAsNumber || 0) }, 'meters')}
        />
        <span class="unit">м</span>
        <button
          type="button"
          class="remove"
          aria-label="Убрать дальность"
          title="Убрать дальность"
          onclick={() => removeRange(index)}
        >
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      </div>
    {/each}
    <button type="button" class="action" onclick={addRange}>Добавить дальность</button>
    <label class="row">
      <input
        type="checkbox"
        checked={unit.showRanges}
        onchange={(event) => updateUnit(unit.id, { showRanges: event.currentTarget.checked })}
      />
      <span>Показывать дальности на карте</span>
    </label>
  </fieldset>

  <fieldset>
    <legend>Маршруты</legend>
    {#if routes.length > 0}
      <ul class="routes">
        {#each routes as route (route.id)}
          <li>
            <button type="button" class="route" onclick={() => onshowroute(route)}>
              <RouteIcon color={route.color} size={20} />
              <span class="route-name">{routeTitle(route, unit)}</span>
              <span class="route-sum">{totals(route)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if station}
      <p class="note">
        {#if !station.point}
          Маршрут «{routeTitle(station.route, unit)}» ещё считается.
        {:else if away}
          На ходу {scenario.clock.turn} фишке быть в {formatLength(station.point.distance)} от начала
          маршрута «{routeTitle(station.route, unit)}».
        {:else}
          Фишка стоит там, где ей быть на ходу {scenario.clock.turn}.
        {/if}
      </p>
    {/if}
    <div class="route-actions">
      <button type="button" class="action" onclick={() => onroute(unit)}>Проложить маршрут</button>
      {#if station}
        <button
          type="button"
          class="action"
          disabled={!away}
          onclick={() => advanceUnits(unit.id)}
        >
          Продвинуть
        </button>
      {/if}
    </div>
  </fieldset>

  <fieldset>
    <legend>Видимость</legend>
    <div class="actions">
      <button type="button" class="action" onclick={() => onsight(unit, 'zone')}>Что видит</button>
      <button type="button" class="action" onclick={() => onsight(unit, 'line')}>
        Видит ли цель
      </button>
    </div>
  </fieldset>

  <label class="field">
    <span>Заметки</span>
    <textarea
      rows="3"
      value={unit.notes}
      oninput={(event) => updateUnit(unit.id, { notes: event.currentTarget.value }, 'notes')}
    ></textarea>
  </label>

  <dl class="position">
    <dt>Положение</dt>
    <dd>{formatPosition(unit.position[0], unit.position[1], settings.coords)}</dd>
  </dl>

  <div class="actions">
    <button type="button" class="action" onclick={() => onduplicate(unit)}>Дублировать</button>
    <button type="button" class="action" onclick={() => removeUnit(unit.id)}>Удалить</button>
  </div>
</SidePanel>

<style>
  .heading {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding-top: 8px;
  }

  .heading p {
    margin: 0;
    color: var(--ink-soft);
  }

  .range {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 84px auto 32px;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .unit {
    color: var(--ink-soft);
  }

  .remove {
    display: grid;
    place-items: center;
    width: 32px;
    height: 36px;
    color: var(--ink-soft);
    border-radius: var(--radius);
  }

  .remove:hover {
    color: var(--ink);
    background: var(--surface-raised);
  }

  .remove svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
    margin-top: 4px;
    cursor: pointer;
  }

  .note {
    margin: 0 0 6px;
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  .route-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .route-actions .action:only-child {
    grid-column: 1 / -1;
  }

  .routes {
    margin: 0 0 6px;
    padding: 0;
    list-style: none;
  }

  .route {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 36px;
    padding: 0 6px;
    text-align: left;
    border-radius: var(--radius);
  }

  .route:hover {
    background: var(--surface-raised);
  }

  .route-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .route-sum {
    font-size: var(--text-small);
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft);
    white-space: nowrap;
  }

  .position {
    margin: 14px 0;
  }

  .position dt {
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  .position dd {
    margin: 2px 0 0;
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
</style>
