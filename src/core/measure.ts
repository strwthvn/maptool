/** Измерение по карте: длины и азимуты отрезков, общая длина, площадь. */

import { destination, geodesicPath, inverse, polygonArea, type LngLat } from './geodesy';

export interface Segment {
  from: LngLat;
  to: LngLat;
  /** Длина, м. */
  length: number;
  /** Азимут из начала отрезка в конец, градусы. */
  azimuth: number;
  /** Линия отрезка для карты: у длинных отрезков — с промежуточными точками. */
  path: LngLat[];
  middle: LngLat;
}

export interface Measurement {
  segments: Segment[];
  /** Общая длина, у замкнутой фигуры — периметр, м. */
  length: number;
  /** Площадь замкнутой фигуры, м²; у линии — null. */
  area: number | null;
}

export function segment(from: LngLat, to: LngLat): Segment {
  const { distance, azimuth } = inverse(from, to);
  return {
    from,
    to,
    length: distance,
    azimuth,
    path: geodesicPath(from, to),
    middle: distance === 0 ? from : destination(from, azimuth, distance / 2),
  };
}

/** Итоги измерения. Замкнутая фигура получает отрезок из последней точки в первую. */
export function measure(points: LngLat[], closed: boolean): Measurement {
  const segments: Segment[] = [];
  for (let i = 1; i < points.length; i++) segments.push(segment(points[i - 1], points[i]));

  const ring = closed && points.length >= 3;
  if (ring) segments.push(segment(points[points.length - 1], points[0]));

  return {
    segments,
    length: segments.reduce((sum, { length }) => sum + length, 0),
    area: ring ? polygonArea(points) : null,
  };
}

function decimal(value: number, digits: number): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Длина с точностью, которая имеет смысл на карте: до метра, дальше — до 10 и 100 м. */
export function formatLength(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} м`;
  if (meters < 100_000) return `${decimal(meters / 1000, 2)} км`;
  return `${decimal(meters / 1000, 1)} км`;
}

export function formatArea(squareMeters: number): string {
  if (squareMeters < 10_000) return `${Math.round(squareMeters)} м²`;
  if (squareMeters < 1_000_000) return `${decimal(squareMeters / 10_000, 1)} га`;
  return `${decimal(squareMeters / 1_000_000, 2)} км²`;
}
