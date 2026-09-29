/** Слой линейки: линия измерения, её точки и подписи; постановка и перетаскивание точек. */

import type { GeoJSONSource, Map as MlMap, MapMouseEvent, MapTouchEvent, Point } from 'maplibre-gl';
import type { Feature } from 'geojson';
import { formatAzimuth, type AngleUnit } from '../core/angles';
import type { LngLat } from '../core/geodesy';
import { formatArea, formatLength, type Measurement } from '../core/measure';
import { addRulerPoint, finishRuler, moveRulerPoint, ruler } from '../model/ruler.svelte';
import { labelPlate } from './images';
import { onSurface } from './pointer';

const SOURCE = 'ruler';

const ACCENT = '#ff5e2c';
const CASING = 'rgba(30, 30, 34, 0.8)';
const PAPER = '#edebe8';

/** На таком расстоянии от точки измерения щелчок и нажатие попадают в неё. */
const VERTEX_REACH_PX = 10;

/** Щелчок по последней точке заканчивает измерение. Сюда же попадает второй щелчок двойного. */
const FINISH_REACH_PX = 6;

/** Столько после конца измерения двойной щелчок ещё не приближает карту, мс. */
const DOUBLE_CLICK_MS = 500;

type PointerEvent = MapMouseEvent | MapTouchEvent;

export class RulerLayer {
  private finishedAt = -Infinity;

  /**
   * @param snap Место, к которому притягивается точка под курсором, — например фишка.
   */
  constructor(
    private map: MlMap,
    private snap: (point: Point) => LngLat | null,
  ) {
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    const part = (name: string) => ['==', ['get', 'part'], name] as ['==', ['get', string], string];
    map.addLayer({
      id: 'ruler-fill',
      type: 'fill',
      source: SOURCE,
      filter: part('fill'),
      paint: { 'fill-color': ACCENT, 'fill-opacity': 0.14 },
    });
    map.addLayer({
      id: 'ruler-casing',
      type: 'line',
      source: SOURCE,
      filter: part('line'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': CASING, 'line-width': 5.5 },
    });
    map.addLayer({
      id: 'ruler-line',
      type: 'line',
      source: SOURCE,
      filter: part('line'),
      layout: { 'line-join': 'round' },
      // Светлый пунктир не спутать ни с дорогой на карте, ни с тактической графикой.
      paint: { 'line-color': PAPER, 'line-width': 2.5, 'line-dasharray': [3, 1.5] },
    });
    map.addLayer({
      id: 'ruler-vertices',
      type: 'circle',
      source: SOURCE,
      filter: part('vertex'),
      paint: {
        'circle-radius': 4.5,
        'circle-color': PAPER,
        'circle-stroke-color': ACCENT,
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: 'ruler-labels',
      type: 'symbol',
      source: SOURCE,
      filter: ['in', ['get', 'part'], ['literal', ['label', 'total']]],
      layout: {
        'text-field': ['get', 'text'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        // Итог стоит над последней точкой, где его не закрывает курсор; остальные подписи — под линией.
        'text-anchor': ['match', ['get', 'part'], 'total', 'bottom', 'top'],
        'text-offset': ['match', ['get', 'part'], 'total', ['literal', [0, -0.9]], ['literal', [0, 0.9]]],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'icon-image': labelPlate(map),
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [3, 6, 3, 6],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'text-color': ['match', ['get', 'part'], 'total', ACCENT, PAPER],
      },
    });

    map.on('dblclick', (event) => {
      const justFinished = performance.now() - this.finishedAt < DOUBLE_CLICK_MS;
      if (ruler.drawing || justFinished) event.preventDefault();
    });
  }

  /** Приводит слой в соответствие с измерением. */
  sync(points: LngLat[], measurement: Measurement, closed: boolean, unit: AngleUnit): void {
    const features: Feature[] = [];
    const point = (part: string, position: LngLat, text = ''): Feature => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: position },
      properties: { part, text },
    });

    for (const segment of measurement.segments) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: segment.path },
        properties: { part: 'line' },
      });
      if (segment.length > 0) {
        const text = `${formatLength(segment.length)} · ${formatAzimuth(segment.azimuth, unit)}`;
        features.push(point('label', segment.middle, text));
      }
    }

    if (measurement.area !== null) {
      const ring = measurement.segments.flatMap(({ path }) => path.slice(0, -1));
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
        properties: { part: 'fill' },
      });
      features.push(point('total', centre(ring), formatArea(measurement.area)));
    } else if (measurement.segments.length > 1 && !closed) {
      const end = measurement.segments[measurement.segments.length - 1].to;
      features.push(point('total', end, `Всего ${formatLength(measurement.length)}`));
    }

    for (const position of points) features.push(point('vertex', position));

    this.map.getSource<GeoJSONSource>(SOURCE)?.setData({ type: 'FeatureCollection', features });
  }

  /** Точка под курсором с учётом притяжения. */
  locate(event: PointerEvent): LngLat {
    return this.snap(event.point) ?? [event.lngLat.lng, event.lngLat.lat];
  }

  private vertexAt(point: Point): number {
    let nearest = -1;
    let reach = VERTEX_REACH_PX;
    ruler.points.forEach((position, index) => {
      const gap = point.dist(this.map.project(position));
      if (gap <= reach) {
        nearest = index;
        reach = gap;
      }
    });
    return nearest;
  }

  /** Курсор, который нужен линейке в этой точке, или null, если ей всё равно. */
  hover(event: MapMouseEvent): string | null {
    if (ruler.drawing) return 'crosshair';
    return this.vertexAt(event.point) >= 0 ? 'grab' : null;
  }

  click(event: MapMouseEvent): boolean {
    if (!ruler.drawing) return this.vertexAt(event.point) >= 0;

    const position = this.locate(event);
    const last = ruler.points.at(-1);
    if (last && this.map.project(position).dist(this.map.project(last)) <= FINISH_REACH_PX) {
      this.finishedAt = performance.now();
      finishRuler();
    } else {
      addRulerPoint(position);
    }
    return true;
  }

  press(
    event: PointerEvent,
    moveEvent: 'mousemove' | 'touchmove',
    endEvent: 'mouseup' | 'touchend',
  ): boolean {
    const index = this.vertexAt(event.point);
    if (index < 0) return false;

    // Иначе карта начнёт двигаться вместе с точкой.
    event.preventDefault();
    const { map } = this;
    const move = (next: PointerEvent) => {
      if (onSurface(map, next)) moveRulerPoint(index, this.locate(next));
    };
    map.on(moveEvent, move);
    map.once(endEvent, () => map.off(moveEvent, move));
    return true;
  }
}

function centre(ring: LngLat[]): LngLat {
  let lng = 0;
  let lat = 0;
  for (const position of ring) {
    lng += position[0];
    lat += position[1];
  }
  return [lng / ring.length, lat / ring.length];
}
