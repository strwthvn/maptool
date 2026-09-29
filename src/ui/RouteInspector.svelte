<script lang="ts">
  import { tick } from 'svelte';
  import { LAST_TURN, clampTurnNumber, formatMoment } from '../core/clock';
  import { GRAPHIC_COLORS, type GraphicColor } from '../core/graphics';
  import { formatLength } from '../core/measure';
  import { MOVEMENT_PROFILES, SURFACES, type MovementProfileId, type Surface } from '../core/movement';
  import {
    arrivalTurn,
    formatDuration,
    formatElevation,
    formatSlope,
    reverseRoute,
    type Route,
  } from '../core/route';
  import { unitTitle } from '../core/units';
  import { armContinue } from '../model/arming';
  import { reportState, retryReport, routeReport } from '../model/reports.svelte';
  import { routeFocus } from '../model/routeFocus.svelte';
  import {
    findUnit,
    profileOf,
    removeRoute,
    scenario,
    select,
    selection,
    updateRoute,
  } from '../model/scenario.svelte';
  import ProfileChart from './ProfileChart.svelte';
  import RouteIcon from './RouteIcon.svelte';
  import SidePanel from './SidePanel.svelte';

  interface Props {
    route: Route;
    /** На узком экране профиль высот показан здесь, а не под картой. */
    compact: boolean;
    /** Вызывается, когда маршрут ждёт щелчков по карте. */
    onarm: () => void;
  }

  let { route, compact, onarm }: Props = $props();

  let name: HTMLInputElement;

  $effect(() => {
    if (!selection.fresh) return;
    selection.fresh = false;
    tick().then(() => name?.focus());
  });

  const report = $derived(routeReport(route.id));
  const status = $derived(reportState(route));
  const profile = $derived(profileOf(route.movement));

  /** Покрытие всего маршрута, если оно везде одно. */
  const common = $derived(
    route.surfaces.every((surface) => surface === route.surfaces[0]) ? route.surfaces[0] : '',
  );

  function setOwner(id: string) {
    const unit = findUnit(id || null);
    // Маршрут, отданный фишке, идёт так, как движется она.
    if (unit) {
      updateRoute(route.id, { unitId: unit.id, movement: unit.movement, color: unit.affiliation });
    } else {
      updateRoute(route.id, { unitId: null });
    }
  }

  function setSurface(leg: number, surface: Surface) {
    const surfaces = route.surfaces.map((current, index) => (index === leg ? surface : current));
    updateRoute(route.id, { surfaces });
  }

  function setEverySurface(surface: string) {
    if (!surface) return;
    updateRoute(route.id, { surfaces: route.surfaces.map(() => surface as Surface) });
  }

  function setStartTurn(event: Event & { currentTarget: HTMLInputElement }) {
    const value = event.currentTarget.valueAsNumber;
    if (!Number.isFinite(value) || value < 0) return;
    updateRoute(route.id, { startTurn: clampTurnNumber(value) }, 'startTurn');
  }

  function extend() {
    armContinue(route);
    onarm();
  }

  function reverse() {
    updateRoute(route.id, reverseRoute($state.snapshot(route) as Route));
  }

  $effect(() => () => (routeFocus.leg = null));
</script>

