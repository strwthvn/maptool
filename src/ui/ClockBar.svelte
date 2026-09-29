<script lang="ts">
  import { LAST_TURN, clockMoment } from '../core/clock';
  import { advanceAll, clockNotice, hasTravellers, stepClock } from '../model/clock.svelte';
  import { scenario } from '../model/scenario.svelte';

  /** Открыть настройки часов. */
  let { onsettings }: { onsettings: () => void } = $props();

  const moment = $derived(clockMoment(scenario.clock, scenario.clock.turn));
</script>

<div class="clock">
  <div class="bar" role="group" aria-label="Игровые часы">
    <button
      type="button"
      class="step"
      aria-label="Ход назад"
      title="Ход назад ([)"
      disabled={scenario.clock.turn === 0}
      onclick={() => stepClock(-1)}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d="m12 5-5 5 5 5" />
      </svg>
    </button>
    <button
      type="button"
      class="face"
      title="Настройки часов: начало сценария и длина хода"
      onclick={onsettings}
    >
      <span class="turn">Ход {scenario.clock.turn}</span>
      <span class="time">
        {#if moment.date}<span class="date">{moment.date}</span>{/if}
        {moment.time}
      </span>
    </button>
    <button
      type="button"
      class="step"
      aria-label="Ход вперёд"
      title="Ход вперёд (])"
      disabled={scenario.clock.turn >= LAST_TURN}
      onclick={() => stepClock(1)}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d="m8 5 5 5-5 5" />
      </svg>
    </button>
  </div>

  {#if hasTravellers()}
    <button
      type="button"
      class="advance"
      title="Поставить фишки туда, где они должны быть на этом ходу по своим маршрутам (A)"
      onclick={advanceAll}
    >
      Продвинуть фишки
    </button>
  {/if}

  {#if clockNotice.text}
    <p class="message" role="status">{clockNotice.text}</p>
  {/if}
</div>

<style>
  .clock {
    position: absolute;
    top: 12px;
    left: calc(12px + var(--left-inset));
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px;
    max-width: calc(100% - var(--left-inset) - var(--controls-inset) - 130px);
    /* Промежутки между частями часов прозрачны и для щелчков: под ними карта. */
    pointer-events: none;
  }

  .bar,
  .advance,
  .message {
    pointer-events: auto;
    background: var(--surface);
    border: 1px solid var(--edge);
    border-radius: var(--radius);
    box-shadow: var(--lift);
  }

  .bar {
    display: flex;
    overflow: hidden;
  }

  button:hover:not(:disabled) {
    background: var(--surface-raised);
  }

  button:disabled {
    color: var(--ink-faint);
    cursor: default;
  }

  .step {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
  }

  .face {
    display: flex;
    align-items: baseline;
    gap: 10px;
    height: 40px;
    padding: 0 10px;
    line-height: 40px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    border-left: 1px solid var(--edge);
    border-right: 1px solid var(--edge);
  }

  .turn {
    font-weight: 600;
  }

  .time {
    color: var(--ink-soft);
  }

  .date {
    margin-right: 4px;
  }

  .advance {
    height: 42px;
    padding: 0 12px;
  }

  .message {
    flex-basis: 100%;
    width: max-content;
    max-width: 360px;
    margin: 0;
    padding: 6px 10px;
    font-size: var(--text-small);
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (max-width: 640px) {
    .clock {
      max-width: calc(100% - 120px);
    }

    .date {
      display: none;
    }
  }
</style>
