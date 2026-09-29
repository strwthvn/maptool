<script lang="ts">
  import {
    emptyScenario,
    parseScenario,
    serializeScenario,
    type Scenario,
  } from '../core/scenario';
  import { LAST_TURN, TURN_MAX, TURN_MIN, formatMoment } from '../core/clock';
  import { fileStem } from '../core/snapshot';
  import { plural } from '../core/words';
  import { goToTurn, setFollow, setStart } from '../model/clock.svelte';
  import {
    renameScenario,
    replaceScenario,
    scenario,
    setTurnMinutes,
  } from '../model/scenario.svelte';
  import { download } from './download';

  /** Вызывается после загрузки сценария из файла. */
  let { onopen }: { onopen: () => void } = $props();

  let picker: HTMLInputElement;
  let message = $state<{ kind: 'done' | 'failed'; text: string; objects: number } | null>(null);

  /** Сколько всего расставлено на карте. */
  const objects = $derived(
    scenario.units.length + scenario.graphics.length + scenario.routes.length,
  );

  // Сообщение описывает карту на момент действия; после отмены или новых правок оно уже неверно.
  const shown = $derived(message && message.objects === objects ? message : null);

  function report(kind: 'done' | 'failed', text: string) {
    message = { kind, text, objects };
  }

  function contents({ units, graphics, routes }: Pick<Scenario, 'units' | 'graphics' | 'routes'>): string {
    const parts = [plural(units.length, ['фишка', 'фишки', 'фишек'])];
    if (graphics.length > 0) parts.push(plural(graphics.length, ['знак', 'знака', 'знаков']));
    if (routes.length > 0) parts.push(plural(routes.length, ['маршрут', 'маршрута', 'маршрутов']));
    if (parts.length === 1) return parts[0];
    return `${parts.slice(0, -1).join(', ')} и ${parts[parts.length - 1]}`;
  }

  function save() {
    const name = `${fileStem(scenario.name, 'Сценарий')}.maptool.json`;
    const blob = new Blob([serializeScenario($state.snapshot(scenario))], {
      type: 'application/json',
    });
    download(blob, name);
    report('done', `Сохранено в файл «${name}».`);
  }

  async function open(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      const loaded = parseScenario(await file.text());
      replaceScenario(loaded);
      report(
        'done',
        `Открыт «${file.name}»: ${contents(loaded)}.`,
      );
      onopen();
    } catch (error) {
      report('failed', error instanceof Error ? error.message : 'Файл не удалось прочитать.');
    }
  }

  function number(event: Event & { currentTarget: HTMLInputElement }): number | null {
    const value = event.currentTarget.valueAsNumber;
    return Number.isFinite(value) ? value : null;
  }

  function setTurn(event: Event & { currentTarget: HTMLInputElement }) {
    const value = number(event);
    if (value !== null && value >= 0) goToTurn(value);
  }

  function setLength(event: Event & { currentTarget: HTMLInputElement }) {
    const value = number(event);
    if (value !== null && value >= TURN_MIN) setTurnMinutes(value);
  }

  function clear() {
    // Название, длина хода и скорости движения — настройки сценария, а не то, что стоит на карте.
    const { name, clock, profiles } = $state.snapshot(scenario);
    replaceScenario({ ...emptyScenario(), name, clock, profiles });
    report('done', 'Карта очищена. Вернуть всё можно отменой.');
  }
</script>

<label class="field">
  <span>Название</span>
  <input
    type="text"
    value={scenario.name}
    placeholder="Без названия"
    oninput={(event) => renameScenario(event.currentTarget.value)}
  />
</label>

<p class="summary">
  На карте {contents(scenario)}. Изменения сохраняются в этом браузере сами.
</p>

<div class="actions">
  <button type="button" class="action primary" onclick={save}>Сохранить в файл</button>
  <button type="button" class="action" onclick={() => picker.click()}>Открыть файл</button>
  <button type="button" class="action" disabled={objects === 0} onclick={clear}>
    Очистить карту
  </button>
</div>

<input
  bind:this={picker}
  class="visually-hidden"
  type="file"
  accept=".json,application/json"
  tabindex="-1"
  aria-hidden="true"
  onchange={open}
/>

{#if shown}
  <p class="message {shown.kind}" role="status">{shown.text}</p>
{/if}

<fieldset class="clock">
  <legend>Часы</legend>

  <label class="field">
    <span>Начало сценария</span>
    <input
      type="datetime-local"
      value={scenario.clock.start ?? ''}
      onchange={(event) => setStart(event.currentTarget.value)}
    />
  </label>

  <div class="pair">
    <label class="field">
      <span>Длина хода, мин</span>
      <input
        type="number"
        min={TURN_MIN}
        max={TURN_MAX}
        step="1"
        value={scenario.clock.turnMinutes}
        oninput={setLength}
      />
    </label>
    <label class="field">
      <span>Текущий ход</span>
      <input
        type="number"
        min="0"
        max={LAST_TURN}
        step="1"
        value={scenario.clock.turn}
        oninput={setTurn}
      />
    </label>
  </div>

  <p class="now">
    Сейчас {formatMoment(scenario.clock, scenario.clock.turn)}{#if !scenario.clock.start}
      {' '}от начала{/if}.
  </p>

  <label class="row">
    <input
      type="checkbox"
      checked={scenario.clock.follow}
      onchange={(event) => setFollow(event.currentTarget.checked)}
    />
    <span>Двигать фишки по маршрутам вместе с ходом</span>
  </label>

  <p class="note">
    Без начала сценария часы показывают время от нулевого хода. Время — местное для района
    действий, без часовых поясов и летнего времени.
  </p>
</fieldset>

<style>
  .summary {
    margin: 12px 0;
    color: var(--ink-soft);
  }

  .actions {
    display: grid;
    gap: 8px;
  }

  .message {
    margin: 14px 0 0;
  }

  .message.failed {
    color: var(--accent);
  }

  .clock {
    margin-top: 18px;
    border-top: 1px solid var(--edge);
  }

  .clock legend {
    padding-top: 14px;
  }

  input[type='datetime-local'] {
    width: 100%;
    min-width: 0;
    height: 36px;
    padding: 0 9px;
    background: var(--surface-deep);
    border: 1px solid var(--edge);
    border-radius: var(--radius);
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .now {
    margin: 10px 0 4px;
    font-variant-numeric: tabular-nums;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
    cursor: pointer;
  }

  .note {
    margin: 8px 0 0;
    font-size: var(--text-small);
    color: var(--ink-soft);
  }
</style>
