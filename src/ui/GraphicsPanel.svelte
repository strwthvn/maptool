<script lang="ts">
  import {
    GRAPHIC_COLORS,
    GRAPHIC_DASHES,
    GRAPHIC_KINDS,
    GRAPHIC_WIDTHS,
    graphicKind,
    graphicTitle,
    type Graphic,
    type GraphicKind,
  } from '../core/graphics';
  import { armDraft } from '../model/arming';
  import { brush, cancelDraft, draft } from '../model/draft.svelte';
  import { scenario, selectGraphic, selection } from '../model/scenario.svelte';
  import GraphicIcon from './GraphicIcon.svelte';

  interface Props {
    /** Вызывается, когда знак выбран и ждёт щелчков по карте. */
    onarm: () => void;
    onshow: (graphic: Graphic) => void;
  }

  let { onarm, onshow }: Props = $props();

  function arm(kind: GraphicKind) {
    if (draft.kind === kind) {
      cancelDraft();
      return;
    }
    armDraft(kind);
    onarm();
  }

  function open(graphic: Graphic) {
    selectGraphic(graphic.id);
    onshow(graphic);
  }
</script>

<fieldset>
  <legend>Что нарисовать</legend>
  <div class="kinds">
    {#each GRAPHIC_KINDS as kind (kind.id)}
      <button
        type="button"
        class="kind"
        aria-pressed={draft.kind === kind.id}
        onclick={() => arm(kind.id)}
      >
        <GraphicIcon kind={kind.id} color={brush.color} dashed={brush.dash === 'dashed'} />
        <span class="name">
          <span>{kind.label}</span>
          <span class="hint">{kind.hint}</span>
        </span>
      </button>
    {/each}
  </div>
</fieldset>

<fieldset>
  <legend>Цвет</legend>
  <div class="colors">
    {#each GRAPHIC_COLORS as color (color.id)}
      <label class="color" class:chosen={brush.color === color.id}>
        <input
          class="visually-hidden"
          type="radio"
          name="graphic-color"
          value={color.id}
          bind:group={brush.color}
        />
        <span class="swatch" style:background={color.line} style:border-color={color.casing}></span>
        <span>{color.label}</span>
      </label>
    {/each}
  </div>
</fieldset>

<div class="pair">
  <label class="field">
    <span>Линия</span>
    <select bind:value={brush.dash}>
      {#each GRAPHIC_DASHES as dash (dash.id)}
        <option value={dash.id}>{dash.label}</option>
      {/each}
    </select>
  </label>
  <label class="field">
    <span>Толщина</span>
    <select bind:value={brush.width}>
      {#each GRAPHIC_WIDTHS as width (width.id)}
        <option value={width.id}>{width.label}</option>
      {/each}
    </select>
  </label>
</div>

<label class="row">
  <input type="checkbox" bind:checked={brush.fill} />
  <span>Заливать районы и секторы</span>
</label>

<section>
  <h3>На карте <span class="count">{scenario.graphics.length}</span></h3>
  {#if scenario.graphics.length === 0}
    <p class="empty">Знаков пока нет. Выберите, что нарисовать, и щёлкайте по карте.</p>
  {:else}
    <ul>
      {#each scenario.graphics as graphic (graphic.id)}
        <li>
          <button
            type="button"
            class="item"
            aria-pressed={selection.graphicId === graphic.id}
            onclick={() => open(graphic)}
          >
            <GraphicIcon
              kind={graphic.kind}
              color={graphic.color}
              dashed={graphic.dash === 'dashed'}
            />
            <span class="name">
              <span class="title">{graphicTitle(graphic)}</span>
              {#if graphic.label.trim()}
                <span class="hint">{graphicKind(graphic.kind).label}</span>
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .kinds {
    display: grid;
    gap: 6px;
  }

  .kind {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 4px 10px;
    text-align: left;
    border: 1px solid var(--edge);
    border-radius: var(--radius);
  }

  .kind:hover {
    background: var(--surface-raised);
  }

  .kind[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--surface-raised);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .name {
    display: grid;
    min-width: 0;
    line-height: 1.2;
  }

  .name span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hint {
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  .colors {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .color {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 8px;
    border: 1px solid var(--edge);
    border-radius: var(--radius);
    cursor: pointer;
  }

  .color:hover {
    background: var(--surface-raised);
  }

  .color.chosen {
    border-color: var(--accent);
    background: var(--surface-raised);
  }

  .color:has(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .swatch {
    flex: none;
    width: 16px;
    height: 16px;
    border: 2px solid;
    border-radius: 50%;
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 32px;
    margin-top: 10px;
    cursor: pointer;
  }

  h3 {
    margin: 0;
    padding: 14px 0 4px;
    font-size: var(--text-small);
    font-weight: 400;
    color: var(--ink-soft);
  }

  .count {
    margin-left: 4px;
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }

  .empty {
    margin: 4px 0 0;
    color: var(--ink-soft);
  }

  ul {
    margin: 0 -14px;
    padding: 0;
    list-style: none;
  }

  .item {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 4px 14px;
    text-align: left;
    border-left: 3px solid transparent;
  }

  .item:hover {
    background: var(--surface-raised);
  }

  .item[aria-pressed='true'] {
    background: var(--surface-raised);
    border-left-color: var(--accent);
  }

  .title {
    font-weight: 600;
  }
</style>
