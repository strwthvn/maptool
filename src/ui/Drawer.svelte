<script lang="ts">
  import type { Snippet } from 'svelte';
  import { settings } from '../model/settings.svelte';

  interface Props {
    title: string;
    /** О чём профиль: имя маршрута или концы линии. */
    subtitle: string;
    /** Сколько карты панель закрывает снизу, пикселей. */
    height: number;
    /** Итоги одной строкой рядом с заголовком. */
    totals?: Snippet;
    children: Snippet;
  }

  let { title, subtitle, height = $bindable(), totals, children }: Props = $props();

  $effect(() => () => (height = 0));
</script>

<section class="drawer" aria-label={title} bind:offsetHeight={height}>
  <header>
    <div class="title">
      <h2>{title}</h2>
      <p class="subject">{subtitle}</p>
    </div>
    {@render totals?.()}
    <button
      type="button"
      class="fold"
      aria-expanded={settings.profile}
      aria-label={settings.profile ? 'Свернуть профиль' : 'Развернуть профиль'}
      title={settings.profile ? 'Свернуть профиль' : 'Развернуть профиль'}
      onclick={() => (settings.profile = !settings.profile)}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d={settings.profile ? 'm5 8 5 5 5-5' : 'm5 12 5-5 5 5'} />
      </svg>
    </button>
  </header>

  {#if settings.profile}
    {@render children()}
  {/if}
</section>

<style>
  .drawer {
    position: absolute;
    left: var(--left-inset);
    right: var(--controls-inset);
    bottom: 0;
    background: var(--surface);
    border-top: 1px solid var(--edge);
    box-shadow: var(--lift);
  }

  /* Итоги, которым не хватило места рядом с заголовком, переходят на вторую строку целиком. */
  header {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 20px;
    padding: 0 52px 0 14px;
  }

  .title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
    height: 40px;
    line-height: 40px;
  }

  h2 {
    margin: 0;
    font-size: var(--text);
    font-weight: 600;
    white-space: nowrap;
  }

  .subject {
    margin: 0;
    overflow: hidden;
    color: var(--ink-soft);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  header :global(.totals) {
    min-height: 28px;
    align-items: center;
  }

  .fold {
    position: absolute;
    top: 0;
    right: 0;
    display: grid;
    place-items: center;
    width: 44px;
    height: 40px;
    color: var(--ink-soft);
  }

  .fold:hover {
    color: var(--ink);
    background: var(--surface-raised);
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .drawer :global(.drawer-body) {
    padding: 0 0 4px;
  }

  /* Профиль на миг отстаёт от линии, пока её двигают. */
  .drawer :global(.drawer-body.stale) {
    opacity: 0.6;
  }

  .drawer :global(.drawer-message) {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    margin: 0;
    padding: 0 14px 8px;
    color: var(--ink-soft);
  }
</style>
