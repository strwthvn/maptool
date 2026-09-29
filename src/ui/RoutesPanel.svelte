<script lang="ts">
  import { GRAPHIC_COLORS, type GraphicColor } from '../core/graphics';
  import { formatLength } from '../core/measure';
  import {
    MOVEMENT_PROFILES,
    SLOPE_MAX,
    SLOPE_MIN,
    SPEED_MAX,
    SPEED_MIN,
    SURFACES,
    clampSlope,
    clampSpeed,
    type MovementProfileId,
    type MovementSpeeds,
  } from '../core/movement';
  import { TURN_MAX, TURN_MIN } from '../core/clock';
  import { formatDuration, routeTitle, type Route } from '../core/route';
  import { unitTitle } from '../core/units';
  import { armRoute } from '../model/arming';
  import { reportState, routeReport } from '../model/reports.svelte';
  import {
    DRAFT_ID,
    cancelRoute,
    finishRoute,
    removeLastRoutePoint,
    routeBrush,
    routeDraft,
    routeDraftReady,
  } from '../model/routeDraft.svelte';
  import {
    findUnit,
    profileOf,
    resetProfile,
    scenario,
    selectRoute,
    selection,
    setProfileSpeeds,
    setTurnMinutes,
  } from '../model/scenario.svelte';
  import RouteIcon from './RouteIcon.svelte';

  interface Props {
    /** Вызывается, когда маршрут ждёт щелчков по карте. */
    onarm: () => void;
    onshow: (route: Route) => void;
  }

  let { onarm, onshow }: Props = $props();

  /** Профиль, скорости которого открыты для правки. */
  let edited = $state<MovementProfileId>('foot');

  const speeds = $derived(profileOf(edited));
  const owner = $derived(findUnit(routeDraft.unitId));
  const progress = $derived(routeDraft.active ? routeReport(DRAFT_ID) : null);

  const SPEED_FIELDS: { id: 'road' | 'track' | 'offroad'; label: string }[] = [
    { id: 'road', label: 'Дорога' },
    { id: 'track', label: 'Грунтовка' },
    { id: 'offroad', label: 'Бездорожье' },
  ];

  function start() {
    armRoute();
    onarm();
  }

  function open(route: Route) {
    selectRoute(route.id);
    onshow(route);
  }

  function setMovement(id: MovementProfileId) {
    if (routeDraft.active) routeDraft.movement = id;
    else routeBrush.movement = id;
  }

  function setColor(id: GraphicColor) {
    if (routeDraft.active) routeDraft.color = id;
    else routeBrush.color = id;
  }

  function setSpeed(field: keyof MovementSpeeds, event: Event & { currentTarget: HTMLInputElement }) {
    const value = event.currentTarget.valueAsNumber;
    if (!Number.isFinite(value) || value <= 0) return;
    const { road, track, offroad, maxSlope } = speeds;
    const next: MovementSpeeds = { road, track, offroad, maxSlope };
    if (field === 'maxSlope') next.maxSlope = clampSlope(value);
    else next[field] = clampSpeed(value);
    setProfileSpeeds(edited, next, field);
  }

  function setTurn(event: Event & { currentTarget: HTMLInputElement }) {
    const value = event.currentTarget.valueAsNumber;
    if (Number.isFinite(value) && value >= TURN_MIN) setTurnMinutes(value);
  }

  function totals(route: Route): string {
    const report = routeReport(route.id);
    if (report) return `${formatLength(report.length)} · ${formatDuration(report.time)}`;
    return reportState(route) === 'failed' ? 'Высоты не загрузились' : 'Считаю…';
  }
</script>

