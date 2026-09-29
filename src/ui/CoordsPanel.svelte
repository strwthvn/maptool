<script lang="ts">
  import { COORD_FORMATS, formatPosition, parsePosition, type CoordFormat } from '../core/coords';
  import type { LngLat } from '../core/geodesy';
  import { dem } from '../map/dem';
  import { pin } from '../model/pin.svelte';
  import { settings } from '../model/settings.svelte';

  interface Props {
    /** Показать точку на карте. */
    onshow: (position: LngLat) => void;
    /** Центр видимой части карты или null, пока карта не готова. */
    center: () => LngLat | null;
  }

  let { onshow, center }: Props = $props();

  /** Сколько держится отметка «скопировано», мс. */
  const COPIED_MS = 1500;

  let text = $state('');
  let error = $state('');
  let elevation = $state<number | null>(null);
  let copied = $state<CoordFormat | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  const formats = $derived(
    pin.position
      ? COORD_FORMATS.map((format) => ({
          ...format,
          text: formatPosition(pin.position![0], pin.position![1], format.id),
        }))
      : [],
  );

  $effect(() => {
    const position = pin.position;
    elevation = null;
    if (!position) return;
    let current = true;
    dem.elevation(position[0], position[1]).then(
      (value) => {
        if (current) elevation = value;
      },
      () => {},
    );
    return () => {
      current = false;
    };
  });

  function go(event: SubmitEvent) {
    event.preventDefault();
    try {
      const position = parsePosition(text);
      error = '';
      pin.position = position;
      onshow(position);
    } catch (problem) {
      error = problem instanceof Error ? problem.message : 'Не удалось разобрать координаты.';
    }
  }

  function drop() {
    const position = center();
    if (position) pin.position = position;
  }

  async function copy(format: CoordFormat, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      copied = format;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = null), COPIED_MS);
    } catch {
      // Браузер не дал доступа к буферу обмена; координаты можно выделить и скопировать вручную.
    }
  }
</script>

<form onsubmit={go}>
  <label class="field">
    <span>Перейти к точке</span>
    <input
      type="text"
      bind:value={text}
      placeholder="34.43 70.45 или 42S XD 33231 10788"
      autocomplete="off"
      spellcheck="false"
      aria-invalid={error ? 'true' : undefined}
      aria-describedby="coords-help"
      oninput={() => (error = '')}
    />
  </label>
  {#if error}
    <p id="coords-help" class="note failed" role="alert">{error}</p>
  {:else}
    <p id="coords-help" class="note">
      Широта и долгота в градусах или с минутами и секундами, MGRS или UTM.
    </p>
  {/if}
  <button type="submit" class="action primary" disabled={!text.trim()}>Перейти</button>
</form>

<fieldset>
  <legend>Метка</legend>
  {#if pin.position}
    <dl class="formats">
      {#each formats as format (format.id)}
        <div>
          <dt>{format.label}</dt>
          <dd>
            <span class="value">{format.text}</span>
            <button
              type="button"
              class="copy"
              aria-label="Скопировать: {format.label}"
              title="Скопировать"
              onclick={() => copy(format.id, format.text)}
            >
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                {#if copied === format.id}
                  <path d="m4 10.5 4 4 8-9" />
                {:else}
                  <rect x="7" y="7" width="10" height="10" rx="1.5" />
                  <path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H7" />
                {/if}
              </svg>
            </button>
          </dd>
        </div>
      {/each}
      <div>
        <dt>Высота</dt>
        <dd>
          <span class="value">
            {elevation === null ? '—' : `${Math.round(elevation).toLocaleString('ru-RU')} м`}
          </span>
        </dd>
      </div>
    </dl>
    <p class="note">Метку можно перетаскивать по карте.</p>
    <div class="actions">
      <button type="button" class="action" onclick={() => pin.position && onshow(pin.position)}>
        Показать
      </button>
      <button type="button" class="action" onclick={() => (pin.position = null)}>Убрать</button>
    </div>
  {:else}
    <p class="note first">
      Метка показывает координаты места во всех форматах. Её можно перетаскивать по карте.
    </p>
    <button type="button" class="action wide" onclick={drop}>Поставить в центр карты</button>
  {/if}
</fieldset>

<fieldset>
  <legend>Формат координат</legend>
  {#each COORD_FORMATS as format (format.id)}
    <label class="row">
      <input type="radio" name="coord-format" value={format.id} bind:group={settings.coords} />
      <span>{format.label}</span>
    </label>
  {/each}
</fieldset>

<p class="note">В этом формате пишутся координаты под картой и в свойствах фишки.</p>

<style>
  form .action,
  .wide {
    width: 100%;
    margin-top: 10px;
  }

  .note {
    margin: 6px 0 0;
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  .note.first {
    margin-top: 0;
  }

  .note.failed {
    color: var(--accent);
  }

  input[aria-invalid='true'] {
    border-color: var(--accent);
  }

  fieldset {
    margin-top: 8px;
  }

  .formats {
    margin: 0;
  }

  .formats div {
    padding: 4px 0;
    border-bottom: 1px solid var(--edge);
  }

  .formats dt {
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  .formats dd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 28px;
    margin: 0;
  }

  .value {
    font-variant-numeric: tabular-nums;
    user-select: all;
  }

  .copy {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    color: var(--ink-soft);
    border-radius: var(--radius);
  }

  .copy:hover {
    color: var(--ink);
    background: var(--surface-raised);
  }

  .copy svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 10px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 32px;
    cursor: pointer;
  }
</style>
