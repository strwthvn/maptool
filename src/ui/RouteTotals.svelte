<script lang="ts">
  import { formatLength } from '../core/measure';
  import { formatDuration, formatElevation, type RouteReport } from '../core/route';

  /** Итоги маршрута одной строкой: длина, время, набор и сброс высоты. */
  let { report }: { report: RouteReport } = $props();
</script>

<dl class="totals">
  {#if report.blockedLength > 0}
    <div class="stop">
      <dt>Не пройти</dt>
      <dd>{formatLength(report.blockedLength)}</dd>
    </div>
  {/if}
  <div>
    <dt>Длина</dt>
    <dd>{formatLength(report.length)}</dd>
  </div>
  <div>
    <dt>Время</dt>
    <dd>{formatDuration(report.time)}</dd>
  </div>
  <div>
    <dt>Набор</dt>
    <dd>{formatElevation(report.ascent)}</dd>
  </div>
  <div>
    <dt>Сброс</dt>
    <dd>{formatElevation(report.descent)}</dd>
  </div>
</dl>

<style>
  .totals {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 16px;
    margin: 0;
  }

  .totals div {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  dt {
    font-size: var(--text-small);
    color: var(--ink-soft);
    white-space: nowrap;
  }

  dd {
    margin: 0;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .stop dt,
  .stop dd {
    color: var(--hazard);
  }
</style>
