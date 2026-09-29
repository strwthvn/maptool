import { describe, expect, it } from 'vitest';
import { distance } from './geodesy';
import { WEIGHT_MINOR, WEIGHT_SQUARE, WEIGHT_TENTH, buildGrid, clipLine, gridStep, lineLabel } from './grid';
import { formatMgrs, toMgrs } from './mgrs';
import { toUtm } from './utm';

/** Окрестности Джелалабада, около 28 × 22 км, целиком в зоне 42S. */
const VALLEY = { west: 70.3, east: 70.6, south: 34.33, north: 34.53 };

describe('шаг сетки', () => {
  it('выбирается так, чтобы клетка не была мельче заданной', () => {
    expect(gridStep(1, 50)).toBe(100);
    expect(gridStep(5, 50)).toBe(1000);
    expect(gridStep(20, 50)).toBe(1000);
    expect(gridStep(21, 50)).toBe(10_000);
    expect(gridStep(300, 50)).toBe(100_000);
    expect(gridStep(5000, 50)).toBe(0);
  });
});

describe('отсечение линии', () => {
  const rect = { west: 0, east: 10, south: 0, north: 10 };

  it('оставляет часть внутри прямоугольника', () => {
    expect(clipLine([[-5, 5], [15, 5]], rect)).toEqual([[[0, 5], [10, 5]]]);
  });

  it('склеивает соседние отрезки и режет ломаную, вышедшую наружу', () => {
    const pieces = clipLine([[1, 1], [5, 5], [5, 15], [8, 15], [8, 2]], rect);
    expect(pieces).toEqual([
      [[1, 1], [5, 5], [5, 10]],
      [[8, 10], [8, 2]],
    ]);
  });

  it('линию снаружи отбрасывает', () => {
    expect(clipLine([[-5, -5], [-1, 20]], rect)).toEqual([]);
  });
});

describe('километровая сетка', () => {
  const grid = buildGrid(VALLEY, 1000);
  const eastings = grid.lines.filter((line) => line.kind === 'easting');
  const northings = grid.lines.filter((line) => line.kind === 'northing');

  it('покрывает всю видимую область', () => {
    // 27,6 км с запада на восток и 22,2 км с юга на север.
    expect(eastings.length).toBeGreaterThanOrEqual(27);
    expect(eastings.length).toBeLessThanOrEqual(29);
    expect(northings.length).toBeGreaterThanOrEqual(22);
    expect(northings.length).toBeLessThanOrEqual(24);
  });

  it('проводит линии ровно по круглым координатам UTM', () => {
    for (const line of grid.lines) {
      expect(line.value % 1000).toBe(0);
      for (const [lng, lat] of line.points) {
        const utm = toUtm(lng, lat, 42);
        const along = line.kind === 'easting' ? utm.easting : utm.northing;
        // Концы линий лежат на границе области, между узлами сетки; там линия — хорда.
        expect(Math.abs(along - line.value)).toBeLessThan(0.05);
      }
    }
  });

  it('держит соседние линии в километре друг от друга', () => {
    const [first, second] = northings;
    const gap = distance(first.points[1], second.points[1]);
    expect(gap).toBeGreaterThan(995);
    expect(gap).toBeLessThan(1005);
  });

  it('не выпускает линии за пределы области', () => {
    for (const line of grid.lines) {
      for (const [lng, lat] of line.points) {
        expect(lng).toBeGreaterThanOrEqual(VALLEY.west - 1e-9);
        expect(lng).toBeLessThanOrEqual(VALLEY.east + 1e-9);
        expect(lat).toBeGreaterThanOrEqual(VALLEY.south - 1e-9);
        expect(lat).toBeLessThanOrEqual(VALLEY.north + 1e-9);
      }
    }
  });

  it('выделяет каждую десятую линию', () => {
    const tenth = eastings.filter((line) => line.weight === WEIGHT_TENTH);
    expect(tenth.map((line) => line.value)).toEqual([620_000, 630_000, 640_000]);
    expect(eastings.find((line) => line.value === 633_000)?.weight).toBe(WEIGHT_MINOR);
  });

  it('подписывает линии километрами внутри квадрата', () => {
    const line = eastings.find((candidate) => candidate.value === 633_000)!;
    expect(lineLabel(line, 1000, line.points[0])).toBe('33');
    const north = northings.find((candidate) => candidate.value === 3_808_000)!;
    expect(lineLabel(north, 1000, north.points[0])).toBe('08');
  });

  it('у каждой десятой линии пишет ещё и квадрат', () => {
    const line = eastings.find((candidate) => candidate.value === 630_000)!;
    // Линия начинается южнее 3800-го километра, в квадрате XC, и уходит в квадрат XD.
    expect(lineLabel(line, 1000, line.points[0])).toBe('XC 30');
    expect(lineLabel(line, 1000, line.points.at(-1)!)).toBe('XD 30');
    const north = northings.find((candidate) => candidate.value === 3_810_000)!;
    expect(lineLabel(north, 1000, north.points[0])).toBe('XD 10');
  });

  it('границ зон в этой области нет, подпись зоны одна', () => {
    expect(grid.lines.filter((line) => line.kind === 'zone')).toEqual([]);
    expect(grid.zones.map((zone) => zone.text)).toEqual(['42S']);
  });
});

