<script lang="ts">
  import { unitTitle } from '../core/units';
  import { anchorUnit, lineState, retryLine, sight, sightReport } from '../model/sight.svelte';
  import Drawer from './Drawer.svelte';
  import SightChart from './SightChart.svelte';
  import SightTotals from './SightTotals.svelte';

  /** Сколько карты панель закрывает снизу, пикселей. */
  let { height = $bindable() }: { height: number } = $props();

  const report = $derived(sightReport());
  const status = $derived(lineState());

  const title = $derived.by(() => {
    const from = anchorUnit(sight.from);
    const to = anchorUnit(sight.to);
    return `${from ? unitTitle(from) : 'Наблюдатель'} → ${to ? unitTitle(to) : 'цель'}`;
  });
</script>

<Drawer title="Линия видимости" subtitle={title} bind:height>
  {#snippet totals()}
    {#if report}
      <SightTotals {report} />
    {/if}
  {/snippet}

  {#if status === 'failed'}
    <p class="drawer-message" role="status">
      Высоты не загрузились. Проверьте подключение к сети.
      <button type="button" class="action" onclick={retryLine}>Повторить</button>
    </p>
  {:else if report}
    <div class="drawer-body" class:stale={status === 'loading'}>
      <SightChart {report} />
    </div>
  {:else}
    <p class="drawer-message" role="status">Снимаю высоты вдоль линии…</p>
  {/if}
</Drawer>
