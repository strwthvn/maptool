<script lang="ts">
  import type { SightReport } from '../core/los';
  import { formatLength } from '../core/measure';

  /** Итоги линии видимости одной строкой: видна ли цель, дальность, преграда, закрытое. */
  let { report }: { report: SightReport } = $props();
</script>

<dl class="totals">
  <div class="verdict" class:seen={report.visible} class:unseen={!report.visible}>
    <dt>Цель</dt>
    <dd>{report.visible ? 'видна' : 'не видна'}</dd>
  </div>
  <div>
    <dt>Дальность</dt>
    <dd>{formatLength(report.length)}</dd>
  </div>
  {#if report.obstacle}
    <div>
      <dt>Преграда</dt>
      <dd>в {formatLength(report.obstacle.distance)}</dd>
    </div>
  {/if}
  <div>
    <dt>Закрыто</dt>
    <dd>{formatLength(report.hiddenLength)}</dd>
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

  .seen dd {
    color: var(--seen);
  }

  .unseen dd {
    color: var(--unseen);
  }
</style>
