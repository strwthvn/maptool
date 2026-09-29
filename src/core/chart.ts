/** Разметка осей графика: круглые деления и границы шкалы. */

/** Круглый шаг делений — 1, 2 или 5 на степень десяти, — при котором делений не больше `count`. */
export function tickStep(span: number, count: number): number {
  if (!(span > 0) || count < 1) return 1;
  const rough = span / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  for (const factor of [1, 2, 5]) {
    if (power * factor >= rough) return power * factor;
  }
  return power * 10;
}

/** Круглые значения между `min` и `max` включительно. */
export function ticks(min: number, max: number, count: number): number[] {
  if (!(max > min)) return [min];
  const step = tickStep(max - min, count);
  const values: number[] = [];
  // Считаем целыми шагами: сложение дробных шагов копит ошибку.
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  for (let i = first; i <= last; i++) values.push(Number((i * step).toPrecision(12)));
  return values;
}

/**
 * Границы шкалы высот. Профиль не упирается в края графика, а почти ровная местность
 * не выглядит горами: шкала не бывает уже `minSpan`.
 */
export function elevationRange(lowest: number, highest: number, minSpan = 40): [number, number] {
  const span = Math.max(highest - lowest, minSpan);
  const middle = (lowest + highest) / 2;
  const margin = span * 0.08;
  return [middle - span / 2 - margin, middle + span / 2 + margin];
}
