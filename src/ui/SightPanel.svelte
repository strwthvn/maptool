<script lang="ts">
  import { formatAzimuth } from '../core/angles';
  import { inverse } from '../core/geodesy';
  import {
    HEIGHT_MAX,
    RADIUS_MAX,
    RADIUS_MIN,
    VIEW_ZOOM,
    formatHeight,
    type SightReport,
  } from '../core/los';
  import { formatArea, formatLength } from '../core/measure';
  import { formatElevation } from '../core/route';
  import { unitTitle } from '../core/units';
  import { armSightLine, armSightZone } from '../model/arming';
  import { settings } from '../model/settings.svelte';
  import {
    anchorUnit,
    cancelPicking,
    clearLine,
    clearZone,
    lineState,
    retryLine,
    retryZone,
    setObserverHeight,
    setRadius,
    setTargetHeight,
    sight,
    sightReport,
    sightZone,
    swapLine,
    zoneState,
  } from '../model/sight.svelte';
  import SightChart from './SightChart.svelte';

  interface Props {
    /** На узком экране профиль линии показан здесь, а не под картой. */
    compact: boolean;
    /** Вызывается, когда инструмент ждёт щелчков по карте. */
    onarm: () => void;
  }

  let { compact, onarm }: Props = $props();

  const report = $derived(sightReport());
  const lineStatus = $derived(lineState());
  const zone = $derived(sightZone());
  const zoneStatus = $derived(zoneState());

  const observer = $derived(anchorUnit(sight.from));
  const target = $derived(anchorUnit(sight.to));
  const watcher = $derived(anchorUnit(sight.center));

  const azimuth = $derived(
    sight.from && sight.to ? inverse(sight.from.position, sight.to.position).azimuth : null,
  );

  function pickLine() {
    armSightLine();
    onarm();
  }

  function pickZone() {
    armSightZone();
    onarm();
  }

  function height(apply: (meters: number) => void) {
    return (event: Event & { currentTarget: HTMLInputElement }) => {
      const value = event.currentTarget.valueAsNumber;
      if (Number.isFinite(value) && value >= 0) apply(value);
    };
  }

  function radius(event: Event & { currentTarget: HTMLInputElement }) {
    const value = event.currentTarget.valueAsNumber * 1000;
    if (Number.isFinite(value) && value >= RADIUS_MIN) setRadius(value);
  }

  /** Почему цель не видна: что её закрывает и насколько. */
  function reason({ obstacle, needed }: SightReport): string {
    if (!obstacle || needed === null) return '';
    const rise = formatHeight(Math.max(1, Math.ceil(needed)));
    return `Закрывает высота ${formatElevation(obstacle.elevation)} в ${formatLength(
      obstacle.distance,
    )} от наблюдателя. Цель показалась бы, будь она выше ${rise}.`;
  }

  function percent(share: number): string {
    return `${Math.round(share * 100)} %`;
  }
</script>

<fieldset>
  <legend>Высота над землёй</legend>
  <div class="pair">
    <label class="field">
      <span>Наблюдатель, м</span>
      <input
        type="number"
        min="0"
        max={HEIGHT_MAX}
        step="0.1"
        value={sight.observerHeight}
        oninput={height(setObserverHeight)}
      />
    </label>
    <label class="field">
      <span>Цель, м</span>
      <input
        type="number"
        min="0"
        max={HEIGHT_MAX}
        step="0.1"
        value={sight.targetHeight}
        oninput={height(setTargetHeight)}
      />
    </label>
  </div>
  <p class="note">
    1,7 м — человек в рост. С нулевой высотой цели считается, видна ли сама земля.
  </p>
</fieldset>

