/** Проекция Web Mercator: вся карта — квадрат со стороной 1, начало в левом верхнем углу. */

import type { LngLat } from './geodesy';

const MAX_LAT = 85.05112878;
const RAD = Math.PI / 180;

export function toMercator([lng, lat]: LngLat): [x: number, y: number] {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  return [(lng + 180) / 360, 0.5 - Math.asinh(Math.tan(clamped * RAD)) / (2 * Math.PI)];
}

export function fromMercator([x, y]: [number, number]): LngLat {
  return [x * 360 - 180, Math.atan(Math.sinh((0.5 - y) * 2 * Math.PI)) / RAD];
}

/**
 * Переносит точки так же, как точка `from` перенесена в `to`. Сдвиг считается в проекции,
 * поэтому фигура на карте сохраняет форму и размер в пикселях.
 */
export function translate(points: LngLat[], from: LngLat, to: LngLat): LngLat[] {
  const [fromX, fromY] = toMercator(from);
  const [toX, toY] = toMercator(to);
  return points.map((point) => {
    const [x, y] = toMercator(point);
    return fromMercator([x + toX - fromX, y + toY - fromY]);
  });
}

/** Направление отрезка на карте: градусы от севера по часовой стрелке. */
export function heading(from: LngLat, to: LngLat): number {
  const [fromX, fromY] = toMercator(from);
  const [toX, toY] = toMercator(to);
  const degrees = Math.atan2(toX - fromX, fromY - toY) / RAD;
  return (degrees + 360) % 360;
}
