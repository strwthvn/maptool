import { describe, expect, it } from 'vitest';
import { destination, distance, type LngLat } from './geodesy';
import { repairElevations, sampleLine, survey } from './profile';

const A: LngLat = [70.4, 34.4];
const B = destination(A, 90, 1000);
const C = destination(B, 0, 500);

describe('sampleLine', () => {
  it('ставит точки с равным шагом и не теряет вершины', () => {
    const samples = sampleLine([A, B, C], 30);
    // 1000 м — 34 шага, 500 м — 17 шагов, плюс конечная точка.
    expect(samples).toHaveLength(34 + 17 + 1);
    expect(samples[0]).toEqual({ position: A, distance: 0, leg: 0 });
    expect(samples[34].position).toEqual(B);
    expect(samples[34].leg).toBe(1);
    expect(samples[34].distance).toBeCloseTo(1000, 6);
    expect(samples.at(-1)!.position).toEqual(C);
    expect(samples.at(-1)!.distance).toBeCloseTo(1500, 6);
    expect(samples.at(-1)!.leg).toBe(1);
  });

  it('расстояния в профиле совпадают с расстояниями на местности', () => {
    const samples = sampleLine([A, B], 30);
    for (let i = 1; i < samples.length; i++) {
      const step = samples[i].distance - samples[i - 1].distance;
      expect(step).toBeLessThanOrEqual(30);
      expect(distance(samples[i - 1].position, samples[i].position)).toBeCloseTo(step, 3);
    }
  });

  it('на длинной линии увеличивает шаг, чтобы точек не было слишком много', () => {
    const far = destination(A, 45, 500_000);
    const samples = sampleLine([A, far], 30, 1000);
    expect(samples.length).toBeLessThanOrEqual(1001);
    expect(samples.at(-1)!.distance).toBeCloseTo(500_000, 3);
  });

  it('переживает участок нулевой длины и линию из одной точки', () => {
    const samples = sampleLine([A, A, B], 30);
    expect(samples[0].distance).toBe(0);
    expect(samples[1].distance).toBe(0);
    expect(samples[1].leg).toBe(1);
    expect(sampleLine([A])).toEqual([{ position: A, distance: 0, leg: 0 }]);
    expect(sampleLine([])).toEqual([]);
  });
});

describe('repairElevations', () => {
  it('верные высоты не трогает', () => {
    expect(repairElevations([570, 571.5, -410, 8848])).toEqual({
      elevations: [570, 571.5, -410, 8848],
      patched: 0,
    });
  });

  it('выброс внутри профиля заменяет интерполяцией между соседями', () => {
    expect(repairElevations([100, -4617, -9838, 400])).toEqual({
      elevations: [100, 200, 300, 400],
      patched: 2,
    });
  });

  it('выброс на краю заменяет ближайшей верной высотой', () => {
    expect(repairElevations([NaN, 50, 60, 32000]).elevations).toEqual([50, 50, 60, 60]);
  });

  it('без единой верной высоты считает профиль плоским', () => {
    expect(repairElevations([NaN, -9999])).toEqual({ elevations: [0, 0], patched: 2 });
  });
});

describe('survey', () => {
  it('запрашивает высоты всех точек одним разом', async () => {
    const asked: LngLat[][] = [];
    const result = await survey([A, B], async (points) => {
      asked.push(points);
      return points.map((_, index) => 500 + index);
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toHaveLength(result.samples.length);
    expect(result.elevations[0]).toBe(500);
    expect(result.elevations.at(-1)).toBe(500 + result.samples.length - 1);
    expect(result.patched).toBe(0);
  });
});
