<script lang="ts">
  import type { Map as MlMap } from 'maplibre-gl';
  import { formatMoment } from './core/clock';
  import type { Unit } from './core/units';
  import type { LngLat } from './core/geodesy';
  import { outline, type Graphic } from './core/graphics';
  import { hotkeyFor, type HotkeyAction } from './core/hotkeys';
  import type { Route } from './core/route';
  import { snapshotName, snapshotTitle } from './core/snapshot';
  import { showPoint, showPoints, visibleCenter } from './map/camera';
  import type { Insets } from './map/insets';
  import MapView from './map/MapView.svelte';
  import { snapshot } from './map/snapshot';
  import { BASE_LABELS } from './map/sources';
  import { activeCredits } from './map/style';
  import { showUnit } from './map/units';
  import { armDraft, armRoute, armRuler, armSightLine, armSightZone } from './model/arming';
  import { advanceAll, stepClock } from './model/clock.svelte';
  import { draft, finishDraft, removeLastDraftPoint } from './model/draft.svelte';
  import { notify } from './model/notice.svelte';
  import { pin } from './model/pin.svelte';
  import { probe } from './model/probe.svelte';
  import { profiledRoute } from './model/reports.svelte';
  import { finishRoute, removeLastRoutePoint, routeDraft } from './model/routeDraft.svelte';
  import { finishRuler, removeLastRulerPoint, ruler } from './model/ruler.svelte';
  import {
    copyUnit,
    findGraphic,
    findRoute,
    findUnit,
    redo,
    removeGraphic,
    removeRoute,
    removeUnit,
    scenario,
    select,
    selectRoute,
    selection,
    undo,
  } from './model/scenario.svelte';
  import { cancelPicking, sight, watchFrom, type SightTask } from './model/sight.svelte';
  import { tools } from './model/tools.svelte';
  import { view, type BaseLayerId } from './model/view.svelte';
  import ClockBar from './ui/ClockBar.svelte';
  import CoordsPanel from './ui/CoordsPanel.svelte';
  import GraphicInspector from './ui/GraphicInspector.svelte';
  import GraphicsPanel from './ui/GraphicsPanel.svelte';
  import HotkeysDialog from './ui/HotkeysDialog.svelte';
  import Inspector from './ui/Inspector.svelte';
  import LayersPanel from './ui/LayersPanel.svelte';
  import MapControls from './ui/MapControls.svelte';
  import Notice from './ui/Notice.svelte';
  import PalettePanel from './ui/PalettePanel.svelte';
  import ProfileDrawer from './ui/ProfileDrawer.svelte';
  import Rail, { type PanelId } from './ui/Rail.svelte';
  import RosterPanel from './ui/RosterPanel.svelte';
  import RouteInspector from './ui/RouteInspector.svelte';
  import RoutesPanel from './ui/RoutesPanel.svelte';
  import RulerPanel from './ui/RulerPanel.svelte';
  import ScenarioPanel from './ui/ScenarioPanel.svelte';
  import SidePanel from './ui/SidePanel.svelte';
  import SightDrawer from './ui/SightDrawer.svelte';
  import SightPanel from './ui/SightPanel.svelte';
  import StatusBar from './ui/StatusBar.svelte';
  import ToolHint from './ui/ToolHint.svelte';
  import { download } from './ui/download';

  /** Копия встаёт рядом с оригиналом, на столько пикселей правее и ниже. */
  const COPY_SHIFT_PX = 36;

  const PANEL_TITLES: Record<PanelId, string> = {
    layers: 'Слои',
    palette: 'Фишки',
    graphics: 'Графика',
    routes: 'Маршруты',
    roster: 'Состав',
    ruler: 'Линейка',
    sight: 'Видимость',
    coords: 'Координаты',
    scenario: 'Сценарий',
  };

  const narrow = window.matchMedia('(max-width: 640px)');

  let map = $state.raw<MlMap | null>(null);
  let failing = $state(false);
  let panel = $state<PanelId | null>(narrow.matches ? null : 'palette');
  let compact = $state(narrow.matches);
  /** Высота панели профиля под картой; 0 — панели нет. */
  let drawer = $state(0);
  /** Открыт список клавиш. */
  let help = $state(false);

  narrow.addEventListener('change', () => (compact = narrow.matches));

  const selected = $derived(findUnit(selection.unitId));
  const selectedGraphic = $derived(findGraphic(selection.graphicId));
  const selectedRoute = $derived(findRoute(selection.routeId));
  const inspecting = $derived(Boolean(selected || selectedGraphic || selectedRoute));

  /** Маршрут, профиль которого показан под картой. На узком экране профиль живёт в редакторе. */
  const profiled = $derived(compact ? null : profiledRoute());

  /** Профиль линии видимости показан под картой, когда там нет профиля маршрута. */
  const sighted = $derived(!compact && !profiled && sight.from !== null && sight.to !== null);

  /** Ширина боковой панели из стилей; на узком экране панели карту по бокам не закрывают. */
  function panelWidth(): number {
    if (narrow.matches) return 0;
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-width'));
  }

  /** Какая часть карты сейчас закрыта панелями. */
  const insets = $derived<Insets>({
    left: panel ? panelWidth() : 0,
    right: inspecting ? panelWidth() : 0,
    bottom: profiled || sighted ? drawer : 0,
  });

  /** Точки, по которым знак виден на карте целиком. */
  function extent(graphic: Graphic): LngLat[] {
    return outline(graphic)?.path ?? graphic.points;
  }

  function showGraphic(graphic: Graphic) {
    revealMap();
    // Редактор знака откроется справа, даже если сейчас его ещё нет.
    if (map) showPoints(map, extent(graphic), { left: insets.left, right: panelWidth() });
  }

  /** Панель профиля откроется под картой вместе с редактором маршрута. */
  const PROFILE_HEIGHT_PX = 210;

  function showRoute(route: Route) {
    selectRoute(route.id);
    revealMap();
    if (!map) return;
    showPoints(map, $state.snapshot(route.points) as LngLat[], {
      left: insets.left,
      right: panelWidth(),
      bottom: compact ? 0 : Math.max(drawer, PROFILE_HEIGHT_PX),
    });
  }

  function planRoute(unit: Unit) {
    armRoute(unit);
    revealMap();
  }

  /** Зона обзора фишки или линия видимости от неё: цель укажут щелчком по карте. */
  function lookFrom(unit: Unit, task: SightTask) {
    if (task === 'zone') {
      watchFrom(unit);
      select(null);
    } else {
      armSightLine(unit);
    }
    panel = narrow.matches ? null : 'sight';
  }

  function showEverything() {
    if (!map) return;
    const points = [
      ...scenario.units.map((unit) => unit.position),
      ...scenario.graphics.flatMap(extent),
      ...scenario.routes.flatMap((route) => route.points),
    ];
    if (points.length === 0) notify('На карте пока ничего не расставлено.');
    showPoints(map, $state.snapshot(points) as LngLat[], insets);
  }

  async function saveView() {
    if (!map) return;
    const { name, clock } = scenario;
    try {
      const blob = await snapshot(map, insets, {
        title: snapshotTitle(name, clock.turn, formatMoment(clock, clock.turn)),
        credits: activeCredits(view)
          .map(({ text }) => text)
          .join(' · '),
        pin: pin.position,
      });
      const file = snapshotName(name, clock.turn);
      download(blob, file);
      notify(`Вид карты сохранён в файл «${file}».`);
    } catch (error) {
      console.warn(error);
      notify('Не удалось сохранить вид карты.', 'failed');
    }
  }

  /** Инструмент взят с клавиатуры: его панель открывается, если не закроет собой карту. */
  function take(tool: PanelId) {
    panel = narrow.matches ? null : tool;
  }

  function toggled(label: string, on: boolean) {
    notify(`${label}: ${on ? 'включено' : 'выключено'}.`);
  }

  function nextBase() {
    const bases = Object.keys(BASE_LABELS) as BaseLayerId[];
    view.base = bases[(bases.indexOf(view.base) + 1) % bases.length];
    notify(`Подложка: ${BASE_LABELS[view.base]}.`);
  }

  function act(action: HotkeyAction) {
    switch (action.do) {
      case 'panel':
        panel = panel === action.panel ? null : action.panel;
        break;
      case 'draw':
        armDraft(action.kind);
        take('graphics');
        break;
      case 'ruler':
        armRuler();
        take('ruler');
        break;
      case 'route':
        armRoute(selected);
        take('routes');
        break;
      case 'sightLine':
        if (selected) lookFrom(selected, 'line');
        else {
          armSightLine();
          take('sight');
        }
        break;
      case 'sightZone':
        if (selected) lookFrom(selected, 'zone');
        else {
          armSightZone();
          take('sight');
        }
        break;
      case 'terrain':
        view.terrain3d = !view.terrain3d;
        break;
      case 'north':
        map?.easeTo({ bearing: 0, duration: 400 });
        break;
      case 'fit':
        showEverything();
        break;
      case 'zoom':
        if (action.by > 0) map?.zoomIn();
        else map?.zoomOut();
        break;
      case 'base':
        nextBase();
        break;
      case 'satellite':
        if (view.base === 'satellite') notify('Спутник уже выбран подложкой.');
        else toggled('Спутник поверх подложки', (view.satellite.on = !view.satellite.on));
        break;
      case 'hillshade':
        toggled('Отмывка рельефа', (view.hillshade.on = !view.hillshade.on));
        break;
      case 'contours':
        toggled('Горизонтали', (view.contours.on = !view.contours.on));
        break;
      case 'grid':
        toggled('Сетка MGRS', (view.grid.on = !view.grid.on));
        break;
      case 'snapshot':
        void saveView();
        break;
      case 'turn':
        stepClock(action.by);
        break;
      case 'advance':
        advanceAll();
        break;
      case 'help':
        help = true;
        break;
    }
  }

  /** На узком экране панель закрывает карту целиком, поэтому уступает ей место. */
  function revealMap() {
    if (narrow.matches) panel = null;
  }

  function showPosition(position: LngLat) {
    revealMap();
    if (map) showPoint(map, position, insets);
  }

  function beside(unit: Unit): [number, number] {
    if (!map) return [unit.position[0], unit.position[1]];
    const point = map.project(unit.position);
    const shifted = map.unproject([point.x + COPY_SHIFT_PX, point.y + COPY_SHIFT_PX]);
    return [shifted.lng, shifted.lat];
  }

  function duplicate(unit: Unit) {
    select(copyUnit(unit, beside(unit)).id);
  }

  function paste() {
    const source = tools.clipboard;
    if (!source) return;
    const position: [number, number] =
      probe.source === 'cursor' ? [probe.lng, probe.lat] : beside(source);
    select(copyUnit(source, position).id);
  }

  function isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target instanceof HTMLInputElement) {
      return !['checkbox', 'radio', 'range', 'button', 'file'].includes(target.type);
    }
    return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  }

  /** Пользователь выделил текст на странице и, скорее всего, копирует его, а не фишку. */
  function hasSelectedText(): boolean {
    return !window.getSelection()?.isCollapsed;
  }

  function onkeydown(event: KeyboardEvent) {
    // Список клавиш — окно поверх всего: пока оно открыто, клавиши принадлежат ему.
    if (help) {
      // Окно закрывается и само, но мигом позже: следующая клавиша не должна пропасть.
      if (event.code === 'Escape') help = false;
      return;
    }
    const typing = isTyping(event.target);

    if (event.code === 'Escape') {
      if (typing) (event.target as HTMLElement).blur();
      else if (tools.placing) tools.placing = null;
      else if (ruler.drawing) finishRuler();
      else if (draft.kind) finishDraft();
      else if (routeDraft.active) finishRoute();
      else if (sight.picking) cancelPicking();
      else select(null);
      return;
    }
    if (typing) return;

    // event.code не зависит от раскладки: сочетания работают и в русской.
    const command = event.ctrlKey || event.metaKey;
    const erase = event.code === 'Delete' || event.code === 'Backspace';
    const enter = event.code === 'Enter' || event.code === 'NumpadEnter';
    // Пока что-то рисуется, отмена убирает последнюю поставленную точку.
    const back = erase || (command && event.code === 'KeyZ' && !event.shiftKey);
    let handled = true;
    if (ruler.drawing && enter) finishRuler();
    else if (ruler.drawing && back) removeLastRulerPoint();
    else if (draft.kind && enter) finishDraft();
    else if (draft.kind && back) removeLastDraftPoint();
    else if (routeDraft.active && enter) finishRoute();
    else if (routeDraft.active && back) removeLastRoutePoint();
    else if (command && event.code === 'KeyZ') event.shiftKey ? redo() : undo();
    else if (command && event.code === 'KeyY') redo();
    else if (command && event.code === 'KeyC' && selected && !hasSelectedText())
      tools.clipboard = $state.snapshot(selected);
    else if (command && event.code === 'KeyV' && tools.clipboard) paste();
    else if (command && event.code === 'KeyD' && selected) duplicate(selected);
    else if (erase && selected) removeUnit(selected.id);
    else if (erase && selectedGraphic) removeGraphic(selectedGraphic.id);
    else if (erase && selectedRoute) removeRoute(selectedRoute.id);
    else handled = false;

    if (!handled) {
      const action = hotkeyFor(event);
      // Клавиша, которую держат, повторяет только то, что имеет смысл повторять.
      const repeats = action?.do === 'zoom' || action?.do === 'turn';
      // Карта в фокусе меняет масштаб по этим клавишам сама.
      const mapsOwn = action?.do === 'zoom' && event.target === map?.getCanvas();
      if (action && !mapsOwn && (!event.repeat || repeats)) {
        act(action);
        handled = true;
      }
    }

    if (handled) event.preventDefault();
  }