describe('стык зон', () => {
  // 72° в. д. — граница зон 42 и 43, 40° с. ш. — граница поясов S и T.
  const grid = buildGrid({ west: 70, east: 74, south: 38, north: 42 }, 100_000);

  it('проводит границы зон и поясов', () => {
    const borders = grid.lines.filter((line) => line.kind === 'zone');
    const meridians = borders.filter((line) => line.points[0][0] === line.points[1][0]);
    const parallels = borders.filter((line) => line.points[0][1] === line.points[1][1]);
    expect(meridians.every((line) => line.points[0][0] === 72)).toBe(true);
    expect(parallels.every((line) => line.points[0][1] === 40)).toBe(true);
    expect(meridians.length).toBe(2);
    expect(parallels.length).toBe(2);
  });

  it('подписывает все четыре ячейки', () => {
    expect(grid.zones.map((zone) => zone.text).sort()).toEqual(['42S', '42T', '43S', '43T']);
  });

  it('обрывает линии каждой зоны на её границе', () => {
    for (const line of grid.lines.filter((candidate) => candidate.kind !== 'zone')) {
      for (const [lng] of line.points) {
        if (line.zone === 42) expect(lng).toBeLessThanOrEqual(72);
        else expect(lng).toBeGreaterThanOrEqual(72);
      }
    }
  });

  it('все линии стокилометровой сетки — жирные', () => {
    const lines = grid.lines.filter((line) => line.kind !== 'zone');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.weight === WEIGHT_SQUARE)).toBe(true);
    expect(lineLabel(lines[0], 100_000, lines[0].points[0])).toBe('');
  });

  it('подписывает квадраты 100 км', () => {
    const names = grid.squares.map((square) => square.text);
    // В каждой из четырёх ячеек есть квадрат, в который попадает её середина.
    for (const [lng, lat] of [
      [71, 39],
      [73, 39],
      [71, 41],
      [73, 41],
    ]) {
      expect(names).toContain(formatMgrs(toMgrs(lng, lat), 0));
    }
    expect(new Set(names).size).toBeGreaterThan(6);
  });
});

describe('края мира', () => {
  it('без шага строит только зоны', () => {
    const grid = buildGrid({ west: -180, east: 180, south: -85, north: 85 }, 0);
    expect(grid.lines.every((line) => line.kind === 'zone')).toBe(true);
    // 60 зон на 20 поясов без трёх несуществующих ячеек у Шпицбергена.
    expect(grid.zones).toHaveLength(60 * 20 - 3);
    expect(grid.squares).toEqual([]);
  });

  it('работает, когда карта прокручена через 180-й меридиан', () => {
    const grid = buildGrid({ west: 178, east: 182, south: 10, north: 12 }, 100_000);
    expect(grid.zones.map((zone) => zone.text).sort()).toEqual(['1P', '60P']);
    const border = grid.lines.find((line) => line.kind === 'zone' && line.points[0][0] === 180);
    expect(border).toBeDefined();
    for (const line of grid.lines) {
      for (const [lng] of line.points) {
        expect(lng).toBeGreaterThanOrEqual(178);
        expect(lng).toBeLessThanOrEqual(182);
      }
    }
  });

  it('у Норвегии учитывает расширенную зону 32V', () => {
    const grid = buildGrid({ west: 4, east: 5, south: 60, north: 61 }, 0);
    expect(grid.zones.map((zone) => zone.text)).toEqual(['32V']);
  });

  it('за пределами UTM ничего не строит', () => {
    expect(buildGrid({ west: 0, east: 10, south: 85, north: 89 }, 1000).lines).toEqual([]);
  });

  it('укрупняет шаг, если линий получилось бы слишком много', () => {
    const grid = buildGrid({ west: 60, east: 80, south: 30, north: 40 }, 1000);
    expect(grid.step).toBe(100_000);
    expect(grid.lines.length).toBeLessThan(400);
  });
});
