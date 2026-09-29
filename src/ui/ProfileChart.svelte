<script lang="ts">
  import { elevationRange, tickStep, ticks } from '../core/chart';
  import { formatLength } from '../core/measure';
  import { SURFACES } from '../core/movement';
  import {
    enRoute,
    formatDuration,
    formatElevation,
    formatSlope,
    formatSpeed,
    routePointAt,
    type RouteReport,
  } from '../core/route';
  import { routeFocus } from '../model/routeFocus.svelte';
  import { scenario } from '../model/scenario.svelte';

  interface Props {
    report: RouteReport;
    height?: number;
  }

  let { report, height = 168 }: Props = $props();

  /** Поля вокруг графика: слева подписи высот, снизу — расстояний, сверху — номера ходов. */
  const PAD = { left: 50, right: 14, top: 20, bottom: 22 };

  /** Ближе друг к другу номера ходов не подписываются, пикселей. */
  const TURN_LABEL_GAP = 26;
  const READOUT_WIDTH = 168;

  let width = $state(0);

  const plot = $derived({
    left: PAD.left,
    right: Math.max(PAD.left + 1, width - PAD.right),
    top: PAD.top,
    bottom: height - PAD.bottom,
  });

  const range = $derived(elevationRange(report.lowest, report.highest));

  function x(distance: number): number {
    const share = report.length > 0 ? distance / report.length : 0;
    return plot.left + share * (plot.right - plot.left);
  }

  function y(elevation: number): number {
    const share = (elevation - range[0]) / (range[1] - range[0]);
    return plot.bottom - share * (plot.bottom - plot.top);
  }

  const outline = $derived(
    report.points
      .map(({ distance, elevation }) => `${x(distance).toFixed(1)},${y(elevation).toFixed(1)}`)
      .join(' '),
  );

  const levels = $derived(ticks(range[0], range[1], 4));

  const distances = $derived.by(() => {
    const count = Math.max(2, Math.floor((plot.right - plot.left) / 90));
    const step = tickStep(report.length, count);
    // Метры или километры — по шагу делений, чтобы подписи не спорили между собой.
    const label = (value: number) =>
      step >= 1000
        ? `${(value / 1000).toLocaleString('ru-RU')} км`
        : step >= 100 && report.length >= 3000
          ? `${(value / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 1 })} км`
          : `${value} м`;
    return ticks(0, report.length, count).map((value) => ({ value, text: label(value) }));
  });

  const turns = $derived.by(() => {
    let labelled = -Infinity;
    return report.turns.map(({ turn, distance }) => {
      const at = x(distance);
      const named = at - labelled >= TURN_LABEL_GAP;
      if (named) labelled = at;
      return { turn, at, named };
    });
  });

  /** Где фишке быть на текущем ходу, если она в пути. */
  const now = $derived(enRoute(report, scenario.clock.turn));

  const hover = $derived(
    routeFocus.distance === null ? null : routePointAt(report, routeFocus.distance),
  );

  const surface = $derived(
    hover ? SURFACES.find(({ id }) => id === report.legs[hover.leg]?.surface)?.label : undefined,
  );

  /** Подсказка стоит справа от линии курсора, а у правого края графика — слева. */
  const readoutLeft = $derived.by(() => {
    if (!hover) return 0;
    const at = x(hover.distance);
    return at + READOUT_WIDTH + 12 > width ? at - READOUT_WIDTH - 10 : at + 10;
  });

  function point(event: PointerEvent & { currentTarget: SVGSVGElement }) {
    const box = event.currentTarget.getBoundingClientRect();
    const share = (event.clientX - box.left - plot.left) / (plot.right - plot.left);
    routeFocus.distance = Math.max(0, Math.min(1, share)) * report.length;
  }

  function leave() {
    routeFocus.distance = null;
  }

  $effect(() => leave);
</script>

