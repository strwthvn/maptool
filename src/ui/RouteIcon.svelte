<script lang="ts">
  import { graphicInk, type GraphicColor } from '../core/graphics';

  let { color, size = 24 }: { color: GraphicColor; size?: number } = $props();

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
>
  {#snippet shape()}
    <path d="M5 19c6 0 3-7 8-7s2-7 6-7" />
    <path d="M15 5h4.5v4.5" />
    <circle cx="5" cy="19" r="1.5" />
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

  .ink circle {
    fill: var(--line);
  }
</style>
