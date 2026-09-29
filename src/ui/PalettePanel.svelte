<script lang="ts">
  import { AFFILIATIONS, ECHELONS, UNIT_TYPES, hasEchelon, type UnitTypeId } from '../core/units';
  import { armPlacing } from '../model/arming';
  import { palette, tools } from '../model/tools.svelte';
  import SymbolIcon from './SymbolIcon.svelte';

  /** Вызывается, когда фишка выбрана и ждёт щелчка по карте. */
  let { onarm }: { onarm: () => void } = $props();

  function arm(type: UnitTypeId) {
    if (tools.placing?.type === type) {
      tools.placing = null;
      return;
    }
    armPlacing({ affiliation: palette.affiliation, echelon: palette.echelon, type });
    onarm();
  }

  // Сторона и эшелон, выбранные после типа, должны попасть в уже взятую фишку.
  $effect(() => {
    if (!tools.placing) return;
    tools.placing.affiliation = palette.affiliation;
    tools.placing.echelon = palette.echelon;
  });
</script>

<fieldset>
  <legend>Сторона</legend>
  <div class="sides">
    {#each AFFILIATIONS as side (side.id)}
      <label class="side" class:chosen={palette.affiliation === side.id}>
        <input
          class="visually-hidden"
          type="radio"
          name="affiliation"
          value={side.id}
          bind:group={palette.affiliation}
        />
        <SymbolIcon
          spec={{ affiliation: side.id, type: 'hq', echelon: 'none', status: 'present' }}
          size={13}
        />
        <span>{side.label}</span>
      </label>
    {/each}
  </div>
</fieldset>

<label class="field">
  <span>Эшелон</span>
  <select bind:value={palette.echelon}>
    {#each ECHELONS as size (size.id)}
      <option value={size.id}>{size.label}</option>
    {/each}
  </select>
</label>

<fieldset>
  <legend>Тип</legend>
  <div class="types">
    {#each UNIT_TYPES as type (type.id)}
      <button
        type="button"
        class="type"
        aria-pressed={tools.placing?.type === type.id}
        onclick={() => arm(type.id)}
      >
        <SymbolIcon
          spec={{
            affiliation: palette.affiliation,
            type: type.id,
            echelon: hasEchelon(type.id) ? palette.echelon : 'none',
            status: 'present',
          }}
          size={17}
        />
        <span>{type.label}</span>
      </button>
    {/each}
  </div>
</fieldset>

<style>
  .sides {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .side {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 8px;
    border: 1px solid var(--edge);
    border-radius: var(--radius);
    cursor: pointer;
  }

  /* В знаке штаба есть древко; для выбора стороны нужна только рамка. */
  .side :global(.symbol) {
    width: 30px;
    height: 24px;
    overflow: hidden;
    place-items: start center;
  }

  .side:hover {
    background: var(--surface-raised);
  }

  .side.chosen {
    border-color: var(--accent);
    background: var(--surface-raised);
  }

  .side:has(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .types {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .type {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    min-height: 52px;
    padding: 4px 6px;
    text-align: left;
    line-height: 1.15;
    hyphens: manual;
    border: 1px solid var(--edge);
    border-radius: var(--radius);
  }

  .type:hover {
    background: var(--surface-raised);
  }

  .type[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--surface-raised);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
</style>
