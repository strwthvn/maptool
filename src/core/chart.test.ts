import { describe, expect, it } from 'vitest';
import { elevationRange, tickStep, ticks } from './chart';

describe('деления графика', () => {
  it('шаг всегда круглый', () => {
    expect(tickStep(1000, 4)).toBe(500);
    expect(tickStep(870, 4)).toBe(500);
    expect(tickStep(12_400, 8)).toBe(2000);
    expect(tickStep(90, 4)).toBe(50);
    expect(tickStep(3, 5)).toBe(1);
    expect(tickStep(0.8, 4)).toBe(0.2);
  });

  it('деления лежат внутри шкалы', () => {
    expect(ticks(563, 1241, 4)).toEqual([600, 800, 1000, 1200]);
    expect(ticks(0, 12_400, 6)).toEqual([0, 5000, 10_000]);
    expect(ticks(-430, -380, 3)).toEqual([-420, -400, -380]);
    expect(ticks(0, 0.6, 3)).toEqual([0, 0.2, 0.4, 0.6]);
  });

  it('вырожденная шкала даёт одно деление', () => {
    expect(ticks(5, 5, 4)).toEqual([5]);
    expect(tickStep(0, 4)).toBe(1);
  });
});

describe('шкала высот', () => {
  it('оставляет поля вокруг профиля', () => {
    const [low, high] = elevationRange(500, 1500);
    expect(low).toBeCloseTo(420, 9);
    expect(high).toBeCloseTo(1580, 9);
  });

  it('на ровной местности не растягивает метры на весь график', () => {
    const [low, high] = elevationRange(570, 572);
    expect(high - low).toBeCloseTo(40 * 1.16, 9);
    expect((low + high) / 2).toBeCloseTo(571, 9);
  });
});
