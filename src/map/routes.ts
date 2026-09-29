/**
 * Слой маршрутов: линии по участкам, непроходимые отрезки, отметки ходов и итоги;
 * прокладка, выбор, перенос и правка формы.
 */

import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map as MlMap,
  MapMouseEvent,
  Point,
} from 'maplibre-gl';
import type { Feature } from 'geojson';
import { geodesicPath, type LngLat } from '../core/geodesy';
import { graphicInk, type GraphicInk } from '../core/graphics';
import { formatLength } from '../core/measure';
import { heading, translate } from '../core/mercator';
import type { Surface } from '../core/movement';
import {
  enRoute,
  formatDuration,
  insertRoutePoint,
  removeRoutePoint,
  routePointAt,
  type Route,
  type RouteReport,
} from '../core/route';
import type { Unit } from '../core/units';
import { addRoutePoint, finishRoute, routeDraft } from '../model/routeDraft.svelte';
import {
  findRoute,
  reshapeRoute,
  scenario,
  selectRoute,
  selection,
  updateRoute,
} from '../model/scenario.svelte';
import { arrowHead, hazardSign, labelPlate } from './images';
import type { Interactive, PointerEvent } from './interactive';
import { drag, hitsPath } from './pointer';

const SOURCE = 'routes';
/** То, что меняется с каждым движением курсора, лежит отдельно от самих маршрутов. */
const MARKS = 'route-marks';
const HANDLES = 'route-handles';

const ACCENT = '#ff5e2c';
const PAPER = '#edebe8';
const HAZARD = '#ffd21f';
const HAZARD_INK = '#1e1e22';

const WIDTH_PX = 3.5;
const CASING_EXTRA_PX = 2.5;
const SELECTED_EXTRA_PX = 7;
const BLOCKED_WIDTH_PX = 6;

/** Рисунок линии по покрытию: дорога — сплошная, грунтовка — штрихи, бездорожье — точки. */
const DASHES: Record<Exclude<Surface, 'road'>, number[]> = {
  track: [4, 2],
  offroad: [1, 1.5],
};

/** На таком расстоянии от линии маршрута щелчок попадает в него. */
const LINE_REACH_PX = 6;
const HANDLE_REACH_PX = 10;

/** Щелчок по последней точке заканчивает прокладку. Сюда же попадает второй щелчок двойного. */
const FINISH_REACH_PX = 6;

/** Столько после конца прокладки двойной щелчок ещё не приближает карту, мс. */
const DOUBLE_CLICK_MS = 500;

export interface RouteView {
  route: Route;
  /** null, пока высоты вдоль маршрута не сняты. */
  report: RouteReport | null;
  /** Чем маршрут подписан на карте: своё имя или фишка, которая по нему идёт. */
  caption: string;
  /** Текущий ход по часам сценария. */
  turn: number;
}

export interface RouteMarks {
  /** Линия от последней точки прокладываемого маршрута к курсору. */
  band: LngLat[] | null;
  color: Route['color'];
  /** Участок, на который указывают в редакторе. */
  focus: LngLat[] | null;
  /** Точка маршрута, на которую указывают на графике профиля. */
  probe: LngLat | null;
}

interface Handle {
  role: 'vertex' | 'middle';
  /** Номер вершины; у середины участка — номер вершины перед ней. */
  index: number;
  position: LngLat;
}

function part(name: string): FilterSpecification {
  return ['==', ['get', 'part'], name];
}

/** Часть маршрута с данным идентификатором; пустой идентификатор не подходит ни одному. */
function partOf(name: string, id: string | null): FilterSpecification {
  return ['all', ['==', ['get', 'part'], name], ['==', ['get', 'id'], id ?? '']];
}

function paved(surface: Surface): FilterSpecification {
  return ['all', ['==', ['get', 'part'], 'leg'], ['==', ['get', 'surface'], surface]];
}

function point(position: LngLat, properties: Record<string, unknown>): Feature {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: position }, properties };
}

function line(path: LngLat[], properties: Record<string, unknown>): Feature {
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: path }, properties };
}

/** Линии участков маршрута: у длинных участков — с промежуточными точками. */
export function legPaths(points: LngLat[]): LngLat[][] {
  return points.slice(1).map((to, index) => geodesicPath(points[index], to));
}