</script>

<svelte:window {onkeydown} />

<div class="app">
  <Rail bind:active={panel} onhelp={() => (help = true)} />

  <main
    class="stage"
    class:inspecting
    class:docked={panel}
    style:--bottom-inset="{profiled || sighted ? drawer : 0}px"
  >
    <MapView
      {insets}
      onready={(created) => (map = created)}
      onfailure={(value) => (failing = value)}
    />
    <ToolHint />
    <Notice />
    <ClockBar onsettings={() => (panel = 'scenario')} />
    <MapControls {map} onsnapshot={saveView} />

    {#if panel}
      <SidePanel title={PANEL_TITLES[panel]} onclose={() => (panel = null)}>
        {#if panel === 'layers'}
          <LayersPanel />
        {:else if panel === 'palette'}
          <PalettePanel onarm={revealMap} />
        {:else if panel === 'graphics'}
          <GraphicsPanel onarm={revealMap} onshow={showGraphic} />
        {:else if panel === 'routes'}
          <RoutesPanel onarm={revealMap} onshow={showRoute} />
        {:else if panel === 'roster'}
          <RosterPanel
            onshow={(unit) =>
              map && showUnit(map, unit, { left: panelWidth(), right: panelWidth() })}
          />
        {:else if panel === 'ruler'}
          <RulerPanel onarm={revealMap} />
        {:else if panel === 'sight'}
          <SightPanel {compact} onarm={revealMap} />
        {:else if panel === 'coords'}
          <CoordsPanel onshow={showPosition} center={() => map && visibleCenter(map, insets)} />
        {:else}
          <ScenarioPanel onopen={showEverything} />
        {/if}
      </SidePanel>
    {/if}

    {#if profiled}
      <ProfileDrawer route={profiled} bind:height={drawer} />
    {:else if sighted}
      <SightDrawer bind:height={drawer} />
    {/if}

    {#if selected}
      <Inspector
        unit={selected}
        onduplicate={duplicate}
        onroute={planRoute}
        onshowroute={showRoute}
        onsight={lookFrom}
      />
    {:else if selectedGraphic}
      <GraphicInspector graphic={selectedGraphic} />
    {:else if selectedRoute}
      <RouteInspector route={selectedRoute} {compact} onarm={revealMap} />
    {/if}
  </main>

  <StatusBar {failing} />
</div>

<HotkeysDialog bind:open={help} />

<style>
  .app {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    height: 100dvh;
  }

  .stage {
    position: relative;
    min-height: 0;
    overflow: hidden;
    /* Сколько карты закрыто панелями слева и справа. */
    --left-inset: 0px;
    --controls-inset: 0px;
    --bottom-inset: 0px;
  }

  .stage.docked {
    --left-inset: var(--panel-width);
  }

  .stage.inspecting {
    --controls-inset: var(--panel-width);
  }

  .app > :global(footer) {
    grid-column: 1 / -1;
  }

  @media (max-width: 640px) {
    .stage.docked,
    .stage.inspecting {
      --left-inset: 0px;
      --controls-inset: 0px;
    }
  }
</style>
