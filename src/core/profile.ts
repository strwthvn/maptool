/** Профиль высот вдоль линии: точки с равным шагом и высоты в них. */

import { destination, inverse, type LngLat } from './geodesy';

export interface Sample {
  position: LngLat;
  /** Расстояние от начала линии, м. */
  distance: number;
  /** Номер участка линии, на котором лежит точка; вершина относится к участку, который с неё начинается. */
  leg: number;
}

/** Высоты точек, м, в том же порядке. */
export type ElevationSource = (points: LngLat[]) => Promise<number[]>;

export interface Survey {
  samples: Sample[];
  elevations: number[];
  /** Сколько высот пришлось восстановить по соседним: в данных рельефа были выбросы. */
  patched: number;
}

/** Шаг точек профиля, м: примерно размер ячейки данных о рельефе. */
export const SAMPLE_STEP = 30;

/** На длинной линии шаг растёт, чтобы точек не стало больше этого числа. */
export const MAX_SAMPLES = 4000;

/** Высоты за этими пределами на Земле не встречаются: это дефект данных. */
const LOWEST = -500;
const HIGHEST = 9000;

/**
 * Точки вдоль ломаной. Каждая вершина попадает в профиль точно, между вершинами точки
 * идут с равным шагом не больше `step`.
 */
export function sampleLine(points: LngLat[], step = SAMPLE_STEP, limit = MAX_SAMPLES): Sample[] {
  if (points.length === 0) return [];
  const legs = points.slice(1).map((to, index) => inverse(points[index], to));
  const total = legs.reduce((sum, leg) => sum + leg.distance, 0);
  const stride = Math.max(step, total / limit);

  const samples: Sample[] = [];
  let passed = 0;
  legs.forEach(({ distance, azimuth }, leg) => {
    const from = points[leg];
    const pieces = Math.max(1, Math.ceil(distance / stride));
    for (let i = 0; i < pieces; i++) {
      const along = (distance * i) / pieces;
      samples.push({
        position: i === 0 ? from : destination(from, azimuth, along),
        distance: passed + along,
        leg,
      });
    }
    passed += distance;
  });
  samples.push({
    position: points[points.length - 1],
    distance: passed,
    leg: Math.max(0, legs.length - 1),
  });
  return samples;
}

function plausible(value: number): boolean {
  return Number.isFinite(value) && value >= LOWEST && value <= HIGHEST;
}

/**
 * Заменяет выбросы высотой, интерполированной между ближайшими верными соседями.
 * Если верных высот нет совсем, профиль считается плоским.
 */
export function repairElevations(values: number[]): { elevations: number[]; patched: number } {
  const elevations = values.slice();
  let patched = 0;
  let previous = -1;

  for (let i = 0; i <= elevations.length; i++) {
    if (i < elevations.length && !plausible(elevations[i])) continue;
    const gap = i - previous - 1;
    if (gap > 0) {
      const left = previous >= 0 ? elevations[previous] : null;
      const right = i < elevations.length ? elevations[i] : null;
      for (let j = previous + 1; j < i; j++) {
        const share = (j - previous) / (i - previous);
        elevations[j] =
          left !== null && right !== null
            ? left + (right - left) * share
            : (left ?? right ?? 0);
      }
      patched += gap;
    }
    previous = i;
  }
  return { elevations, patched };
}

/** Снимает профиль высот вдоль ломаной. */
export async function survey(
  points: LngLat[],
  source: ElevationSource,
  step = SAMPLE_STEP,
): Promise<Survey> {
  const samples = sampleLine(points, step);
  const raw = await source(samples.map(({ position }) => position));
  return { samples, ...repairElevations(raw) };
}
