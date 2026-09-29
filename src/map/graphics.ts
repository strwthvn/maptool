/**
 * Слой тактической графики: знаки, набросок рисуемого знака и ручки выделенного;
 * рисование, выбор, перенос и правка формы.
 */

import type {
  FilterSpecification,
  GeoJSONSource,
  Map as MlMap,
  MapMouseEvent,
  Point,
} from 'maplibre-gl';
import type { Feature } from 'geojson';
import type { LngLat } from '../core/geodesy';
import {
  aimSector,
  arrowHeading,
  graphicInk,
  graphicWidth,
  labelAnchor,
  outline,
  pointsNeeded,
  sectorHandles,
  spreadSector,
  type Graphic,
} from '../core/graphics';
import { translate } from '../core/mercator';
import { addDraftPoint, draft, finishDraft } from '../model/draft.svelte';
import {
  findGraphic,
  reshapeGraphic,
  scenario,
  selectGraphic,
  selection,
  updateGraphic,
} from '../model/scenario.svelte';
import { arrowHead } from './images';
import type { Interactive, PointerEvent } from './interactive';
import { drag, hitsArea, hitsPath } from './pointer';

const SOURCE = 'graphics';
const HANDLES = 'graphics-handles';

const ACCENT = '#ff5e2c';
const PAPER = '#edebe8';

const DASH = [3, 2];
const FILL_OPACITY = 0.18;
const CASING_EXTRA_PX = 2.5;
const SELECTED_EXTRA_PX = 7;
const POINT_RADIUS_PX = 6;

/** На таком расстоянии от линии знака щелчок попадает в него. */
const LINE_REACH_PX = 6;
const POINT_REACH_PX = 12;
const HANDLE_REACH_PX = 10;

/** Щелчок по последней точке заканчивает рисование. Сюда же попадает второй щелчок двойного. */
const FINISH_REACH_PX = 6;

/** Столько после конца рисования двойной щелчок ещё не приближает карту, мс. */
const DOUBLE_CLICK_MS = 500;

type Role = 'vertex' | 'middle' | 'apex' | 'reach' | 'left' | 'right';

interface Handle {
  role: Role;
  /** Номер вершины; у середины отрезка — номер вершины перед ней. */
  index: number;
  position: LngLat;
}

function part(name: string): FilterSpecification {
  return ['==', ['get', 'part'], name];
}

/** Часть знака с данным идентификатором; пустой идентификатор не подходит ни одному знаку. */
function partOf(name: string, id: string | null): FilterSpecification {
  return ['all', ['==', ['get', 'part'], name], ['==', ['get', 'id'], id ?? '']];
}

function dashed(dash: string): FilterSpecification {
  return ['all', ['==', ['get', 'part'], 'line'], ['==', ['get', 'dash'], dash]];
}

function point(position: LngLat, properties: Record<string, unknown>): Feature {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: position }, properties };
}

