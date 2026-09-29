<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Map as MlMap,
    Marker,
    addProtocol,
    setWorkerUrl,
    type MapMouseEvent,
    type MapTouchEvent,
    type Point,
  } from 'maplibre-gl';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import mlcontour from 'maplibre-contour';

  import { geodesicPath, type LngLat } from '../core/geodesy';
  import type { Graphic } from '../core/graphics';
  import { reachRings, weaponRings } from '../core/rings';
  import { sightPointAt } from '../core/los';
  import { routePointAt, type Route } from '../core/route';
  import { unitTitle } from '../core/units';
  import { draft, draftSketch } from '../model/draft.svelte';
  import { pin } from '../model/pin.svelte';
  import { probe } from '../model/probe.svelte';
  import { profiledRoute, routeReport } from '../model/reports.svelte';
  import { draftRoute, routeDraft } from '../model/routeDraft.svelte';
  import { routeFocus } from '../model/routeFocus.svelte';
  import { ruler, rulerMeasurement } from '../model/ruler.svelte';
  import { findRoute, findUnit, profileOf, scenario, selection } from '../model/scenario.svelte';
  import { settings } from '../model/settings.svelte';
  import { lineState, sight, sightFocus, sightReport, sightZone } from '../model/sight.svelte';
  import { tools } from '../model/tools.svelte';
  import { view } from '../model/view.svelte';
  import { dem } from './dem';
  import { GraphicLayer } from './graphics';
  import { GridLayer } from './grid';
  import type { Insets } from './insets';
  import type { Interactive } from './interactive';
  import { onSurface } from './pointer';
  import { RingLayer, type RingSet } from './rings';
  import { RouteLayer, legPaths, type RouteView } from './routes';
  import { RulerLayer } from './ruler';
  import { SightLayer } from './sight';
  import { DEM_MAXZOOM, DEM_TILES } from './sources';
  import {
    MAX_PITCH_3D,
    PITCH_3D,
    applyBase,
    applyContours,
    applyHillshade,
    applySatellite,
    buildStyle,
    darkBackdrop,
  } from './style';
  import { MAP_SYMBOL_SIZE, symbolSvg } from './symbols';
  import { UnitLayer } from './units';

  interface Props {
    /** Какая часть карты закрыта панелями. */
    insets: Insets;
    onready: (map: MlMap) => void;
    /** Сообщает, что тайлы перестали или снова начали загружаться. */
    onfailure: (failing: boolean) => void;
  }

  let { insets, onready, onfailure }: Props = $props();

  const PIN_ICON = `<svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
    <g class="casing"><circle cx="18" cy="18" r="9" /><path d="M18 2v10M18 24v10M2 18h10M24 18h10" /></g>
    <g class="ink"><circle cx="18" cy="18" r="9" /><path d="M18 2v10M18 24v10M2 18h10M24 18h10" /></g>
    <circle class="dot" cx="18" cy="18" r="1.75" />
  </svg>`;

  const TERRAIN = { source: 'dem-terrain', exaggeration: 1 };

  // Шаг горизонталей по зумам, м: [основные, утолщённые].
  const CONTOUR_THRESHOLDS = {
    9: [500, 1000],
    10: [200, 1000],
    11: [100, 500],
    12: [50, 250],
    13: [20, 100],
    15: [10, 50],
  };

  let container: HTMLDivElement;
  let map = $state.raw<MlMap | null>(null);
  let units = $state.raw<UnitLayer | null>(null);
  let grid = $state.raw<GridLayer | null>(null);
  let rulers = $state.raw<RulerLayer | null>(null);
  let graphics = $state.raw<GraphicLayer | null>(null);
  let routes = $state.raw<RouteLayer | null>(null);
  let rings = $state.raw<RingLayer | null>(null);
  let sights = $state.raw<SightLayer | null>(null);
  let marker: Marker | null = null;
  let pointer = $state.raw<{ x: number; y: number } | null>(null);
  let terrainApplied = false;
  let probeRequest = 0;

  function setProbe(source: 'cursor' | 'center', lng: number, lat: number) {
    probe.source = source;
    probe.lng = lng;
    probe.lat = lat;

    const request = ++probeRequest;
    dem.elevation(lng, lat).then(
      (elevation) => {
        if (request === probeRequest) probe.elevation = elevation;
      },
      () => {
        if (request === probeRequest) probe.elevation = null;
      },
    );
  }

  onMount(() => {
    setWorkerUrl(workerUrl);

    const contours = new mlcontour.DemSource({
      url: DEM_TILES,
      encoding: 'terrarium',
      maxzoom: DEM_MAXZOOM,
      worker: true,
    });
    contours.setupMaplibre({ addProtocol });
    const contourTiles = contours.contourProtocolUrl({
      thresholds: CONTOUR_THRESHOLDS,
      contourLayer: 'contours',
      elevationKey: 'ele',
      levelKey: 'level',
    });

    const created = new MlMap({
      container,
      style: buildStyle(view, contourTiles),
      center: view.center,
      zoom: view.zoom,
      bearing: view.bearing,
      pitch: view.terrain3d ? view.pitch : 0,
      maxPitch: view.terrain3d ? MAX_PITCH_3D : 0,
      minZoom: 2,
      maxZoom: 18,
      attributionControl: false,
    });
    if (import.meta.env.DEV) Object.assign(window, { map: created });

    created.on('load', () => {
      if (view.terrain3d) created.setTerrain(TERRAIN);
      terrainApplied = view.terrain3d;
      // Точка, поставленная по фишке, встаёт точно в её место.
      const snap = (point: Point): [number, number] | null => {
        const at = layer.unitAt(point)?.position;
        return at ? [at[0], at[1]] : null;
      };

      // Порядок создания — порядок отрисовки: сетка, зона обзора, графика, кольца, маршруты,
      // фишки, ручки, линия видимости, линейка.
      grid = new GridLayer(created);
      const sightLayer = new SightLayer(created, (point) => layer.unitAt(point));
      sightLayer.addShapes();
      const graphicLayer = new GraphicLayer(created, snap);
      graphicLayer.addShapes();
      rings = new RingLayer(created);
      const routeLayer = new RouteLayer(created, (point) => layer.unitAt(point));
      routeLayer.addShapes();
      const layer = new UnitLayer(created);
      graphicLayer.addHandles();
      routeLayer.addHandles();
      sightLayer.addHandles();
      const rulerLayer = new RulerLayer(created, snap);
      map = created;
      units = layer;
      rulers = rulerLayer;
      graphics = graphicLayer;
      routes = routeLayer;
      sights = sightLayer;
      listen(created, layer, rulerLayer, graphicLayer, routeLayer, sightLayer);
      onready(created);

      // Подписи рисуются шрифтом интерфейса; если он догрузился позже знаков, рисуем их заново.
      document.fonts
        .load("700 12px 'Sofia Sans Semi Condensed Variable'", 'Яя Zz 09')
        .then(() => layer.redraw(scenario.units, selection.unitId))
        .catch(() => {});
    });

    created.on('move', () => {
      const center = created.getCenter();
      view.center = [center.lng, center.lat];
      view.zoom = created.getZoom();
      view.bearing = created.getBearing();
      view.pitch = created.getPitch();
      if (probe.source === 'center') setProbe('center', center.lng, center.lat);
    });

    created.on('mousemove', (event: MapMouseEvent) => {
      // Над небом в 3D места под курсором нет: показывается центр карты.
      if (!onSurface(created, event)) {
        pointer = null;
        const center = created.getCenter();
        setProbe('center', center.lng, center.lat);
        return;
      }
      pointer = event.point;
      setProbe('cursor', event.lngLat.lng, event.lngLat.lat);
    });
    created.on('mouseout', () => {
      pointer = null;
      ruler.cursor = null;
      draft.cursor = null;
      routeDraft.cursor = null;
      sight.cursor = null;
      const center = created.getCenter();
      setProbe('center', center.lng, center.lat);
    });

    created.on('error', (event) => {
      console.warn(event.error);
      onfailure(true);
    });
    created.on('data', (event) => {
      if (event.dataType === 'source' && 'tile' in event && event.tile) onfailure(false);
    });

    setProbe('center', view.center[0], view.center[1]);

    return () => created.remove();
  });

  /**
   * Раздаёт нажатия и щелчки слоям, от верхнего к нижнему: линейка, видимость, рисование знака
   * и маршрута, ручки выделенного, фишки, маршруты, знаки. Слой, взявший событие себе,
   * возвращает true, и до остальных оно не доходит.
   */
  function listen(
    target: MlMap,
    unitLayer: UnitLayer,
    rulerLayer: RulerLayer,
    graphicLayer: GraphicLayer,
    routeLayer: RouteLayer,
    sightLayer: SightLayer,
  ) {
    const layers: Interactive[] = [
      rulerLayer,
      sightLayer,
      graphicLayer.pencil,
      routeLayer.pencil,
      graphicLayer.grips,
      routeLayer.grips,
      unitLayer,
      routeLayer.bodies,
      graphicLayer.bodies,
    ];
    // Метка — отдельный элемент поверх карты; её нажатия слоям не предназначены.
    // В 3D выше горизонта карты нет: щелчок по небу ничего не ставит и не выбирает.
    const onCanvas = (event: MapMouseEvent | MapTouchEvent) =>
      event.originalEvent.target === target.getCanvas() && onSurface(target, event);
    // Пока идёт измерение или рисование, нажатие только двигает карту: точки ставит щелчок.
    const drawing = () =>
      ruler.drawing || draft.kind !== null || routeDraft.active || sight.picking !== null;
    const armed = () => tools.placing !== null || drawing();

    target.on('mousedown', (event) => {
      if (event.originalEvent.button !== 0 || !onCanvas(event) || drawing()) return;
      layers.some((layer) => layer.press(event, 'mousemove', 'mouseup'));
    });
    target.on('touchstart', (event) => {
      if (event.points.length !== 1 || !onCanvas(event) || drawing()) return;
      layers.some((layer) => layer.press(event, 'touchmove', 'touchend'));
    });
    target.on('click', (event) => {
      if (onCanvas(event)) layers.some((layer) => layer.click(event));
    });
    target.on('mousemove', (event) => {
      if (!onSurface(target, event)) {
        ruler.cursor = null;
        draft.cursor = null;
        routeDraft.cursor = null;
        sight.cursor = null;
        target.getCanvas().style.cursor = armed() ? 'not-allowed' : '';
        return;
      }
      if (ruler.drawing) ruler.cursor = rulerLayer.locate(event);
      if (draft.kind) draft.cursor = graphicLayer.aim(event);
      if (routeDraft.active) routeDraft.cursor = routeLayer.locate(event);
      if (sight.picking) sight.cursor = sightLayer.locate(event);

      let cursor: string | null = tools.placing ? 'crosshair' : null;
      for (const layer of layers) cursor ??= layer.hover(event);
      target.getCanvas().style.cursor = cursor ?? '';
    });
  }

  $effect(() => {
    if (map) applyBase(map, view);
  });
  $effect(() => {
    if (map) applySatellite(map, view);
  });
  $effect(() => {
    if (map) applyHillshade(map, view);
  });
  $effect(() => {
    if (map) applyContours(map, view);
  });

  $effect(() => {
    grid?.apply(view.grid.on, darkBackdrop(view), insets);
  });

  $effect(() => {
    units?.sync(scenario.units, selection.unitId);
  });

  $effect(() => {
    graphics?.sync(
      $state.snapshot(scenario.graphics) as Graphic[],
      selection.graphicId,
      draftSketch(),
      $state.snapshot(draft.points) as [number, number][],
    );
  });

  /** Чем маршрут подписан на карте: своё имя или фишка, которая по нему идёт. */
  function caption(route: Route): string {
    const unit = findUnit(route.unitId);
    return route.name.trim() || (unit ? unitTitle(unit) : '');
  }

  $effect(() => {
    const sketch = draftRoute();
    // Маршрут, который продолжают, рисуется наброском, а не дважды.
    const shown = scenario.routes.filter((route) => route.id !== routeDraft.routeId);
    const views = (sketch ? [...shown, sketch] : shown).map(
      (route): RouteView => ({
        route: $state.snapshot(route) as Route,
        report: routeReport(route.id),
        caption: caption(route),
        turn: scenario.clock.turn,
      }),
    );
    routes?.sync(views, selection.routeId, sketch ? sketch.points : null);
  });

  $effect(() => {
    const sets = scenario.units.flatMap((unit): RingSet[] => {
      const shown = [
        ...(view.rings.weapons || unit.showRanges ? weaponRings($state.snapshot(unit.ranges)) : []),
        ...(view.rings.reach || unit.showReach
          ? reachRings(profileOf(unit.movement), scenario.clock.turnMinutes)
          : []),
      ];
      if (shown.length === 0) return [];
      return [{ center: [unit.position[0], unit.position[1]], color: unit.affiliation, rings: shown }];
    });
    rings?.sync(sets);
  });

  $effect(() => {
    const last = routeDraft.points.at(-1);
    const { cursor } = routeDraft;
    const band = routeDraft.active && last && cursor ? geodesicPath([last[0], last[1]], [cursor[0], cursor[1]]) : null;

    const selected = findRoute(selection.routeId);
    const focus =
      selected && routeFocus.leg !== null
        ? (legPaths($state.snapshot(selected.points) as LngLat[])[routeFocus.leg] ?? null)
        : null;

    const profiled = profiledRoute();
    const report = profiled && routeReport(profiled.id);
    const at = report && routeFocus.distance !== null ? routePointAt(report, routeFocus.distance) : null;

    routes?.mark({ band, color: routeDraft.color, focus, probe: at?.position ?? null });
  });

  $effect(() => {
    const { from, to, center } = sight;
    const report = lineState() === 'ready' ? sightReport() : null;
    const shown = sightReport();
    const at =
      shown && sightFocus.distance !== null ? sightPointAt(shown, sightFocus.distance) : null;
    sights?.sync({
      line: from && {
        from: [from.position[0], from.position[1]],
        to: to && [to.position[0], to.position[1]],
        cursor: sight.cursor && [sight.cursor[0], sight.cursor[1]],
        report,
        free: { from: from.unitId === null, to: to?.unitId === null },
      },
      zone: center && {
        center: [center.position[0], center.position[1]],
        radius: sight.radius,
        free: center.unitId === null,
      },
      probe: at?.position ?? null,
    });
  });

  $effect(() => {
    sights?.paint(sightZone(), sight.opacity);
  });

  $effect(() => {
    rulers?.sync(
      $state.snapshot(ruler.points) as [number, number][],
      rulerMeasurement(),
      ruler.mode === 'area',
      settings.angles,
    );
  });

  $effect(() => {
    const position = pin.position;
    if (!map) return;
    if (!position) {
      marker?.remove();
      marker = null;
      return;
    }
    if (marker) {
      marker.setLngLat(position);
      return;
    }

    const element = document.createElement('div');
    element.className = 'pin';
    element.innerHTML = PIN_ICON;
    const created = new Marker({ element, draggable: true }).setLngLat(position).addTo(map);
    created.on('drag', () => {
      const at = created.getLngLat();
      pin.position = [at.lng, at.lat];
    });
    marker = created;
  });

  const ghost = $derived(tools.placing ? symbolSvg({ ...tools.placing, status: 'present' }, MAP_SYMBOL_SIZE) : null);

  $effect(() => {
    if (!map) return;
    const armed =
      tools.placing !== null ||
      ruler.drawing ||
      draft.kind !== null ||
      routeDraft.active ||
      sight.picking !== null;
    map.getCanvas().style.cursor = armed ? 'crosshair' : '';
    // Shift+щелчок ставит несколько фишек подряд; масштабирование рамкой его бы перехватило.
    if (armed) map.boxZoom.disable();
    else map.boxZoom.enable();
  });

  $effect(() => {
    const target = map;
    const on = view.terrain3d;
    if (!target || on === terrainApplied) return;
    terrainApplied = on;

    if (on) {
      target.setMaxPitch(MAX_PITCH_3D);
      target.setTerrain(TERRAIN);
      target.easeTo({ pitch: PITCH_3D, duration: 800 });
    } else {
      target.setTerrain(null);
      target.easeTo({ pitch: 0, duration: 600 });
      target.once('moveend', () => {
        if (!view.terrain3d) target.setMaxPitch(0);
      });
    }
  });
