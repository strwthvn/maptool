<script lang="ts">
  import { graphicInk, type GraphicColor, type GraphicKind } from '../core/graphics';

  interface Props {
    kind: GraphicKind;
    color: GraphicColor;
    dashed?: boolean;
    size?: number;
  }

  let { kind, color, dashed = false, size = 24 }: Props = $props();

  const ink = $derived(graphicInk(color));
</script>

<svg
  class="icon"
  viewBox="0 0 24 24"
  width={size}
  height={size}
  aria-hidden="true"
  style:--line={ink.line}
  style:--casing={ink.casing}
  class:dashed
>
  {#snippet shape()}
    {#if kind === 'line'}
      <path d="M3 17 9 8l6 7 6-8" />
    {:else if kind === 'arrow'}
      <path d="M4 19 19 5M10 5h9v9" />
    {:else if kind === 'area'}
      <path class="body" d="M5 6 18 4l3 11-9 6-9-7 2-8Z" />
    {:else if kind === 'sector'}
      <path class="body" d="M4 20 8 5a17 17 0 0 1 13 9L4 20Z" />
    {:else}
      <circle class="dot" cx="12" cy="12" r="4.5" />
    {/if}
  {/snippet}
  <g class="casing">{@render shape()}</g>
  <g class="ink">{@render shape()}</g>
</svg>

<style>
  .icon {
    display: block;
    flex: none;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .casing {
    stroke: var(--casing);
    stroke-width: 4.5;
  }

  .ink {
    stroke: var(--line);
    stroke-width: 2.25;
  }

  .dashed .ink {
    stroke-dasharray: 4 3.5;
  }

  .ink .body {
    fill: color-mix(in srgb, var(--line) 25%, transparent);
  }

  .ink .dot {
    fill: var(--line);
  }
</style>