function handlesOf(graphic: Graphic): Handle[] {
  const { kind, points } = graphic;
  if (kind === 'sector') {
    const { reach, left, right } = sectorHandles(graphic);
    return [
      { role: 'apex', index: 0, position: points[0] },
      { role: 'reach', index: 0, position: reach },
      { role: 'left', index: 0, position: left },
      { role: 'right', index: 0, position: right },
    ];
  }

  const handles: Handle[] = points.map((position, index) => ({ role: 'vertex', index, position }));
  if (kind === 'point') return handles;

  const edges = kind === 'area' ? points.length : points.length - 1;
  for (let index = 0; index < edges; index++) {
    const [a, b] = [points[index], points[(index + 1) % points.length]];
    handles.push({ role: 'middle', index, position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
  }
  return handles;
}

export class GraphicLayer {
  private finishedAt = -Infinity;

  /** Рисование нового знака. */
  readonly pencil: Interactive;
  /** Ручки выделенного знака. */
  readonly grips: Interactive;
  /** Сами знаки. */
  readonly bodies: Interactive;

  /**
   * @param snap Место, к которому притягивается точка под курсором, — например фишка.
   */
  constructor(
    private map: MlMap,
    private snap: (point: Point) => LngLat | null,
  ) {
    this.pencil = {
      press: () => false,
      click: (event) => this.draw(event),
      hover: () => (draft.kind ? 'crosshair' : null),
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
        const graphic = this.graphicAt(event.point);
        if (!graphic) return null;
        return graphic.id === selection.graphicId ? 'move' : 'pointer';
      },
    };

    map.on('dblclick', (event) => this.doubleClick(event));
  }

  /** Знаки лежат под фишками. */
  addShapes(): void {
    const { map } = this;
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'graphics-fill',
      type: 'fill',
      source: SOURCE,
      filter: part('fill'),
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': FILL_OPACITY },
    });
    map.addLayer({
      id: 'graphics-selected',
      type: 'line',
      source: SOURCE,
      filter: partOf('line', null),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ACCENT,
        'line-width': ['+', ['get', 'width'], SELECTED_EXTRA_PX],
        'line-opacity': 0.85,
      },
    });
    map.addLayer({
      id: 'graphics-casing',
      type: 'line',
      source: SOURCE,
      filter: part('line'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'casing'],
        'line-width': ['+', ['get', 'width'], CASING_EXTRA_PX],
      },
    });
    map.addLayer({
      id: 'graphics-solid',
      type: 'line',
      source: SOURCE,
      filter: dashed('solid'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'] },
    });
    map.addLayer({
      id: 'graphics-dashed',
      type: 'line',
      source: SOURCE,
      filter: dashed('dashed'),
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['get', 'width'],
        'line-dasharray': DASH,
      },
    });
    map.addLayer({
      id: 'graphics-heads',
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
      id: 'graphics-point-selected',
      type: 'circle',
      source: SOURCE,
      filter: partOf('point', null),
      paint: { 'circle-radius': POINT_RADIUS_PX + 5, 'circle-color': ACCENT, 'circle-opacity': 0.85 },
    });
    map.addLayer({
      id: 'graphics-points',
      type: 'circle',
      source: SOURCE,
      filter: part('point'),
      paint: {
        'circle-radius': POINT_RADIUS_PX,
        'circle-color': ['get', 'color'],
        'circle-stroke-color': ['get', 'casing'],
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: 'graphics-labels',
      type: 'symbol',
      source: SOURCE,
      filter: part('label'),
      layout: {
        'text-field': ['get', 'text'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 13,
        'text-max-width': 12,
        // У точки подпись стоит сбоку, у остальных знаков — по центру.
        'text-anchor': ['match', ['get', 'kind'], 'point', 'left', 'center'],
        'text-offset': ['match', ['get', 'kind'], 'point', ['literal', [0.9, 0]], ['literal', [0, 0]]],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': ['get', 'ink'],
        'text-halo-color': ['get', 'halo'],
        'text-halo-width': 2,
      },
    });
  }

  /** Ручки лежат поверх фишек. */
  addHandles(): void {
    const { map } = this;
    map.addSource(HANDLES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'graphics-handles',
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

  /** Приводит слой в соответствие со сценарием и наброском. */
  sync(
    graphics: Graphic[],
    selectedId: string | null,
    sketch: Graphic | null,
    sketched: LngLat[],
  ): void {
    const { map } = this;
    const features = graphics.flatMap((graphic) => this.features(graphic));
    if (sketch) features.push(...this.features(sketch));
    map.getSource<GeoJSONSource>(SOURCE)?.setData({ type: 'FeatureCollection', features });

    map.setFilter('graphics-selected', partOf('line', selectedId));
    map.setFilter('graphics-point-selected', partOf('point', selectedId));

    const selected = graphics.find((graphic) => graphic.id === selectedId);
    const handles: Feature[] = sketch
      ? sketched.map((position) => point(position, { role: 'vertex' }))
      : selected
        ? handlesOf(selected).map(({ role, position }) => point(position, { role }))
        : [];
    map.getSource<GeoJSONSource>(HANDLES)?.setData({ type: 'FeatureCollection', features: handles });
  }

  private features(graphic: Graphic): Feature[] {
    const ink = graphicInk(graphic.color);
    const width = graphicWidth(graphic.width);
    const shared = { id: graphic.id, kind: graphic.kind, color: ink.line, casing: ink.casing };
    const features: Feature[] = [];

    const shape = outline(graphic);
    if (shape) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: shape.path },
        properties: { ...shared, part: 'line', width, dash: graphic.dash },
      });
      if (shape.closed && graphic.fill) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [shape.path] },
          properties: { ...shared, part: 'fill' },
        });
      }
      if (graphic.kind === 'arrow') {
        features.push(
          point(shape.path[shape.path.length - 1], {
            ...shared,
            part: 'head',
            image: arrowHead(this.map, ink, width, CASING_EXTRA_PX),
            rotate: arrowHeading(graphic),
          }),
        );
      }
    }
    if (graphic.kind === 'point') features.push(point(graphic.points[0], { ...shared, part: 'point' }));

    const text = graphic.label.trim();
    if (text) {
      features.push(
        point(labelAnchor(graphic), { ...shared, part: 'label', text, ink: ink.text, halo: ink.halo }),
      );
    }
    return features;
  }

  private locate(event: PointerEvent): LngLat {
    return this.snap(event.point) ?? [event.lngLat.lng, event.lngLat.lat];
  }

  /** Точка под курсором для наброска, с учётом притяжения. */
  aim(event: PointerEvent): LngLat {
    return this.locate(event);
  }

  private hits(graphic: Graphic, at: Point): boolean {
    if (graphic.kind === 'point') {
      return at.dist(this.map.project(graphic.points[0])) <= POINT_REACH_PX;
    }
    const shape = outline(graphic);
    if (!shape) return false;

    const reach = LINE_REACH_PX + graphicWidth(graphic.width) / 2;
    if (hitsPath(this.map, at, shape.path, reach)) return true;
    return shape.closed && graphic.fill && hitsArea(this.map, at, shape.path);
  }

  /** Знак под точкой экрана. Выделенный проверяется первым, дальше — сверху вниз. */
  private graphicAt(at: Point): Graphic | undefined {
    const selected = findGraphic(selection.graphicId);
    if (selected && this.hits(selected, at)) return selected;
    return scenario.graphics.findLast((graphic) => this.hits(graphic, at));
  }

  /** Ручка выделенного знака под точкой экрана. Вершина важнее середины отрезка. */
  private handleAt(at: Point): Handle | undefined {
    const selected = findGraphic(selection.graphicId);
    if (!selected || draft.kind) return undefined;

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
      nearest(handles.filter(({ role }) => role !== 'middle')) ??
      nearest(handles.filter(({ role }) => role === 'middle'))
    );
  }

  private draw(event: MapMouseEvent): boolean {
    if (!draft.kind) return false;

    const position = this.locate(event);
    const last = draft.points.at(-1);
    const onLast =
      last && this.map.project(position).dist(this.map.project(last)) <= FINISH_REACH_PX;
    if (onLast) finishDraft();
    else addDraftPoint(position);
    if (!draft.kind) this.finishedAt = performance.now();
    return true;
  }

  private pick(event: MapMouseEvent): boolean {
    const graphic = this.graphicAt(event.point);
    if (!graphic) return false;
    selectGraphic(graphic.id);
    return true;
  }

  /** Перенос выделенного знака целиком. Невыделенный знак не мешает двигать карту. */
  private carry(
    event: PointerEvent,
    moveEvent: 'mousemove' | 'touchmove',
    endEvent: 'mouseup' | 'touchend',
  ): boolean {
    const graphic = this.graphicAt(event.point);
    if (!graphic || graphic.id !== selection.graphicId) return false;

    const from: LngLat = [event.lngLat.lng, event.lngLat.lat];
    const points = graphic.points.map(([lng, lat]): LngLat => [lng, lat]);
    drag(this.map, event, moveEvent, endEvent, (next) => {
      reshapeGraphic(graphic.id, {
        points: translate(points, from, [next.lngLat.lng, next.lngLat.lat]),
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
    const graphic = findGraphic(selection.graphicId);
    if (!handle || !graphic) return false;

    const { id } = graphic;
    let index = handle.index;
    let inserted = false;
    drag(this.map, event, moveEvent, endEvent, (next) => {
      const current = findGraphic(id);
      if (!current) return;
      const to = this.locate(next);

      if (handle.role === 'reach') reshapeGraphic(id, aimSector(current, to));
      else if (handle.role === 'left' || handle.role === 'right') {
        reshapeGraphic(id, { spread: spreadSector(current, to) });
      } else {
        const points = current.points.map(([lng, lat]): LngLat => [lng, lat]);
        if (handle.role === 'middle' && !inserted) {
          inserted = true;
          index += 1;
          points.splice(index, 0, to);
        } else {
          points[index] = to;
        }
        reshapeGraphic(id, { points });
      }
    });
    return true;
  }

  /** Двойной щелчок по вершине убирает её, если знак без неё ещё можно построить. */
  private doubleClick(event: MapMouseEvent): void {
    if (draft.kind || performance.now() - this.finishedAt < DOUBLE_CLICK_MS) {
      event.preventDefault();
      return;
    }
    const handle = this.handleAt(event.point);
    const graphic = findGraphic(selection.graphicId);
    if (!handle || !graphic) return;

    event.preventDefault();
    if (handle.role !== 'vertex' || graphic.points.length <= pointsNeeded(graphic.kind)) return;
    updateGraphic(graphic.id, {
      points: graphic.points
        .filter((_, index) => index !== handle.index)
        .map(([lng, lat]): LngLat => [lng, lat]),
    });
  }
}