function handlesOf(route: Route): Handle[] {
  const handles: Handle[] = route.points.map((position, index) => ({
    role: 'vertex',
    index,
    position,
  }));
  for (let index = 0; index < route.points.length - 1; index++) {
    const [a, b] = [route.points[index], route.points[index + 1]];
    handles.push({ role: 'middle', index, position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
  }
  return handles;
}

/** Стороны, с которых подпись встаёт у конца маршрута: по ходу движения, за его последней точкой. */
const LABEL_SIDES = [
  'bottom',
  'bottom-left',
  'left',
  'top-left',
  'top',
  'top-right',
  'right',
  'bottom-right',
] as const;

/**
 * Сдвиг подписи от конца маршрута в размерах шрифта, по сторонам: наконечник стрелки
 * остаётся виден.
 */
const LABEL_OFFSET: ExpressionSpecification = [
  'match',
  ['get', 'side'],
  'bottom',
  ['literal', [0, -1.3]],
  'bottom-left',
  ['literal', [0.9, -0.9]],
  'left',
  ['literal', [1.3, 0]],
  'top-left',
  ['literal', [0.9, 0.9]],
  'top',
  ['literal', [0, 1.3]],
  'top-right',
  ['literal', [-0.9, 0.9]],
  'right',
  ['literal', [-1.3, 0]],
  ['literal', [-0.9, -0.9]],
];

/** Каким краем подпись примыкает к концу маршрута, если последний отрезок идёт по направлению `course`. */
function labelSide(course: number): (typeof LABEL_SIDES)[number] {
  return LABEL_SIDES[Math.round((((course % 360) + 360) % 360) / 45) % 8];
}

function summary({ caption, report }: RouteView): string {
  const parts = [caption];
  if (report) parts.push(formatLength(report.length), formatDuration(report.time));
  return parts.filter(Boolean).join(' · ');
}

export class RouteLayer {
  private finishedAt = -Infinity;

  /** Прокладка маршрута. */
  readonly pencil: Interactive;
  /** Ручки выделенного маршрута. */
  readonly grips: Interactive;
  /** Сами маршруты. */
  readonly bodies: Interactive;

  /**
   * @param unitAt Фишка под точкой экрана: точка маршрута, поставленная на фишку, встаёт в её место.
   */
  constructor(
    private map: MlMap,
    private unitAt: (point: Point) => Unit | undefined,
  ) {
    this.pencil = {
      press: () => false,
      click: (event) => this.draw(event),
      hover: () => (routeDraft.active ? 'crosshair' : null),
    };
    this.grips = {
      press: (event, moveEvent, endEvent) => this.grab(event, moveEvent, endEvent),
      click: (event) => this.handleAt(event.point) !== undefined,
      hover: (event) => (this.handleAt(event.point) ? 'grab' : null),
    };
    this.bodies = {
      press: (event, moveEvent, endEvent) => this.carry(event, moveEvent, endEvent),
      click: (event) => this.pick(event),
      hover: (event) => {
        const route = this.routeAt(event.point);
        if (!route) return null;
        return route.id === selection.routeId ? 'move' : 'pointer';
      },
    };

    map.on('dblclick', (event) => this.doubleClick(event));
  }

  /** Маршруты лежат под фишками. */
  addShapes(): void {
    const { map } = this;
    const empty = { type: 'FeatureCollection' as const, features: [] };
    map.addSource(SOURCE, { type: 'geojson', data: empty });
    map.addSource(MARKS, { type: 'geojson', data: empty });

    map.addLayer({
      id: 'routes-selected',
      type: 'line',
      source: SOURCE,
      filter: partOf('leg', null),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ACCENT,
        'line-width': WIDTH_PX + SELECTED_EXTRA_PX,
        'line-opacity': 0.85,
      },
    });
    map.addLayer({
      id: 'routes-casing',
      type: 'line',
      source: SOURCE,
      filter: part('leg'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'casing'], 'line-width': WIDTH_PX + CASING_EXTRA_PX },
    });
    map.addLayer({
      id: 'routes-road',
      type: 'line',
      source: SOURCE,
      filter: paved('road'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': WIDTH_PX },
    });
    for (const surface of ['track', 'offroad'] as const) {
      map.addLayer({
        id: `routes-${surface}`,
        type: 'line',
        source: SOURCE,
        filter: paved(surface),
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': WIDTH_PX,
          'line-dasharray': DASHES[surface],
        },
      });
    }
    // Непроходимый отрезок — полосатая лента поверх линии маршрута.
    map.addLayer({
      id: 'routes-blocked',
      type: 'line',
      source: SOURCE,
      filter: part('blocked'),
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: { 'line-color': HAZARD, 'line-width': BLOCKED_WIDTH_PX },
    });
    map.addLayer({
      id: 'routes-blocked-stripes',
      type: 'line',
      source: SOURCE,
      filter: part('blocked'),
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': HAZARD_INK,
        'line-width': BLOCKED_WIDTH_PX,
        'line-dasharray': [1, 1],
      },
    });
    map.addLayer({
      id: 'routes-band-casing',
      type: 'line',
      source: MARKS,
      filter: part('band'),
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': ['get', 'casing'], 'line-width': WIDTH_PX + CASING_EXTRA_PX },
    });
    map.addLayer({
      id: 'routes-band',
      type: 'line',
      source: MARKS,
      filter: part('band'),
      paint: { 'line-color': ['get', 'color'], 'line-width': WIDTH_PX, 'line-dasharray': [2, 2] },
    });
    map.addLayer({
      id: 'routes-focus',
      type: 'line',
      source: MARKS,
      filter: part('focus'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ACCENT, 'line-width': WIDTH_PX },
    });
    map.addLayer({
      id: 'routes-heads',
      type: 'symbol',
      source: SOURCE,
      filter: part('head'),
      layout: {
        'icon-image': ['get', 'image'],
        'icon-rotate': ['get', 'rotate'],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });
    map.addLayer({
      id: 'routes-starts',
      type: 'circle',
      source: SOURCE,
      filter: part('start'),
      paint: {
        'circle-radius': 5,
        'circle-color': ['get', 'color'],
        'circle-stroke-color': ['get', 'casing'],
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: 'routes-turns',
      type: 'circle',
      source: SOURCE,
      filter: part('turn'),
      paint: {
        'circle-radius': 4,
        'circle-color': PAPER,
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': 2.5,
      },
    });
    // Где фишке быть на текущем ходу.
    map.addLayer({
      id: 'routes-now',
      type: 'circle',
      source: SOURCE,
      filter: part('now'),
      paint: {
        'circle-radius': 6,
        'circle-color': PAPER,
        'circle-stroke-color': ACCENT,
        'circle-stroke-width': 3,
      },
    });
    map.addLayer({
      id: 'routes-turn-labels',
      type: 'symbol',
      source: SOURCE,
      filter: part('turn'),
      layout: {
        'text-field': ['get', 'text'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11,
        'text-anchor': 'bottom',
        'text-offset': [0, -1],
        'icon-image': labelPlate(map),
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [2, 5, 2, 5],
        // Частые отметки на мелком масштабе подписываются через одну: подписи не налезают друг на друга.
        'symbol-sort-key': ['get', 'order'],
      },
      paint: { 'text-color': PAPER },
    });
    // На мелком масштабе ленту не разглядеть: непроходимый отрезок отмечен ещё и знаком.
    map.addLayer({
      id: 'routes-hazards',
      type: 'symbol',
      source: SOURCE,
      filter: part('hazard'),
      layout: {
        'icon-image': hazardSign(map, HAZARD, HAZARD_INK),
        'icon-anchor': 'bottom',
        'icon-offset': [0, -5],
        'icon-ignore-placement': true,
      },
    });
    map.addLayer({
      id: 'routes-labels',
      type: 'symbol',
      source: SOURCE,
      filter: part('label'),
      layout: {
        'text-field': ['get', 'text'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        'text-max-width': 40,
        'text-anchor': ['get', 'side'],
        'text-offset': LABEL_OFFSET,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'icon-image': labelPlate(map),
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [3, 6, 3, 6],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'text-color': PAPER },
    });
    map.addLayer({
      id: 'routes-probe',
      type: 'circle',
      source: MARKS,
      filter: part('probe'),
      paint: {
        'circle-radius': 6,
        'circle-color': ACCENT,
        'circle-stroke-color': PAPER,
        'circle-stroke-width': 2,
      },
    });
  }

  /** Ручки лежат поверх фишек. */
  addHandles(): void {
    const { map } = this;
    map.addSource(HANDLES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'route-handles',
      type: 'circle',
      source: HANDLES,
      paint: {
        'circle-radius': ['match', ['get', 'role'], 'middle', 4, 5.5],
        'circle-color': ['match', ['get', 'role'], 'middle', ACCENT, PAPER],
        'circle-opacity': ['match', ['get', 'role'], 'middle', 0.75, 1],
        'circle-stroke-color': ['match', ['get', 'role'], 'middle', PAPER, ACCENT],
        'circle-stroke-width': ['match', ['get', 'role'], 'middle', 1, 2],
      },
    });
  }

  /**
   * Приводит слой в соответствие со сценарием.
   * @param sketched Поставленные точки прокладываемого маршрута; null — ничего не прокладывается.
   */
  sync(views: RouteView[], selectedId: string | null, sketched: LngLat[] | null): void {
    const { map } = this;
    const features = views.flatMap((view) => this.features(view));
    map.getSource<GeoJSONSource>(SOURCE)?.setData({ type: 'FeatureCollection', features });
    map.setFilter('routes-selected', partOf('leg', selectedId));

    const selected = views.find(({ route }) => route.id === selectedId)?.route;
    const handles: Feature[] = sketched
      ? sketched.map((position) => point(position, { role: 'vertex' }))
      : selected
        ? handlesOf(selected).map(({ role, position }) => point(position, { role }))
        : [];
    map.getSource<GeoJSONSource>(HANDLES)?.setData({ type: 'FeatureCollection', features: handles });
  }

  /** Обновляет то, что следует за курсором. */
  mark({ band, color, focus, probe }: RouteMarks): void {
    const ink = graphicInk(color);
    const features: Feature[] = [];
    if (band) features.push(line(band, { part: 'band', color: ink.line, casing: ink.casing }));
    if (focus) features.push(line(focus, { part: 'focus' }));
    if (probe) features.push(point(probe, { part: 'probe' }));
    this.map.getSource<GeoJSONSource>(MARKS)?.setData({ type: 'FeatureCollection', features });
  }

  private features(view: RouteView): Feature[] {
    const { route, report, turn } = view;
    if (route.points.length === 0) return [];
    const ink: GraphicInk = graphicInk(route.color);
    const shared = { id: route.id, color: ink.line, casing: ink.casing };
    const features: Feature[] = [];

    const paths = legPaths(route.points);
    paths.forEach((path, leg) => {
      features.push(line(path, { ...shared, part: 'leg', leg, surface: route.surfaces[leg] }));
    });
    features.push(point(route.points[0], { ...shared, part: 'start' }));

    const last = paths[paths.length - 1];
    if (last) {
      const end = last[last.length - 1];
      const course = heading(last[last.length - 2], end);
      features.push(
        point(end, {
          ...shared,
          part: 'head',
          image: arrowHead(this.map, ink, WIDTH_PX, CASING_EXTRA_PX),
          rotate: course,
        }),
      );
      const text = summary(view);
      if (text) {
        features.push(point(end, { ...shared, part: 'label', text, side: labelSide(course) }));
      }
    }

    if (report) {
      for (const stretch of report.blocked) {
        features.push(line(stretch.path, { ...shared, part: 'blocked' }));
        const middle = routePointAt(report, (stretch.from + stretch.to) / 2);
        if (middle) features.push(point(middle.position, { ...shared, part: 'hazard' }));
      }
      const now = enRoute(report, turn);
      if (now) features.push(point(now.position, { ...shared, part: 'now' }));
      for (const mark of report.turns) {
        features.push(
          point(mark.position, {
            ...shared,
            part: 'turn',
            text: String(mark.turn),
            // Когда подписи не помещаются, остаются отметки с круглыми номерами.
            order: mark.turn % 10 === 0 ? 0 : mark.turn % 5 === 0 ? 1 : 2,
          }),
        );
      }
    }
    return features;
  }

  private hits(route: Route, at: Point): boolean {
    const reach = LINE_REACH_PX + WIDTH_PX / 2;
    return legPaths(route.points).some((path) => hitsPath(this.map, at, path, reach));
  }

  /** Маршрут под точкой экрана. Выделенный проверяется первым, дальше — сверху вниз. */
  private routeAt(at: Point): Route | undefined {
    const selected = findRoute(selection.routeId);
    if (selected && this.hits(selected, at)) return selected;
    return scenario.routes.findLast((route) => this.hits(route, at));
  }

  /** Ручка выделенного маршрута под точкой экрана. Вершина важнее середины участка. */
  private handleAt(at: Point): Handle | undefined {
    const selected = findRoute(selection.routeId);
    if (!selected || routeDraft.active) return undefined;

    const nearest = (handles: Handle[]) => {
      let found: Handle | undefined;
      let reach = HANDLE_REACH_PX;
      for (const handle of handles) {
        const gap = at.dist(this.map.project(handle.position));
        if (gap <= reach) {
          found = handle;
          reach = gap;
        }
      }
      return found;
    };
    const handles = handlesOf(selected);
    return (
      nearest(handles.filter(({ role }) => role === 'vertex')) ??
      nearest(handles.filter(({ role }) => role === 'middle'))
    );
  }

  /** Точка под курсором: место фишки, если курсор на ней. */
  locate(event: PointerEvent): LngLat {
    const unit = this.unitAt(event.point);
    return unit ? [unit.position[0], unit.position[1]] : [event.lngLat.lng, event.lngLat.lat];
  }

  private draw(event: MapMouseEvent): boolean {
    if (!routeDraft.active) return false;

    const position = this.locate(event);
    const last = routeDraft.points.at(-1);
    const onLast =
      last && this.map.project(position).dist(this.map.project(last)) <= FINISH_REACH_PX;
    if (onLast) finishRoute();
    else addRoutePoint(position, this.unitAt(event.point));
    if (!routeDraft.active) this.finishedAt = performance.now();
    return true;
  }

  private pick(event: MapMouseEvent): boolean {
    const route = this.routeAt(event.point);
    if (!route) return false;
    selectRoute(route.id);
    return true;
  }

  /** Перенос выделенного маршрута целиком. Невыделенный маршрут не мешает двигать карту. */
  private carry(
    event: PointerEvent,
    moveEvent: 'mousemove' | 'touchmove',
    endEvent: 'mouseup' | 'touchend',
  ): boolean {
    const route = this.routeAt(event.point);
    if (!route || route.id !== selection.routeId) return false;

    const from: LngLat = [event.lngLat.lng, event.lngLat.lat];
    const points = route.points.map(([lng, lat]): LngLat => [lng, lat]);
    const surfaces = [...route.surfaces];
    drag(this.map, event, moveEvent, endEvent, (next) => {
      reshapeRoute(route.id, {
        points: translate(points, from, [next.lngLat.lng, next.lngLat.lat]),
        surfaces,
      });
    });
    return true;
  }

  private grab(
    event: PointerEvent,
    moveEvent: 'mousemove' | 'touchmove',
    endEvent: 'mouseup' | 'touchend',
  ): boolean {
    const handle = this.handleAt(event.point);
    const route = findRoute(selection.routeId);
    if (!handle || !route) return false;

    const { id } = route;
    let index = handle.index;
    let inserted = false;
    drag(this.map, event, moveEvent, endEvent, (next) => {
      const current = findRoute(id);
      if (!current) return;
      const to = this.locate(next);

      if (handle.role === 'middle' && !inserted) {
        inserted = true;
        index += 1;
        reshapeRoute(id, insertRoutePoint(current, index, to));
      } else {
        const points = current.points.map(([lng, lat]): LngLat => [lng, lat]);
        points[index] = to;
        reshapeRoute(id, { points, surfaces: [...current.surfaces] });
      }
    });
    return true;
  }

  /** Двойной щелчок по вершине убирает её, если в маршруте остаётся хотя бы две точки. */
  private doubleClick(event: MapMouseEvent): void {
    if (routeDraft.active || performance.now() - this.finishedAt < DOUBLE_CLICK_MS) {
      event.preventDefault();
      return;
    }
    const handle = this.handleAt(event.point);
    const route = findRoute(selection.routeId);
    if (!handle || !route) return;

    event.preventDefault();
    if (handle.role !== 'vertex' || route.points.length <= 2) return;
    updateRoute(route.id, removeRoutePoint(route, handle.index));
  }
}
