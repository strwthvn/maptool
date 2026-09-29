<script lang="ts">
  import { hotkeyGroups } from '../core/hotkeys';

  let { open = $bindable() }: { open: boolean } = $props();

  let dialog: HTMLDialogElement;

  const groups = hotkeyGroups();

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  /** Щелчок мимо окна закрывает его: сам диалог занимает весь экран, окно — его часть. */
  function outside(event: MouseEvent) {
    if (event.target === dialog) open = false;
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="hotkeys-title"
  onclose={() => (open = false)}
  onclick={outside}
>
  <!-- Закрытое окно пусто: списку клавиш незачем лежать на странице, пока его не открыли. -->
  {#if open}
    <div class="window">
      <header>
        <h2 id="hotkeys-title">Клавиши</h2>
        <button type="button" aria-label="Закрыть" title="Закрыть" onclick={() => (open = false)}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      </header>

      <div class="body">
        {#each groups as { group, title, keys } (group)}
          <section>
            <h3>{title}</h3>
            <dl>
              {#each keys as key (key.keys)}
                <div>
                  <dt><kbd>{key.keys}</kbd></dt>
                  <dd>{key.label}</dd>
                </div>
              {/each}
            </dl>
          </section>
        {/each}
      </div>

      <p class="note">
        Клавиши названы по латинской раскладке, но работают в любой. Пока курсор стоит в поле
        ввода, они пишут текст.
      </p>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(760px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    padding: 0;
    color: var(--ink);
    background: none;
    border: 0;
  }

  dialog::backdrop {
    background: rgba(20, 20, 24, 0.6);
  }

  .window {
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 24px);
    background: var(--surface);
    border: 1px solid var(--edge);
    border-radius: var(--radius);
    box-shadow: var(--lift);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: none;
    height: 44px;
    padding-left: 16px;
    border-bottom: 1px solid var(--edge);
  }

  h2 {
    margin: 0;
    font-size: var(--text);
    font-weight: 600;
  }

  header button {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    color: var(--ink-soft);
  }

  header button:hover {
    color: var(--ink);
    background: var(--surface-raised);
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
  }

  .body {
    min-height: 0;
    overflow-y: auto;
    padding: 4px 16px 8px;
    columns: 2 300px;
    column-gap: 28px;
  }

  section {
    break-inside: avoid;
  }

  h3 {
    margin: 0;
    padding: 12px 0 4px;
    font-size: var(--text-small);
    font-weight: 400;
    color: var(--ink-soft);
  }

  dl {
    margin: 0;
  }

  dl div {
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr);
    gap: 10px;
    padding: 3px 0;
  }

  dd {
    margin: 0;
  }

  kbd {
    font: inherit;
    font-weight: 600;
    font-variant-numeric: lining-nums;
    white-space: nowrap;
  }

  .note {
    flex: none;
    margin: 0;
    padding: 10px 16px 12px;
    font-size: var(--text-small);
    color: var(--ink-soft);
    border-top: 1px solid var(--edge);
  }
</style>
