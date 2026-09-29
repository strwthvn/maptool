/** Линейка: точки текущего измерения. В сценарий не входит и при перезагрузке пропадает. */

import type { LngLat } from '../core/geodesy';
import { measure, type Measurement } from '../core/measure';

export type RulerMode = 'line' | 'area';

export const ruler = $state<{
  mode: RulerMode;
  points: LngLat[];
  /** Идёт измерение: щелчки по карте добавляют точки. */
  drawing: boolean;
  /** Положение курсора, до которого тянется линия от последней точки. */
  cursor: LngLat | null;
}>({ mode: 'line', points: [], drawing: false, cursor: null });

/** Начинает новое измерение; прежнее стирается. */
export function startRuler(): void {
  ruler.points = [];
  ruler.cursor = null;
  ruler.drawing = true;
}

export function addRulerPoint(point: LngLat): void {
  ruler.points.push(point);
}

export function removeLastRulerPoint(): void {
  ruler.points.pop();
}

export function moveRulerPoint(index: number, point: LngLat): void {
  ruler.points[index] = point;
}

/** Заканчивает измерение. Одна точка ничего не измеряет, поэтому не остаётся на карте. */
export function finishRuler(): void {
  if (!ruler.drawing) return;
  ruler.drawing = false;
  ruler.cursor = null;
  if (ruler.points.length < 2) ruler.points = [];
}

export function clearRuler(): void {
  ruler.drawing = false;
  ruler.cursor = null;
  ruler.points = [];
}

/** Точки измерения вместе с той, что ещё под курсором. */
const measured = $derived.by<LngLat[]>(() => {
  const points = $state.snapshot(ruler.points) as LngLat[];
  return ruler.drawing && ruler.cursor ? [...points, [ruler.cursor[0], ruler.cursor[1]]] : points;
});

const measurement = $derived(measure(measured, ruler.mode === 'area'));

/** Итоги текущего измерения: отрезки, длина, площадь. */
export function rulerMeasurement(): Measurement {
  return measurement;
}
