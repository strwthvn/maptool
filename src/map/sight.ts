/**
 * Слой видимости: линия от наблюдателя к цели с видимыми и скрытыми отрезками, зона обзора
 * с заливкой видимого; постановка точек щелчками и их перетаскивание.
 */

import type {
  GeoJSONSource,
  ImageSource,
  Map as MlMap,
  MapMouseEvent,
  Point,
} from 'maplibre-gl';
import type { Feature } from 'geojson';
import { geodesicPath, type LngLat } from '../core/geodesy';
import type { SightReport } from '../core/los';
import { formatLength } from '../core/measure';
import { ringPath } from '../core/rings';
import type { Unit } from '../core/units';
import { moveSightEnd, placeSight, sight, type SightEnd } from '../model/sight.svelte';
import { SEEN, UNSEEN } from './colors';
import { labelPlate } from './images';
import type { Interactive, PointerEvent } from './interactive';
import { onSurface } from './pointer';

const SOURCE = 'sight';
const ZONE = 'sight-zone';

/** Слой, под который встаёт заливка зоны: её край рисуется поверх неё. */
const ZONE_EDGE = 'sight-ring-casing';

const ACCENT = '#ff5e2c';
const CASING = 'rgba(30, 30, 34, 0.8)';
const PAPER = '#edebe8';

/** На таком расстоянии от точки щелчок и нажатие попадают в неё. */
const VERTEX_REACH_PX = 10;

/** Второй щелчок двойного ставит цель туда же, где наблюдатель: такой щелчок не считается. */
const SAME_PLACE_PX = 6;

/** Столько после второго щелчка двойной щелчок ещё не приближает карту, мс. */
const DOUBLE_CLICK_MS = 500;

export interface SightLineView {
  from: LngLat;
  /** null — цель ещё не указана. */
  to: LngLat | null;
  /** Курсор, к которому тянется линия, пока цель не указана. */
  cursor: LngLat | null;
  /** Расчёт линии; null, пока высоты не сняты. */
  report: SightReport | null;
  /** Концы, которые не привязаны к фишкам: у них есть ручки. */
  free: { from: boolean; to: boolean };
}

export interface SightZoneView {
  center: LngLat;
  radius: number;
  free: boolean;
}

export interface SightView {
  line: SightLineView | null;
  zone: SightZoneView | null;
  /** Место, на которое показывают на графике. */
  probe: LngLat | null;
}

export interface ZoneImage {
  url: string;
  corners: LngLat[];
}

type Corners = [[number, number], [number, number], [number, number], [number, number]];

function part(...names: string[]): ['in', ['get', string], ['literal', string[]]] {
  return ['in', ['get', 'part'], ['literal', names]];
}

export class SightLayer implements Interactive {
  private finishedAt = -Infinity;
  private painted: string | null = null;

  /**
   * @param unitAt Фишка под точкой экрана: место, поставленное на фишку, привязывается к ней.
   */
  constructor(
    private map: MlMap,
    private unitAt: (point: Point) => Unit | undefined,
  ) {
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.on('dblclick', (event) => {
      const justFinished = performance.now() - this.finishedAt < DOUBLE_CLICK_MS;
      if (sight.picking || justFinished) event.preventDefault();
    });
  }

  /** Край зоны обзора. Рисуется под графикой и фишками; заливка встаёт под него. */
  addShapes(): void {
    this.map.addLayer({
      id: ZONE_EDGE,
      type: 'line',
      source: SOURCE,
      filter: part('ring'),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': CASING, 'line-width': 4 },
    });
    this.map.addLayer({
      id: 'sight-ring',
      type: 'line',
      source: SOURCE,
      filter: part('ring'),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': SEEN, 'line-width': 1.75, 'line-dasharray': [5, 3] },
    });
  }

