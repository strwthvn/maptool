<script lang="ts">
  import { formatDistance, metersPerPixel, scaleBar } from '../core/scale';
  import { view } from '../model/view.svelte';

  const MAX_WIDTH = 140;

  const bar = $derived(scaleBar(metersPerPixel(view.center[1], view.zoom), MAX_WIDTH));

  // Делений столько, чтобы каждое было круглым: 1 → 2 × 0,5; 2 → 2 × 1; 5 → 5 × 1.
  const divisions = $derived(String(bar.meters).startsWith('5') ? 5 : 2);

  /** Наклонённая карта уходит в перспективу: отрезок верен только у её центра. */
  const pitched = $derived(view.pitch > 0);
</script>

<div
  class="scale"
  aria-label="Масштаб{pitched ? ' у центра карты' : ''}: отрезок {formatDistance(bar.meters)}"
  title={pitched ? 'Карта наклонена: масштаб верен у её центра, дальнее выглядит мельче' : null}
>
  <span class="end">0</span>
  <div class="bar" style:width="{bar.px}px">
    {#each { length: divisions }, index (index)}
      <span class="division" class:filled={index % 2 === 0}></span>
    {/each}
  </div>
  <span class="end">{formatDistance(bar.meters)}{pitched ? ' у центра' : ''}</span>
</div>

<style>
  .scale {
    display: flex;
    align-items: center;
    gap: 6px;
    font-variant-numeric: tabular-nums;
  }

  .bar {
    display: flex;
    height: 7px;
    border: 1px solid var(--ink);
  }

  .division {
    flex: 1;
  }

  .division.filled {
    background: var(--ink);
  }

  .end {
    font-size: var(--text-small);
    color: var(--ink-soft);
    white-space: nowrap;
  }
</style>
