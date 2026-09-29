<script lang="ts">
  import { COORD_FORMATS, positionParts } from '../core/coords';
  import { activeCredits } from '../map/style';
  import { probe } from '../model/probe.svelte';
  import { nextCoordFormat, settings } from '../model/settings.svelte';
  import { view } from '../model/view.svelte';
  import ScaleBar from './ScaleBar.svelte';

  let { failing }: { failing: boolean } = $props();

  const credits = $derived(activeCredits(view));

  const position = $derived(positionParts(probe.lng, probe.lat, settings.coords));
  const format = $derived(COORD_FORMATS.find(({ id }) => id === settings.coords)!.label);

  const elevation = $derived(
    probe.elevation === null ? '—' : `${Math.round(probe.elevation).toLocaleString('ru-RU')} м`,
  );
  const zoom = $derived(view.zoom.toFixed(1).replace('.', ','));
</script>

<footer class="status">
  <dl class="readout">
    <div class="item position">
      <dt>{probe.source === 'cursor' ? 'Курсор' : 'Центр'}</dt>
      <dd>
        <button
          type="button"
          class="format {settings.coords}"
          title="Формат: {format}. Щелчок меняет формат."
          onclick={nextCoordFormat}
        >
          {#each position as part, index (index)}
            <span>{part}</span>
          {/each}
        </button>
      </dd>
    </div>
    <div class="item elevation">
      <dt>Высота</dt>
      <dd>{elevation}</dd>
    </div>
    <div class="item zoom">
      <dt>Зум</dt>
      <dd>{zoom}</dd>
    </div>
  </dl>

  <ScaleBar />

  {#if failing}
    <p class="failure" role="status">
      Часть карты не загрузилась. Проверьте подключение к сети.
    </p>
  {/if}

  <p class="credits">
    {#each credits as credit (credit.href)}
      <span class="credit"
        ><a href={credit.href} target="_blank" rel="noreferrer">{credit.text}</a></span
      >
    {/each}
  </p>
</footer>

<style>
  .status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 20px;
    min-height: 36px;
    padding: 4px 14px;
    background: var(--surface-deep);
    border-top: 1px solid var(--edge);
  }

  .readout {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 20px;
    margin: 0;
  }

  .item {
    display: flex;
    align-items: baseline;
    gap: 7px;
  }

  dt {
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  dd {
    display: flex;
    gap: 12px;
    margin: 0;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .format {
    display: flex;
    gap: 12px;
    margin: -2px -6px;
    padding: 2px 6px;
    font-variant-numeric: tabular-nums;
    text-align: left;
    border-radius: var(--radius);
  }

  .format:hover {
    background: var(--surface);
  }

  /* Ширина зарезервирована под самые длинные значения, чтобы строка не дёргалась при движении курсора. */
  .format span {
    min-width: 13ch;
  }

  .format.dms span {
    min-width: 15ch;
  }

  .format.mgrs span,
  .format.utm span {
    min-width: 17ch;
  }

  .elevation dd {
    min-width: 7ch;
  }

  .zoom dd {
    min-width: 4ch;
  }

  .failure {
    margin: 0;
    color: var(--accent);
  }

  .credits {
    margin: 0 0 0 auto;
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  .credit:not(:last-child)::after {
    content: ', ';
  }

  .credits a {
    color: inherit;
    text-decoration: none;
  }

  .credits a:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  @media (max-width: 640px) {
    .credits {
      margin-left: 0;
    }
  }
</style>
