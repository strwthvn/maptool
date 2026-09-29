import { describe, expect, it } from 'vitest';
import {
  destination,
  distance,
  geodesicPath,
  inverse,
  midpoint,
  polygonArea,
  type LngLat,
} from './geodesy';

// Эталонные значения получены в GeographicLib (алгоритмы Карни) на эллипсоиде WGS 84.
const JALALABAD: LngLat = [70.45, 34.43];
const KABUL: LngLat = [69.1723, 34.5281];
const MOSCOW: LngLat = [37.6173, 55.7558];
const PETERSBURG: LngLat = [30.3351, 59.9343];

describe('обратная задача', () => {
  it('даёт расстояние с точностью до миллиметра', () => {
    expect(distance(JALALABAD, KABUL)).toBeCloseTo(117875.882, 3);
    expect(distance(MOSCOW, PETERSBURG)).toBeCloseTo(634601.9458, 3);
  });

  it('даёт азимут от севера по часовой стрелке', () => {
    expect(inverse(JALALABAD, KABUL).azimuth).toBeCloseTo(275.658517, 5);
    expect(inverse(MOSCOW, PETERSBURG).azimuth).toBeCloseTo(320.140013, 5);
  });

  it('учитывает сжатие Земли: градус по экватору длиннее градуса по меридиану', () => {
    expect(distance([0, 0], [1, 0])).toBeCloseTo(111319.4908, 3);
    expect(distance([0, 0], [0, 1])).toBeCloseTo(110574.3886, 3);
  });

  it('считает кратчайший путь через 180-й меридиан', () => {
    const result = inverse([179.9, 10], [-179.9, 10]);
    expect(result.distance).toBeCloseTo(21927.8725, 3);
    expect(result.azimuth).toBeCloseTo(89.982635, 5);
  });

  it('для совпадающих точек возвращает ноль', () => {
    expect(inverse(JALALABAD, JALALABAD)).toEqual({ distance: 0, azimuth: 0, finalAzimuth: 0 });
  });

  it('не ломается на противоположных точках Земли', () => {
    const result = inverse([0, 0], [179.9999, 0.0001]);
    expect(result.distance).toBeGreaterThan(19_900_000);
    expect(result.distance).toBeLessThan(20_100_000);
  });
});

describe('прямая задача', () => {
  it('находит точку по азимуту и дальности', () => {
    const [lng, lat] = destination(JALALABAD, 45, 10_000);
    expect(lng).toBeCloseTo(70.5269875677, 9);
    expect(lat).toBeCloseTo(34.4937188515, 9);
  });

  it('обратна обратной задаче', () => {
    const { distance: length, azimuth } = inverse(MOSCOW, PETERSBURG);
    const [lng, lat] = destination(MOSCOW, azimuth, length);
    expect(lng).toBeCloseTo(PETERSBURG[0], 9);
    expect(lat).toBeCloseTo(PETERSBURG[1], 9);
  });

  it('не приводит долготу к ±180°, чтобы линия не рвалась', () => {
    expect(destination([179.9, 10], 90, 20_000)[0]).toBeGreaterThan(180);
  });
});

describe('геодезическая линия', () => {
  it('короткий отрезок оставляет отрезком', () => {
    expect(geodesicPath(JALALABAD, [70.5, 34.45])).toEqual([JALALABAD, [70.5, 34.45]]);
  });

  it('длинный отрезок дробит, сохраняя концы и общую длину', () => {
    const path = geodesicPath(MOSCOW, PETERSBURG);
    expect(path.length).toBe(33);
    expect(path[0]).toEqual(MOSCOW);
    expect(path.at(-1)![0]).toBeCloseTo(PETERSBURG[0], 9);

    let length = 0;
    for (let i = 1; i < path.length; i++) length += distance(path[i - 1], path[i]);
    expect(length).toBeCloseTo(634601.9458, 1);
  });

  it('через 180-й меридиан идёт непрерывно', () => {
    const path = geodesicPath([179, 10], [-179, 10]);
    for (let i = 1; i < path.length; i++) expect(path[i][0]).toBeGreaterThan(path[i - 1][0]);
    expect(path.at(-1)![0]).toBeCloseTo(181, 9);
  });

  it('середина равноудалена от концов', () => {
    const middle = midpoint(JALALABAD, KABUL);
    expect(distance(JALALABAD, middle)).toBeCloseTo(117875.882 / 2, 2);
    expect(distance(middle, KABUL)).toBeCloseTo(117875.882 / 2, 2);
  });
});

describe('площадь', () => {
  const relative = (actual: number, expected: number) => Math.abs(actual - expected) / expected;

  it('совпадает с эталоном для участка в десять километров', () => {
    const ring: LngLat[] = [
      [70.4, 34.4],
      [70.5, 34.4],
      [70.5, 34.5],
      [70.4, 34.5],
    ];
    expect(relative(polygonArea(ring), 101939361.39)).toBeLessThan(1e-6);
  });

  it('не зависит от направления обхода', () => {
    const ring: LngLat[] = [
      [70.4, 34.4],
      [70.5, 34.4],
      [70.45, 34.5],
    ];
    expect(polygonArea([...ring].reverse())).toBeCloseTo(polygonArea(ring), 3);
  });

  it('работает через 180-й меридиан', () => {
    const ring: LngLat[] = [
      [179.5, 10],
      [-179.5, 10],
      [-179.5, 11],
      [179.5, 11],
    ];
    expect(relative(polygonArea(ring), 12108467312.58)).toBeLessThan(1e-5);
  });

  it('для фигуры в тысячи километров расходится с эталоном меньше чем на 0,1 %', () => {
    const ring: LngLat[] = [
      [60, 30],
      [75, 30],
      [75, 40],
      [60, 40],
    ];
    expect(relative(polygonArea(ring), 1517312015144.15)).toBeLessThan(1e-3);
  });

  it('меньше трёх вершин — нет площади', () => {
    expect(polygonArea([JALALABAD, KABUL])).toBe(0);
  });
});