<div class="chart" bind:clientWidth={width} style:height="{height}px">
  {#if width > 0}
    <svg
      {width}
      {height}
      role="img"
      aria-label="Профиль высот: от {formatElevation(report.lowest)} до {formatElevation(
        report.highest,
      )} на пути {formatLength(report.length)}"
      onpointermove={point}
      onpointerdown={point}
      onpointerleave={leave}
    >
      {#each levels as level (level)}
        <line class="grid" x1={plot.left} x2={plot.right} y1={y(level)} y2={y(level)} />
        <text class="axis" x={plot.left - 8} y={y(level)} dy="0.35em" text-anchor="end">
          {Math.round(level).toLocaleString('ru-RU')}
        </text>
      {/each}

      {#each report.blocked as stretch (stretch.from)}
        <rect
          class="blocked"
          x={x(stretch.from)}
          y={plot.top}
          width={Math.max(2, x(stretch.to) - x(stretch.from))}
          height={plot.bottom - plot.top}
        />
      {/each}

      <polygon
        class="area"
        points="{plot.left},{plot.bottom} {outline} {plot.right},{plot.bottom}"
      />
      <polyline class="line" points={outline} />

      {#each report.legs as leg, index (index)}
        {#if index > 0}
          <line class="joint" x1={x(leg.from)} x2={x(leg.from)} y1={plot.top} y2={plot.bottom} />
        {/if}
        <line
          class="surface {leg.surface}"
          x1={x(leg.from) + (index > 0 ? 1 : 0)}
          x2={x(leg.from + leg.length)}
          y1={plot.bottom}
          y2={plot.bottom}
        />
      {/each}

      {#each turns as mark (mark.turn)}
        <line class="turn" x1={mark.at} x2={mark.at} y1={plot.top - 4} y2={plot.top + 3} />
        {#if mark.named}
          <text class="axis turn-name" x={mark.at} y={plot.top - 8} text-anchor="middle">
            {mark.turn}
          </text>
        {/if}
      {/each}

      {#if now}
        <line class="now" x1={x(now.distance)} x2={x(now.distance)} y1={plot.top} y2={plot.bottom} />
        <circle class="now-spot" cx={x(now.distance)} cy={y(now.elevation)} r="4.5" />
      {/if}

      {#each distances as tick (tick.value)}
        <line class="tick" x1={x(tick.value)} x2={x(tick.value)} y1={plot.bottom} y2={plot.bottom + 4} />
        <text
          class="axis"
          x={x(tick.value)}
          y={plot.bottom + 16}
          text-anchor={tick.value === 0
            ? 'start'
            : x(tick.value) > plot.right - 24
              ? 'end'
              : 'middle'}
        >
          {tick.text}
        </text>
      {/each}

      {#if hover}
        <line
          class="cursor"
          x1={x(hover.distance)}
          x2={x(hover.distance)}
          y1={plot.top}
          y2={plot.bottom}
        />
        <circle class="spot" cx={x(hover.distance)} cy={y(hover.elevation)} r="4.5" />
      {/if}
    </svg>

    {#if hover}
      <dl class="readout" style:left="{readoutLeft}px" style:width="{READOUT_WIDTH}px">
        <div>
          <dt>Путь</dt>
          <dd>{formatLength(hover.distance)}</dd>
        </div>
        <div>
          <dt>Высота</dt>
          <dd>{formatElevation(hover.elevation)}</dd>
        </div>
        <div>
          <dt>Уклон</dt>
          <dd>{formatSlope(hover.slope)}</dd>
        </div>
        <div>
          <dt>{surface ?? 'Скорость'}</dt>
          <dd class:stop={hover.blocked}>
            {hover.blocked ? 'не пройти' : formatSpeed(hover.speed)}
          </dd>
        </div>
        <div>
          <dt>В пути</dt>
          <dd>{formatDuration(hover.time)}</dd>
        </div>
      </dl>
    {/if}
  {/if}
</div>

<style>
  .chart {
    position: relative;
    min-width: 0;
  }

  svg {
    display: block;
    touch-action: pan-y;
    cursor: crosshair;
  }

  .grid {
    stroke: var(--edge);
    stroke-width: 1;
  }

  .axis {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    fill: var(--ink-soft);
  }

  .area {
    fill: color-mix(in srgb, var(--accent) 22%, transparent);
  }

  .line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.75;
    stroke-linejoin: round;
  }

  .blocked {
    fill: color-mix(in srgb, var(--hazard) 30%, transparent);
  }

  .joint {
    stroke: var(--ink-faint);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }

  .surface {
    stroke: var(--ink);
    stroke-width: 3;
  }

  .surface.track {
    stroke-dasharray: 8 4;
  }

  .surface.offroad {
    stroke-dasharray: 2 4;
  }

  .tick,
  .turn {
    stroke: var(--ink-soft);
    stroke-width: 1;
  }

  .turn {
    stroke: var(--ink);
    stroke-width: 1.5;
  }

  .turn-name {
    fill: var(--ink);
  }

  .now {
    stroke: var(--accent);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }

  .now-spot {
    fill: var(--ink);
    stroke: var(--accent);
    stroke-width: 2.5;
  }

  .cursor {
    stroke: var(--ink);
    stroke-width: 1;
  }

  .spot {
    fill: var(--accent);
    stroke: var(--ink);
    stroke-width: 2;
  }

  .readout {
    position: absolute;
    top: 22px;
    margin: 0;
    padding: 6px 10px;
    font-size: var(--text-small);
    background: color-mix(in srgb, var(--surface-deep) 94%, transparent);
    border: 1px solid var(--edge);
    border-radius: var(--radius);
    pointer-events: none;
  }

  .readout div {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .readout dt {
    color: var(--ink-soft);
  }

  .readout dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .readout .stop {
    color: var(--hazard);
  }
</style>
