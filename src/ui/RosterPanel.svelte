<script lang="ts">
  import { AFFILIATIONS, unitDescription, type Unit } from '../core/units';
  import { scenario, select, selection } from '../model/scenario.svelte';
  import SymbolIcon from './SymbolIcon.svelte';

  let { onshow }: { onshow: (unit: Unit) => void } = $props();

  const groups = $derived(
    AFFILIATIONS.map((side) => ({
      ...side,
      units: scenario.units.filter((unit) => unit.affiliation === side.id),
    })).filter((group) => group.units.length > 0),
  );

  function open(unit: Unit) {
    select(unit.id);
    onshow(unit);
  }
</script>

{#if groups.length === 0}
  <p class="empty">
    На карте пока нет фишек. Откройте «Фишки», выберите тип и щёлкните по карте.
  </p>
{/if}

{#each groups as group (group.id)}
  <section>
    <h3>{group.label} <span class="count">{group.units.length}</span></h3>
    <ul>
      {#each group.units as unit (unit.id)}
        <li>
          <button
            type="button"
            aria-pressed={selection.unitId === unit.id}
            onclick={() => open(unit)}
          >
            <SymbolIcon spec={unit} size={15} />
            <span class="name">
              {#if unit.callsign.trim()}
                <span class="callsign">{unit.callsign.trim()}</span>
              {/if}
              <span class="kind">{unitDescription(unit)}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/each}

<style>
  .empty {
    margin: 12px 0;
    color: var(--ink-soft);
  }

  h3 {
    margin: 0;
    padding: 12px 0 4px;
    font-size: var(--text-small);
    font-weight: 400;
    color: var(--ink-soft);
  }

  .count {
    margin-left: 4px;
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }

  ul {
    margin: 0 -14px;
    padding: 0;
    list-style: none;
  }

  button {
    display: grid;
    grid-template-columns: 40px 1fr;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 48px;
    padding: 4px 14px;
    text-align: left;
    border-left: 3px solid transparent;
  }

  button:hover {
    background: var(--surface-raised);
  }

  button[aria-pressed='true'] {
    background: var(--surface-raised);
    border-left-color: var(--accent);
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

  .callsign {
    font-weight: 600;
  }

  .callsign + .kind {
    font-size: var(--text-small);
    color: var(--ink-soft);
  }
</style>
