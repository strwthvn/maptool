<script lang="ts">
  import type { SymbolSpec } from '../core/units';
  import { symbolSvg } from '../map/symbols';

  interface Props {
    spec: SymbolSpec;
    size?: number;
  }

  let { spec, size = 20 }: Props = $props();

  const symbol = $derived(symbolSvg(spec, size));
</script>

<span class="symbol" aria-hidden="true">{@html symbol.svg}</span>

<style>
  .symbol {
    display: grid;
    place-items: center;
    flex: none;
  }

  .symbol :global(svg) {
    display: block;
  }
</style>
