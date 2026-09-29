<script lang="ts">
  import { elevationRange, tickStep, ticks } from '../core/chart';
  import { formatHeight, sightPointAt, type SightReport } from '../core/los';
  import { formatLength } from '../core/measure';
  import { formatElevation } from '../core/route';
  import { sightFocus } from '../model/sight.svelte';

  interface Props {
    report: SightReport;
    height?: number;
  }

  let { report, height = 168 }: Props = $props();

  /** Поля вокруг графика: слева подписи высот, снизу — расстояний. */
  const PAD = { left: 50, right: 16, top: 14, bottom: 22 };
  const READOUT_WIDTH = 176;

  let width = $state(0);

  const plot = $derived({
    left: PAD.left,
    right: Math.max(PAD.left + 1, width - PAD.right),
    top: PAD.top,
    bottom: height - PAD.bottom,
  });

  // Шкала вмещает и землю, и наблюдателя с целью: они могут стоять выше всего профиля.
  const range = $derived(
    elevationRange(
      Math.min(report.lowest, report.eye, report.aim),
      Math.max(report.highest, report.eye, report.aim),
    ),
  );

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

  /** Луч на цель. Он прямой, но над выпуклой Землёй на графике слегка провисает. */
  const ray = $derived(
    report.points
      .map(({ distance, ray }) => `${x(distance).toFixed(1)},${y(ray).toFixed(1)}`)
      .join(' '),
  );

  const hidden = $derived(report.stretches.filter(({ visible }) => !visible));

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

  const hover = $derived(
    sightFocus.distance === null ? null : sightPointAt(report, sightFocus.distance),
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
    sightFocus.distance = Math.max(0, Math.min(1, share)) * report.length;
  }

  function leave() {
    sightFocus.distance = null;
  }

  $effect(() => leave);
</script>

<div class="chart" bind:clientWidth={width} style:height="{height}px">
  {#if width > 0}
    <svg
      {width}
      {height}
      role="img"
      aria-label="Линия видимости: цель {report.visible
        ? 'видна'
        : 'не видна'}, дальность {formatLength(report.length)}, закрыто {formatLength(
        report.hiddenLength,
      )}"
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

      {#each hidden as stretch (stretch.from)}
        <rect
          class="hidden"
          x={x(stretch.from)}
          y={plot.top}
          width={Math.max(1, x(stretch.to) - x(stretch.from))}
          height={plot.bottom - plot.top}
        />
      {/each}

      <polygon
        class="area"
        points="{plot.left},{plot.bottom} {outline} {plot.right},{plot.bottom}"
      />
      <polyline class="line" points={outline} />

      <polyline class="ray" class:blocked={!report.visible} points={ray} />

      <line
        class="post"
        x1={plot.left}
        x2={plot.left}
        y1={y(report.points[0]?.elevation ?? report.eye)}
        y2={y(report.eye)}
      />
      <circle class="eye" cx={plot.left} cy={y(report.eye)} r="4.5" />
      <line
        class="post"
        x1={plot.right}
        x2={plot.right}
        y1={y(report.points.at(-1)?.elevation ?? report.aim)}
        y2={y(report.aim)}
      />
      <circle class="aim" class:blocked={!report.visible} cx={plot.right} cy={y(report.aim)} r="4" />

      {#if report.obstacle}
        <circle
          class="obstacle"
          cx={x(report.obstacle.distance)}
          cy={y(report.obstacle.elevation)}
          r="4.5"
        />
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
          <dt>Удаление</dt>
          <dd>{formatLength(hover.distance)}</dd>
        </div>
        <div>
          <dt>Высота земли</dt>
          <dd>{formatElevation(hover.elevation)}</dd>
        </div>
        <div>
          <dt>{hover.ray >= hover.elevation ? 'Луч над землёй' : 'Земля над лучом'}</dt>
          <dd>{formatHeight(Math.round(Math.abs(hover.ray - hover.elevation)))}</dd>
        </div>
        <div>
          <dt>Цель здесь</dt>
          <dd class:seen={hover.visible} class:unseen={!hover.visible}>
            {hover.visible ? 'видна' : 'не видна'}
          </dd>
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

  .hidden {
    fill: color-mix(in srgb, var(--unseen) 26%, transparent);
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

  .ray {
    fill: none;
    stroke: var(--seen);
    stroke-width: 1.5;
    stroke-dasharray: 6 4;
  }

  .ray.blocked {
    stroke: var(--unseen);
  }

  .post {
    stroke: var(--ink);
    stroke-width: 1.5;
  }

  .eye {
    fill: var(--accent);
    stroke: var(--ink);
    stroke-width: 2;
  }

  .aim {
    fill: var(--ink);
    stroke: var(--seen);
    stroke-width: 2.5;
  }

  .aim.blocked {
    stroke: var(--unseen);
  }

  .obstacle {
    fill: var(--unseen);
    stroke: var(--surface-deep);
    stroke-width: 2;
  }

  .tick {
    stroke: var(--ink-soft);
    stroke-width: 1;
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
    top: 16px;
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

  .readout .seen {
    color: var(--seen);
  }

  .readout .unseen {
    color: var(--unseen);
  }
</style>
