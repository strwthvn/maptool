/** Общее для слоёв, с которыми работают мышью и пальцем: попадание в фигуру и перетаскивание. */

import type { Map as MlMap, Point } from 'maplibre-gl';
import type { LngLat } from '../core/geodesy';
import { fromMercator, toMercator } from '../core/mercator';
import { beginMove, endMove } from '../model/scenario.svelte';
import type { PointerEvent } from './interactive';

/** Сдвиг курсора, после которого нажатие считается перетаскиванием, а не щелчком. */
export const DRAG_THRESHOLD_PX = 4;

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Отрезок на рельефе дробится на куски не длиннее этого, пикселей. */
const PIECE_PX = 16;
const MAX_PIECES = 96;

/**
 * Линия на рельефе провисает в долинах и поднимается на хребтах: от отрезка между её концами
 * на экране она уходит не дальше этой доли его длины. Дальше отрезок можно не дробить.
 */
const SAG_SHARE = 0.5;
const SAG_MIN_PX = 48;

/** Место на экране, которое курсор должен назвать тем же: иначе под курсором не карта, а небо. */
const SURFACE_SLACK_PX = 2;

/**
 * Лежит ли точка экрана на карте. В 3D выше горизонта карты нет: там небо, и место под курсором
 * MapLibre называет наугад.
 */
export function onSurface(map: MlMap, event: PointerEvent): boolean {
  if (map.getPitch() === 0) return true;
  return map.project(event.lngLat).dist(event.point) <= SURFACE_SLACK_PX;
}

/** Место на карте под точкой экрана; null — под ней небо. */
export function surfaceAt(map: MlMap, point: Point): LngLat | null {
  const position = map.unproject(point);
  if (map.getPitch() !== 0 && map.project(position).dist(point) > SURFACE_SLACK_PX) return null;
  return [position.lng, position.lat];
}

/** Точки отрезка между концами: на карте это прямая в проекции. */
function pieces(map: MlMap, from: LngLat, to: LngLat, count: number): Point[] {
  const [fromX, fromY] = toMercator(from);
  const [toX, toY] = toMercator(to);
  const points: Point[] = [];
  for (let i = 1; i < count; i++) {
    const share = i / count;
    points.push(
      map.project(fromMercator([fromX + (toX - fromX) * share, fromY + (toY - fromY) * share])),
    );
  }
  return points;
}

/**
 * Линия на экране. На плоской карте отрезок между точками прямой. На рельефе линия лежит
 * на склонах, и отрезок дробится, чтобы проверка попадания шла по нарисованному.
 */
export function screenPath(map: MlMap, path: LngLat[]): Point[] {
  const screen = path.map((position) => map.project(position));
  if (!map.getTerrain()) return screen;

  const dense: Point[] = screen.slice(0, 1);
  for (let i = 1; i < path.length; i++) {
    const count = Math.min(MAX_PIECES, Math.ceil(screen[i - 1].dist(screen[i]) / PIECE_PX));
    dense.push(...pieces(map, path[i - 1], path[i], count), screen[i]);
  }
  return dense;
}

/** Попадает ли точка экрана в линию с допуском `reach`. */
export function hitsPath(map: MlMap, at: Point, path: LngLat[], reach: number): boolean {
  const screen = path.map((position) => map.project(position));
  const draped = Boolean(map.getTerrain());
  for (let i = 1; i < screen.length; i++) {
    const from = screen[i - 1];
    const to = screen[i];
    const gap = distanceToSegment(at, from, to);
    if (!draped) {
      if (gap <= reach) return true;
      continue;
    }
    // Дробится только отрезок, рядом с которым курсор: проекция на рельеф стоит дорого.
    const length = from.dist(to);
    if (gap > reach + Math.max(SAG_MIN_PX, length * SAG_SHARE)) continue;
    const count = Math.min(MAX_PIECES, Math.ceil(length / PIECE_PX));
    const dense = [from, ...pieces(map, path[i - 1], path[i], count), to];
    for (let j = 1; j < dense.length; j++) {
      if (distanceToSegment(at, dense[j - 1], dense[j]) <= reach) return true;
    }
  }
  return false;
}

/** Попадает ли точка экрана внутрь замкнутой фигуры. */
export function hitsArea(map: MlMap, at: Point, ring: LngLat[]): boolean {
  return insidePolygon(at, screenPath(map, ring));
}

export function insidePolygon(p: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Перетаскивание объекта сценария: порог, запрет движения карты, один шаг в истории правок.
 * `apply` вызывается на каждое движение после того, как порог пройден.
 */
export function drag(
  map: MlMap,
  event: PointerEvent,
  moveEvent: 'mousemove' | 'touchmove',
  endEvent: 'mouseup' | 'touchend',
  apply: (next: PointerEvent) => void,
): void {
  // Иначе карта начнёт двигаться вместе с объектом.
  event.preventDefault();
  const start = event.point;
  let moving = false;

  const move = (next: PointerEvent) => {
    // Объект, который вытащили на небо, остаётся там, где был над горизонтом.
    if (!onSurface(map, next)) return;
    if (!moving) {
      if (next.point.dist(start) < DRAG_THRESHOLD_PX) return;
      moving = true;
      beginMove();
    }
    apply(next);
  };
  map.on(moveEvent, move);
  map.once(endEvent, () => {
    map.off(moveEvent, move);
    if (moving) endMove();
  });
}