</script>

<div class="map" bind:this={container}></div>

{#if ghost && pointer}
  <div
    class="ghost"
    style:left="{pointer.x - ghost.anchor.x}px"
    style:top="{pointer.y - ghost.anchor.y}px"
    aria-hidden="true"
  >
    {@html ghost.svg}
  </div>
{/if}

<style>
  .map {
    position: absolute;
    inset: 0;
    background: var(--surface-deep);
  }

  .ghost {
    position: absolute;
    opacity: 0.6;
    pointer-events: none;
  }

  .ghost :global(svg) {
    display: block;
  }

  .map :global(.pin) {
    cursor: grab;
  }

  .map :global(.pin svg) {
    display: block;
    fill: none;
    stroke-linecap: round;
  }

  .map :global(.pin .casing) {
    stroke: rgba(30, 30, 34, 0.75);
    stroke-width: 5;
  }

  .map :global(.pin .ink) {
    stroke: var(--accent);
    stroke-width: 2.25;
  }

  .map :global(.pin .dot) {
    fill: var(--accent);
    stroke: rgba(30, 30, 34, 0.75);
    stroke-width: 1;
  }

  /* Карта получает фокус при каждом сочетании клавиш, поэтому её рамка спокойнее остальных. */
  .map :global(.maplibregl-canvas:focus-visible) {
    outline: 1px solid var(--ink-soft);
    outline-offset: -1px;
  }
</style>