  /** Линия видимости и ручки. Рисуются поверх фишек. */
  addHandles(): void {
    const { map } = this;
    map.addLayer({
      id: 'sight-casing',
      type: 'line',
      source: SOURCE,
      filter: part('seen', 'unseen', 'pending'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': CASING, 'line-width': 6 },
    });
    map.addLayer({
      id: 'sight-pending',
      type: 'line',
      source: SOURCE,
      filter: part('pending'),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': PAPER, 'line-width': 2, 'line-dasharray': [2, 2] },
    });
    map.addLayer({
      id: 'sight-seen',
      type: 'line',
      source: SOURCE,
      filter: part('seen'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': SEEN, 'line-width': 3 },
    });
    // Скрытое отличается не только цветом, но и штрихом.
    map.addLayer({
      id: 'sight-unseen',
      type: 'line',
      source: SOURCE,
      filter: part('unseen'),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': UNSEEN, 'line-width': 3, 'line-dasharray': [1.5, 1.5] },
    });
    map.addLayer({
      id: 'sight-obstacle',
      type: 'circle',
      source: SOURCE,
      filter: part('obstacle'),
      paint: {
        'circle-radius': 5,
        'circle-color': UNSEEN,
        'circle-stroke-color': CASING,
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: 'sight-ends',
      type: 'circle',
      source: SOURCE,
      filter: part('from', 'to', 'center'),
      paint: {
        // Наблюдатель крупнее цели.
        'circle-radius': ['match', ['get', 'part'], 'to', 4.5, 6],
        'circle-color': ['match', ['get', 'part'], 'to', PAPER, ACCENT],
        'circle-stroke-color': ['match', ['get', 'part'], 'to', ACCENT, PAPER],
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: 'sight-probe',
      type: 'circle',
      source: SOURCE,
      filter: part('probe'),
      paint: {
        'circle-radius': 5.5,
        'circle-color': ACCENT,
        'circle-stroke-color': PAPER,
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: 'sight-labels',
      type: 'symbol',
      source: SOURCE,
      filter: part('label'),
      layout: {
        'text-field': ['get', 'text'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        'text-anchor': 'bottom',
        'text-offset': [0, -0.9],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'icon-image': labelPlate(map),
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [3, 6, 3, 6],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'text-color': ['get', 'ink'] },
    });
  }

  /** Приводит слой в соответствие с линией видимости и зоной обзора. */
  sync({ line, zone, probe }: SightView): void {
    const features: Feature[] = [];
    const point = (name: string, position: LngLat, properties = {}): Feature => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: position },
      properties: { part: name, ...properties },
    });
    const path = (name: string, coordinates: LngLat[]): Feature => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: { part: name },
    });

    if (zone) {
      features.push(path('ring', ringPath(zone.center, zone.radius)));
      if (zone.free) features.push(point('center', zone.center));
    }

    if (line) {
      const end = line.to ?? line.cursor;
      if (line.to && line.report) {
        for (const stretch of line.report.stretches) {
          features.push(path(stretch.visible ? 'seen' : 'unseen', stretch.path));
        }
        const { obstacle, visible, length } = line.report;
        if (obstacle) features.push(point('obstacle', obstacle.position));
        features.push(
          point('label', line.to, {
            text: `${visible ? 'Видно' : 'Не видно'} · ${formatLength(length)}`,
            ink: visible ? SEEN : UNSEEN,
          }),
        );
      } else if (end) {
        features.push(path('pending', geodesicPath(line.from, end)));
      }
      if (line.free.from) features.push(point('from', line.from));
      if (line.to && line.free.to) features.push(point('to', line.to));
    }

    if (probe) features.push(point('probe', probe));

    this.map.getSource<GeoJSONSource>(SOURCE)?.setData({ type: 'FeatureCollection', features });
  }

  /** Заливка видимой части зоны; null убирает её с карты. */
  paint(image: ZoneImage | null, opacity: number): void {
    const { map } = this;
    if (!image) {
      if (map.getLayer(ZONE)) map.removeLayer(ZONE);
      if (map.getSource(ZONE)) map.removeSource(ZONE);
      this.painted = null;
      return;
    }

    const coordinates = image.corners as Corners;
    const source = map.getSource<ImageSource>(ZONE);
    if (!source) {
      map.addSource(ZONE, { type: 'image', url: image.url, coordinates });
      map.addLayer(
        {
          id: ZONE,
          type: 'raster',
          source: ZONE,
          paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 },
        },
        ZONE_EDGE,
      );
    } else if (this.painted !== image.url) {
      source.updateImage({ url: image.url, coordinates });
    }
    this.painted = image.url;
    map.setPaintProperty(ZONE, 'raster-opacity', opacity);
  }

  /** Фишка под курсором, а без неё — место на карте. */
  private aim(event: PointerEvent): { position: LngLat; unit: Unit | undefined } {
    return {
      position: [event.lngLat.lng, event.lngLat.lat],
      unit: this.unitAt(event.point),
    };
  }

  /** Точка под курсором: место фишки, если курсор на ней. */
  locate(event: PointerEvent): LngLat {
    const { position, unit } = this.aim(event);
    return unit ? [unit.position[0], unit.position[1]] : position;
  }

  /** Ручка под точкой экрана. У мест, привязанных к фишкам, ручек нет: двигают саму фишку. */
  private endAt(point: Point): SightEnd | null {
    let nearest: SightEnd | null = null;
    let reach = VERTEX_REACH_PX;
    for (const end of ['from', 'to', 'center'] as const) {
      const place = sight[end];
      if (!place || place.unitId) continue;
      const gap = point.dist(this.map.project(place.position));
      if (gap <= reach) {
        nearest = end;
        reach = gap;
      }
    }
    return nearest;
  }

  hover(event: MapMouseEvent): string | null {
    if (sight.picking) return 'crosshair';
    return this.endAt(event.point) ? 'grab' : null;
  }

  click(event: MapMouseEvent): boolean {
    if (!sight.picking) return this.endAt(event.point) !== null;

    const { position, unit } = this.aim(event);
    const from = sight.picking === 'line' ? sight.from : null;
    if (from) {
      const gap = event.point.dist(this.map.project(from.position));
      if (gap <= SAME_PLACE_PX || (unit && unit.id === from.unitId)) return true;
    }
    placeSight(position, unit);
    if (!sight.picking) this.finishedAt = performance.now();
    return true;
  }

  press(
    event: PointerEvent,
    moveEvent: 'mousemove' | 'touchmove',
    endEvent: 'mouseup' | 'touchend',
  ): boolean {
    const end = this.endAt(event.point);
    if (!end) return false;

    // Иначе карта начнёт двигаться вместе с точкой.
    event.preventDefault();
    const { map } = this;
    const move = (next: PointerEvent) => {
      if (!onSurface(map, next)) return;
      const { position, unit } = this.aim(next);
      moveSightEnd(end, position, unit);
    };
    map.on(moveEvent, move);
    map.once(endEvent, () => map.off(moveEvent, move));
    return true;
  }
}
