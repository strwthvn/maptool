<script lang="ts">
  import { routeTitle, type Route } from '../core/route';
  import { reportState, retryReport, routeReport } from '../model/reports.svelte';
  import { findUnit } from '../model/scenario.svelte';
  import Drawer from './Drawer.svelte';
  import ProfileChart from './ProfileChart.svelte';
  import RouteTotals from './RouteTotals.svelte';

  interface Props {
    route: Route;
    /** Сколько карты панель закрывает снизу, пикселей. */
    height: number;
  }

  let { route, height = $bindable() }: Props = $props();

  const report = $derived(routeReport(route.id));
  const status = $derived(reportState(route));
  const title = $derived(routeTitle(route, findUnit(route.unitId)));
</script>

<Drawer title="Профиль высот" subtitle={title} bind:height>
  {#snippet totals()}
    {#if report}
      <RouteTotals {report} />
    {/if}
  {/snippet}

  {#if status === 'failed'}
    <p class="drawer-message" role="status">
      Высоты не загрузились. Проверьте подключение к сети.
      <button type="button" class="action" onclick={() => retryReport(route.id)}>Повторить</button>
    </p>
  {:else if report}
    <div class="drawer-body" class:stale={status === 'loading'}>
      <ProfileChart {report} />
    </div>
  {:else}
    <p class="drawer-message" role="status">Снимаю высоты вдоль маршрута…</p>
  {/if}
</Drawer>