<div class="actions">
  {#if routeDraft.active}
    <button type="button" class="action primary" onclick={finishRoute}>
      {routeDraftReady() ? 'Закончить' : 'Отмена'}
    </button>
    <button
      type="button"
      class="action"
      disabled={routeDraft.points.length === 0}
      onclick={removeLastRoutePoint}
    >
      Убрать точку
    </button>
  {:else}
    <button type="button" class="action primary wide" onclick={start}>Проложить маршрут</button>
  {/if}
</div>

{#if routeDraft.active}
  <p class="progress" role="status">
    {#if owner}
      <span class="owner">Маршрут фишки «{unitTitle(owner)}»</span>
    {/if}
    {#if progress}
      <span class="sum">{formatLength(progress.length)} · {formatDuration(progress.time)}</span>
    {:else if routeDraft.points.length < 2}
      Точки ставятся щелчками по карте.
    {:else}
      Считаю…
    {/if}
  </p>
  {#if routeDraft.routeId}
    <button type="button" class="action quiet" onclick={cancelRoute}>Оставить маршрут как был</button>
  {/if}
{/if}

<label class="field">
  <span>Как движется</span>
  <select
    value={routeDraft.active ? routeDraft.movement : routeBrush.movement}
    onchange={(event) => setMovement(event.currentTarget.value as MovementProfileId)}
  >
    {#each MOVEMENT_PROFILES as profile (profile.id)}
      <option value={profile.id}>{profile.label}</option>
    {/each}
  </select>
</label>

<fieldset>
  <legend>Покрытие следующих участков</legend>
  <div class="surfaces">
    {#each SURFACES as surface (surface.id)}
      <label class="surface" class:chosen={routeBrush.surface === surface.id}>
        <input
          class="visually-hidden"
          type="radio"
          name="route-surface"
          value={surface.id}
          bind:group={routeBrush.surface}
        />
        <svg viewBox="0 0 40 6" width="40" height="6" aria-hidden="true">
          <path class={surface.id} d="M2 3h36" />
        </svg>
        <span>{surface.label}</span>
      </label>
    {/each}
  </div>
</fieldset>

<div class="pair">
  <label class="field">
    <span>Цвет</span>
    <select
      value={routeDraft.active ? routeDraft.color : routeBrush.color}
      onchange={(event) => setColor(event.currentTarget.value as GraphicColor)}
    >
      {#each GRAPHIC_COLORS as color (color.id)}
        <option value={color.id}>{color.label}</option>
      {/each}
    </select>
  </label>
  <label class="field">
    <span>Длина хода, мин</span>
    <input
      type="number"
      min={TURN_MIN}
      max={TURN_MAX}
      step="1"
      value={scenario.clock.turnMinutes}
      oninput={setTurn}
    />
  </label>
</div>

<section>
  <h3>На карте <span class="count">{scenario.routes.length}</span></h3>
  {#if scenario.routes.length === 0}
    <p class="empty">
      Маршрутов пока нет. Щелчок по фишке начинает маршрут от неё: он возьмёт её способ
      движения и цвет.
    </p>
  {:else}
    <ul>
      {#each scenario.routes as route (route.id)}
        <li>
          <button
            type="button"
            class="item"
            aria-pressed={selection.routeId === route.id}
            onclick={() => open(route)}
          >
            <RouteIcon color={route.color} />
            <span class="name">
              <span class="title">{routeTitle(route, findUnit(route.unitId))}</span>
              <span class="hint">{totals(route)}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<details>
  <summary>Скорости движения</summary>

  <label class="field">
    <span>Профиль</span>
    <select bind:value={edited}>
      {#each MOVEMENT_PROFILES as profile (profile.id)}
        <option value={profile.id}>{profile.label}</option>
      {/each}
    </select>
  </label>

  <div class="speeds">
    {#each SPEED_FIELDS as field (field.id)}
      <label class="field">
        <span>{field.label}, км/ч</span>
        <input
          type="number"
          min={SPEED_MIN}
          max={SPEED_MAX}
          step="0.5"
          value={speeds[field.id]}
          oninput={(event) => setSpeed(field.id, event)}
        />
      </label>
    {/each}
    {#if speeds.maxSlope !== null}
      <label class="field">
        <span>Предельный уклон, °</span>
        <input
          type="number"
          min={SLOPE_MIN}
          max={SLOPE_MAX}
          step="1"
          value={speeds.maxSlope}
          oninput={(event) => setSpeed('maxSlope', event)}
        />
      </label>
    {/if}
  </div>

  <button
    type="button"
    class="action quiet"
    disabled={!scenario.profiles[edited]}
    onclick={() => resetProfile(edited)}
  >
    Вернуть исходные
  </button>

  <p class="note">
    Скорости даны для ровного места. Пешком уклон учитывается по функции Тоблера, техника
    теряет скорость линейно; круче предельного уклона движения нет. Скорости хранятся в сценарии.
  </p>
</details>

<style>
  .actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    margin-top: 10px;
  }

  .wide {
    grid-column: 1 / -1;
  }

  .progress {
    display: grid;
    gap: 2px;
    margin: 10px 0 0;
    color: var(--ink-soft);
  }

  .sum {
    font-size: 1.125rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }

  .quiet {
    width: 100%;
    margin-top: 8px;
  }

  .surfaces {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .surface {
    display: grid;
    justify-items: center;
    gap: 5px;
    padding: 9px 2px 6px;
    font-size: var(--text-small);
    border: 1px solid var(--edge);
    border-radius: var(--radius);
    cursor: pointer;
  }

  .surface:hover {
    background: var(--surface-raised);
  }

  .surface.chosen {
    border-color: var(--accent);
    background: var(--surface-raised);
  }

  .surface:has(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .surface path {
    fill: none;
    stroke: var(--ink);
    stroke-width: 3;
  }

  .surface .track {
    stroke-dasharray: 10 5;
  }

  .surface .offroad {
    stroke-dasharray: 3 4.5;
  }

  .pair,
  .speeds {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 8px;
  }

  h3 {
    margin: 0;
    padding: 14px 0 4px;
    font-size: var(--text-small);
    font-weight: 400;
    color: var(--ink-soft);
  }

  .count {
    margin-left: 4px;
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }

  .empty {
    margin: 4px 0 0;
    color: var(--ink-soft);
  }

  ul {
    margin: 0 -14px;
    padding: 0;
    list-style: none;
  }

  .item {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    padding: 4px 14px;
    text-align: left;
    border-left: 3px solid transparent;
  }

  .item:hover {
    background: var(--surface-raised);
  }

  .item[aria-pressed='true'] {
    background: var(--surface-raised);
    border-left-color: var(--accent);
  }

  .name {
    display: grid;
    min-width: 0;
    line-height: 1.2;
  }

  .name span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title {
    font-weight: 600;
  }

  .hint {
    font-size: var(--text-small);
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft);
  }

  details {
    margin-top: 16px;
    border-top: 1px solid var(--edge);
  }

  summary {
    padding: 12px 0 2px;
    cursor: pointer;
  }

  .note {
    margin: 12px 0 0;
    font-size: var(--text-small);
    color: var(--ink-soft);
  }
</style>
