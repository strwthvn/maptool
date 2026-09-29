<script lang="ts">
  import { graphicKind, type GraphicKind } from '../core/graphics';
  import { formatLength } from '../core/measure';
  import { formatDuration } from '../core/route';
  import { unitType } from '../core/units';
  import { draft, draftReady, finishDraft } from '../model/draft.svelte';
  import { routeReport } from '../model/reports.svelte';
  import { DRAFT_ID, finishRoute, routeDraft, routeDraftReady } from '../model/routeDraft.svelte';
  import { finishRuler, ruler } from '../model/ruler.svelte';
  import { cancelPicking, sight } from '../model/sight.svelte';
  import { tools } from '../model/tools.svelte';

  function firstStep(kind: GraphicKind): string {
    if (kind === 'point') return 'Щёлкните по карте, чтобы поставить точку.';
    if (kind === 'sector') return 'Щёлкните там, где будет вершина сектора.';
    return `Щёлкните по карте, чтобы начать: ${graphicKind(kind).label.toLowerCase()}.`;
  }

  const progress = $derived(routeDraft.active ? routeReport(DRAFT_ID) : null);
</script>

{#if tools.placing}
  <div class="hint" role="status">
    <p>
      Щёлкните по карте, чтобы поставить фишку «{unitType(tools.placing.type).label}».
      <span class="extra">С Shift можно ставить несколько подряд.</span>
    </p>
    <button type="button" onclick={() => (tools.placing = null)}>Отмена</button>
  </div>
{:else if ruler.drawing}
  <div class="hint" role="status">
    <p>
      {#if ruler.points.length === 0}
        Щёлкните по карте, чтобы поставить первую точку.
      {:else}
        Ставьте точки щелчками.
        <span class="extra">Двойной щелчок или Enter — закончить.</span>
      {/if}
    </p>
    <button type="button" onclick={finishRuler}>
      {ruler.points.length < 2 ? 'Отмена' : 'Готово'}
    </button>
  </div>
{:else if draft.kind}
  <div class="hint" role="status">
    <p>
      {#if draft.points.length === 0}
        {firstStep(draft.kind)}
      {:else if draft.kind === 'sector'}
        Щёлкните в направлении оси: расстояние задаст дальность.
      {:else}
        Ставьте точки щелчками.
        <span class="extra">Двойной щелчок или Enter — закончить.</span>
      {/if}
    </p>
    <button type="button" onclick={finishDraft}>{draftReady() ? 'Готово' : 'Отмена'}</button>
  </div>
{:else if routeDraft.active}
  <div class="hint" role="status">
    <p>
      {#if routeDraft.points.length === 0}
        Щёлкните по карте, чтобы начать маршрут.
        <span class="extra">Щелчок по фишке начнёт маршрут от неё.</span>
      {:else}
        {#if progress}
          <span class="sum">{formatLength(progress.length)} · {formatDuration(progress.time)}</span>
        {:else}
          Ставьте точки щелчками.
        {/if}
        <span class="extra">Двойной щелчок или Enter — закончить.</span>
      {/if}
    </p>
    <button type="button" onclick={finishRoute}>{routeDraftReady() ? 'Готово' : 'Отмена'}</button>
  </div>
{:else if sight.picking}
  <div class="hint" role="status">
    <p>
      {#if sight.picking === 'zone'}
        Щёлкните там, откуда смотрят.
      {:else if sight.from}
        Щёлкните по цели.
      {:else}
        Щёлкните там, где стоит наблюдатель.
      {/if}
      <span class="extra">Щелчок по фишке привяжет точку к ней.</span>
    </p>
    <button type="button" onclick={cancelPicking}>Отмена</button>
  </div>
{/if}

<style>
  .hint {
    position: absolute;
    left: calc(var(--left-inset) + (100% - var(--left-inset) - var(--controls-inset)) / 2);
    bottom: calc(16px + var(--bottom-inset));
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 14px;
    width: max-content;
    max-width: calc(100% - var(--left-inset) - var(--controls-inset) - 24px);
    padding: 6px 6px 6px 14px;
    background: var(--surface);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: var(--lift);
  }

  p {
    margin: 0;
  }

  .extra {
    color: var(--ink-soft);
  }

  .sum {
    margin-right: 6px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  button {
    flex: none;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--edge);
    border-radius: var(--radius);
  }

  button:hover {
    background: var(--surface-raised);
  }

  @media (max-width: 640px) {
    .extra {
      display: none;
    }
  }
</style>