<SidePanel title="Маршрут" side="right" onclose={() => select(null)}>
  <div class="heading">
    <RouteIcon color={route.color} />
    <p>
      {#if report}
        <span class="sum">{formatLength(report.length)} · {formatDuration(report.time)}</span>
        <span>Набор {formatElevation(report.ascent)}, сброс {formatElevation(report.descent)}</span>
      {:else if status === 'failed'}
        Высоты не загрузились
      {:else}
        Снимаю высоты вдоль маршрута…
      {/if}
    </p>
  </div>

  {#if status === 'failed'}
    <p class="warning" role="status">
      Без высот время не посчитать. Проверьте подключение к сети.
      <button type="button" class="action" onclick={() => retryReport(route.id)}>Повторить</button>
    </p>
  {/if}

  {#if report && report.blockedLength > 0}
    <p class="warning" role="status">
      {formatLength(report.blockedLength)} маршрута не пройти: уклон круче {profile.maxSlope}° —
      предела для профиля «{profile.label}». Время посчитано без этих отрезков.
    </p>
  {/if}

  {#if compact && report}
    <ProfileChart {report} height={150} />
  {/if}

  <label class="field">
    <span>Название</span>
    <input
      bind:this={name}
      type="text"
      value={route.name}
      maxlength="40"
      oninput={(event) => updateRoute(route.id, { name: event.currentTarget.value }, 'name')}
    />
  </label>

  <label class="field">
    <span>Чей маршрут</span>
    <select value={route.unitId ?? ''} onchange={(event) => setOwner(event.currentTarget.value)}>
      <option value="">Ничей</option>
      {#each scenario.units as unit (unit.id)}
        <option value={unit.id}>{unitTitle(unit)}</option>
      {/each}
    </select>
  </label>

  <div class="pair">
    <label class="field">
      <span>Как движется</span>
      <select
        value={route.movement}
        onchange={(event) =>
          updateRoute(route.id, { movement: event.currentTarget.value as MovementProfileId })}
      >
        {#each MOVEMENT_PROFILES as item (item.id)}
          <option value={item.id}>{item.label}</option>
        {/each}
      </select>
    </label>
    <label class="field">
      <span>Цвет</span>
      <select
        value={route.color}
        onchange={(event) =>
          updateRoute(route.id, { color: event.currentTarget.value as GraphicColor })}
      >
        {#each GRAPHIC_COLORS as color (color.id)}
          <option value={color.id}>{color.label}</option>
        {/each}
      </select>
    </label>
  </div>

  <label class="field">
    <span>Выход на ходу</span>
    <input
      type="number"
      min="0"
      max={LAST_TURN}
      step="1"
      value={route.startTurn}
      oninput={setStartTurn}
    />
  </label>

  {#if report}
    <dl class="facts">
      <div>
        <dt>Выход</dt>
        <dd>{formatMoment(scenario.clock, route.startTurn)}</dd>
      </div>
      <div>
        <dt>Прибытие</dt>
        <dd>
          {formatMoment(scenario.clock, arrivalTurn(report))}, ход {Math.ceil(
            arrivalTurn(report) - 1e-9,
          )}
        </dd>
      </div>
      <div>
        <dt>Высоты</dt>
        <dd>{formatElevation(report.lowest)} – {formatElevation(report.highest)}</dd>
      </div>
      <div>
        <dt>Самый крутой уклон</dt>
        <dd>{formatSlope(report.steepest)}</dd>
      </div>
      <div>
        <dt>Ходов по {scenario.clock.turnMinutes} мин</dt>
        <dd>{Math.ceil(report.time / (scenario.clock.turnMinutes * 60) - 1e-9)}</dd>
      </div>
    </dl>
  {/if}

  <fieldset>
    <legend>Участки</legend>
    {#if route.surfaces.length > 1}
      <label class="every">
        <span>Весь маршрут</span>
        <select value={common} onchange={(event) => setEverySurface(event.currentTarget.value)}>
          {#if !common}
            <option value="">Разное</option>
          {/if}
          {#each SURFACES as surface (surface.id)}
            <option value={surface.id}>{surface.label}</option>
          {/each}
        </select>
      </label>
    {/if}

    <table>
      <caption class="visually-hidden">Участки маршрута</caption>
      <thead>
        <tr>
          <th scope="col">№</th>
          <th scope="col">Длина</th>
          <th scope="col">Время</th>
          <th scope="col">Покрытие</th>
        </tr>
      </thead>
      <tbody>
        {#each route.surfaces as surface, index (index)}
          {@const leg = report?.legs[index]}
          <tr
            class:stop={leg && leg.blocked > 0}
            onpointerenter={() => (routeFocus.leg = index)}
            onpointerleave={() => (routeFocus.leg = null)}
            onfocusin={() => (routeFocus.leg = index)}
            onfocusout={() => (routeFocus.leg = null)}
          >
            <th scope="row">{index + 1}</th>
            <td>{leg ? formatLength(leg.length) : '—'}</td>
            <td>{leg ? formatDuration(leg.time) : '—'}</td>
            <td>
              <select
                aria-label="Покрытие участка {index + 1}"
                value={surface}
                onchange={(event) => setSurface(index, event.currentTarget.value as Surface)}
              >
                {#each SURFACES as item (item.id)}
                  <option value={item.id}>{item.label}</option>
                {/each}
              </select>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </fieldset>

  {#if report && report.turnEvery > 1}
    <p class="note">
      Ходов много: на карте отмечен каждый {report.turnEvery}-й.
    </p>
  {/if}
  {#if report && report.patched > 0}
    <p class="note">
      В данных о рельефе были выбросы: часть высот восстановлена по соседним точкам.
    </p>
  {/if}

  <p class="note">
    Точки перетаскиваются. Ручка посреди участка добавляет точку, двойной щелчок по точке убирает
    её. Уклон считается по ходу движения: обратный путь займёт другое время.
  </p>

  <div class="actions">
    <button type="button" class="action" onclick={extend}>Продолжить</button>
    <button type="button" class="action" onclick={reverse}>Развернуть</button>
    <button type="button" class="action remove" onclick={() => removeRoute(route.id)}>Удалить</button>
  </div>
</SidePanel>

<style>
  .heading {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 60px;
    padding-top: 8px;
  }

  .heading p {
    display: grid;
    margin: 0;
    color: var(--ink-soft);
  }

  .sum {
    font-size: 1.125rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }

  .warning {
    display: grid;
    gap: 8px;
    margin: 6px 0 4px;
    padding: 8px 10px;
    border: 1px solid var(--hazard);
    border-radius: var(--radius);
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .facts {
    margin: 12px 0 0;
  }

  .facts div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    padding: 2px 0;
  }

  .facts dt {
    color: var(--ink-soft);
  }

  .facts dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .every {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 132px;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    color: var(--ink-soft);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 3px 8px 3px 0;
    text-align: right;
    white-space: nowrap;
    border-bottom: 1px solid var(--edge);
  }

  th:first-child {
    text-align: left;
  }

  td:last-child,
  th:last-child {
    width: 132px;
    padding-right: 0;
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

  tbody tr:hover {
    background: var(--surface-raised);
  }

  .stop td:nth-child(3) {
    color: var(--hazard);
  }

  td select,
  .every select {
    height: 32px;
  }

  .note {
    margin: 12px 0 0;
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-top: 14px;
  }

  .actions .action {
    padding: 0 6px;
  }
</style>