<section>
  <h3>Линия видимости</h3>
  <div class="actions">
    {#if sight.picking === 'line'}
      <button type="button" class="action primary" onclick={cancelPicking}>Отмена</button>
    {:else}
      <button type="button" class="action primary" onclick={pickLine}>
        {sight.to ? 'Указать заново' : 'Указать на карте'}
      </button>
    {/if}
    <button type="button" class="action" disabled={!sight.from} onclick={clearLine}>Стереть</button>
  </div>

  {#if sight.from && sight.to}
    {#if lineStatus === 'failed'}
      <p class="note" role="status">
        Высоты не загрузились. Проверьте подключение к сети.
        <button type="button" class="action" onclick={retryLine}>Повторить</button>
      </p>
    {:else if report}
      <div class="result" class:stale={lineStatus === 'loading'}>
        <p class="verdict" class:seen={report.visible} class:unseen={!report.visible}>
          {report.visible ? 'Цель видна' : 'Цель не видна'}
        </p>
        {#if !report.visible}
          <p class="note">{reason(report)}</p>
        {/if}
        <dl class="facts">
          <div>
            <dt>Наблюдатель</dt>
            <dd>{observer ? unitTitle(observer) : 'точка на карте'}</dd>
          </div>
          <div>
            <dt>Цель</dt>
            <dd>{target ? unitTitle(target) : 'точка на карте'}</dd>
          </div>
          <div>
            <dt>Дальность</dt>
            <dd>{formatLength(report.length)}</dd>
          </div>
          {#if azimuth !== null && report.length > 0}
            <div>
              <dt>Азимут на цель</dt>
              <dd>{formatAzimuth(azimuth, settings.angles)}</dd>
            </div>
          {/if}
          <div>
            <dt>Глаза наблюдателя</dt>
            <dd>{formatElevation(report.eye)}</dd>
          </div>
          <div>
            <dt>Верх цели</dt>
            <dd>{formatElevation(report.aim)}</dd>
          </div>
          <div>
            <dt>Закрыто по линии</dt>
            <dd>
              {formatLength(report.hiddenLength)}{report.length > 0
                ? `, ${percent(report.hiddenLength / report.length)}`
                : ''}
            </dd>
          </div>
        </dl>
        {#if compact}
          <SightChart {report} height={150} />
        {/if}
      </div>
      <button type="button" class="action wide" onclick={swapLine}>Поменять местами</button>
    {:else}
      <p class="note" role="status">Снимаю высоты вдоль линии…</p>
    {/if}
  {:else if sight.picking !== 'line'}
    <p class="note">
      Первый щелчок по карте ставит наблюдателя, второй — цель. Точка, поставленная на фишку,
      переезжает вместе с ней.
    </p>
  {/if}
</section>

<section>
  <h3>Зона обзора</h3>
  <label class="field">
    <span>Радиус, км</span>
    <input
      type="number"
      min={RADIUS_MIN / 1000}
      max={RADIUS_MAX / 1000}
      step="0.5"
      value={sight.radius / 1000}
      oninput={radius}
    />
  </label>
  <div class="actions">
    {#if sight.picking === 'zone'}
      <button type="button" class="action primary" onclick={cancelPicking}>Отмена</button>
    {:else}
      <button type="button" class="action primary" onclick={pickZone}>
        {sight.center ? 'Указать заново' : 'Указать точку'}
      </button>
    {/if}
    <button type="button" class="action" disabled={!sight.center} onclick={clearZone}>
      Стереть
    </button>
  </div>

  {#if sight.center}
    {#if zoneStatus === 'failed'}
      <p class="note" role="status">
        Высоты не загрузились. Проверьте подключение к сети.
        <button type="button" class="action" onclick={retryZone}>Повторить</button>
      </p>
    {:else if zone}
      <div class="result" class:stale={zoneStatus === 'loading'}>
        <dl class="facts">
          <div>
            <dt>Наблюдатель</dt>
            <dd>{watcher ? unitTitle(watcher) : 'точка на карте'}</dd>
          </div>
          <div>
            <dt>Высота места</dt>
            <dd>{formatElevation(zone.zone.ground)}</dd>
          </div>
          <div>
            <dt>Видно</dt>
            <dd>
              {formatArea(zone.zone.visibleArea)}, {percent(
                zone.zone.area > 0 ? zone.zone.visibleArea / zone.zone.area : 0,
              )}
            </dd>
          </div>
          <div>
            <dt>Вся зона</dt>
            <dd>{formatArea(zone.zone.area)}</dd>
          </div>
        </dl>
        {#if zone.zone.zoom < VIEW_ZOOM}
          <p class="note">
            Зона большая: посчитана по грубой сетке, ячейка {Math.round(zone.zone.cell)} м.
          </p>
        {/if}
      </div>
    {:else}
      <p class="note" role="status">Считаю зону обзора…</p>
    {/if}

    <label class="amount">
      <span>Заливка</span>
      <input type="range" min="0.1" max="1" step="0.05" bind:value={sight.opacity} />
      <output>{percent(sight.opacity)}</output>
    </label>
  {:else if sight.picking !== 'zone'}
    <p class="note">
      Щелчок по карте ставит точку, с которой смотрят. Зону обзора фишки показывает кнопка
      «Что видит» в её редакторе.
    </p>
  {/if}
</section>

<p class="note limits">
  Рельеф известен с шагом около 30 м: строения, дувалы и растительность обзор не закрывают.
  Кривизна Земли и преломление света учтены.
</p>

<style>
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 8px;
  }

  h3 {
    margin: 0;
    padding: 16px 0 6px;
    font-size: var(--text);
    font-weight: 600;
  }

  .actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .field + .actions {
    margin-top: 10px;
  }

  .result {
    margin-top: 10px;
  }

  /* Расчёт на миг отстаёт от точек, пока их двигают. */
  .stale {
    opacity: 0.6;
  }

  .verdict {
    margin: 0 0 4px;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .seen {
    color: var(--seen);
  }

  .unseen {
    color: var(--unseen);
  }

  .facts {
    margin: 6px 0 0;
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
    white-space: nowrap;
  }

  .facts dd {
    margin: 0;
    overflow: hidden;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wide {
    width: 100%;
    margin-top: 10px;
  }

  .note {
    margin: 8px 0 0;
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  .note .action {
    display: block;
    margin-top: 6px;
  }

  .limits {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid var(--edge);
  }

  .amount {
    display: grid;
    grid-template-columns: auto 1fr 44px;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
  }

  .amount span {
    color: var(--ink-soft);
  }

  .amount output {
    font-size: var(--text-small);
    color: var(--ink-soft);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
