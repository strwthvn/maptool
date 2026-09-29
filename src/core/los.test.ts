import { describe, expect, it } from 'vitest';
import { TILE_SIZE, lngLatToPixel, type ElevationGrid } from './dem';
import { destination, type LngLat } from './geodesy';
import {
  HIDDEN,
  OUTSIDE,
  VISIBLE,
  clampHeight,
  clampRadius,
  curvatureDrop,
  formatHeight,
  groundResolution,
  horizonDistance,
  planGrid,
  sightLine,
  sightPointAt,
  viewshed,
  viewshedAt,
  viewshedCorners,
  type ViewshedSpec,
} from './los';
import { sampleLine, type Survey } from './profile';

const START: LngLat = [70.45, 34.43];

/** Профиль линии длиной `length` на восток; высота задаётся функцией от расстояния. */
function profile(length: number, elevation: (distance: number) => number, step = 30): Survey {
  const samples = sampleLine([START, destination(START, 90, length)], step);
  return { samples, elevations: samples.map(({ distance }) => elevation(distance)), patched: 0 };
}

const flat = () => 1000;

/** Гребень высотой `height` над равниной, шириной 200 м, с вершиной на удалении `at`. */
const ridge = (at: number, height: number) => (distance: number) =>
  1000 + Math.max(0, height * (1 - Math.abs(distance - at) / 100));

describe('curvatureDrop', () => {
  it('на 10 км поверхность уходит вниз почти на 7 м', () => {
    expect(curvatureDrop(10_000)).toBeCloseTo(6.828, 2);
    expect(curvatureDrop(0)).toBe(0);
  });

  it('согласована с дальностью горизонта', () => {
    const distance = horizonDistance(1.7);
    expect(distance).toBeCloseTo(4990, -1);
    expect(curvatureDrop(distance)).toBeCloseTo(1.7, 6);
  });
});

describe('sightLine', () => {
  it('на равнине цель видна, линия просматривается вся', () => {
    const report = sightLine(profile(2000, flat), 1.7, 1.7);
    expect(report.visible).toBe(true);
    expect(report.obstacle).toBeNull();
    expect(report.needed).toBeNull();
    expect(report.hiddenLength).toBe(0);
    expect(report.stretches).toHaveLength(1);
    expect(report.stretches[0]).toMatchObject({ visible: true, from: 0 });
    expect(report.stretches[0].to).toBeCloseTo(2000, 3);
    expect(report.length).toBeCloseTo(2000, 3);
    expect(report.eye).toBeCloseTo(1001.7, 6);
    expect(report.aim).toBeCloseTo(1001.7, 6);
  });

  it('гребень закрывает цель за ним', () => {
    const report = sightLine(profile(2000, ridge(1000, 50)), 1.7, 1.7);
    expect(report.visible).toBe(false);
    expect(report.obstacle?.distance).toBeCloseTo(1000, -2);
    expect(report.obstacle?.elevation).toBeGreaterThan(1040);
    expect(report.obstacle?.excess).toBeGreaterThan(40);
    expect(report.hiddenLength).toBeGreaterThan(800);
    expect(report.hiddenLength).toBeLessThan(1000);
  });

  it('передний склон гребня виден, задний и всё за ним — нет', () => {
    const report = sightLine(profile(2000, ridge(1000, 50)), 1.7, 0);
    const at = (distance: number) => sightPointAt(report, distance)!.visible;
    expect(at(500)).toBe(true);
    expect(at(950)).toBe(true);
    expect(at(1060)).toBe(false);
    expect(at(1500)).toBe(false);
    expect(at(2000)).toBe(false);
    expect(report.stretches.map(({ visible }) => visible)).toEqual([true, false]);
  });

  it('говорит, с какой высоты цель покажется из-за гребня', () => {
    const terrain = profile(2000, ridge(1000, 50));
    const hidden = sightLine(terrain, 1.7, 1.7);
    const needed = hidden.needed!;
    // Луч через вершину гребня на вдвое большем удалении поднимается вдвое выше.
    // Точки профиля на саму вершину не попадают, поэтому гребень выходит немного ниже.
    expect(needed).toBeGreaterThan(80);
    expect(needed).toBeLessThan(100);
    expect(sightLine(terrain, 1.7, needed + 0.01).visible).toBe(true);
    expect(sightLine(terrain, 1.7, needed - 0.01).visible).toBe(false);
  });

  it('наблюдатель повыше видит через гребень', () => {
    const terrain = profile(2000, ridge(1000, 20));
    expect(sightLine(terrain, 1.7, 1.7).visible).toBe(false);
    expect(sightLine(terrain, 45, 1.7).visible).toBe(true);
  });

  it('высокая цель за гребнем видна, хотя земля под ней закрыта', () => {
    const report = sightLine(profile(2000, ridge(1000, 20)), 1.7, 60);
    expect(report.visible).toBe(true);
    expect(report.hiddenLength).toBeLessThan(sightLine(profile(2000, ridge(1000, 20)), 1.7, 0).hiddenLength);
  });

  it('кривизна Земли прячет землю за горизонтом', () => {
    const report = sightLine(profile(10_000, () => 0), 1.7, 0);
    expect(report.visible).toBe(false);
    const [near, far] = report.stretches;
    expect(report.stretches).toHaveLength(2);
    expect(near.visible).toBe(true);
    expect(far.visible).toBe(false);
    expect(near.to).toBeGreaterThan(horizonDistance(1.7) - 30);
    expect(near.to).toBeLessThan(horizonDistance(1.7) + 30);
    // Чтобы показаться из-за горизонта, цели нужна высота, с которой горизонт — оставшиеся 5 км.
    expect(report.needed).toBeCloseTo(curvatureDrop(10_000 - horizonDistance(1.7)), 0);
  });

  it('луч на цель проходит от глаз наблюдателя до верха цели', () => {
    const report = sightLine(profile(3000, (distance) => 1000 + distance * 0.1), 2, 5);
    expect(report.points[0].ray).toBeCloseTo(1002, 6);
    expect(report.points.at(-1)!.ray).toBeCloseTo(1305, 3);
    // Посередине прямой луч выше хорды между концами на величину кривизны.
    const middle = sightPointAt(report, 1500)!;
    expect(middle.ray - (1002 + 1305) / 2).toBeCloseTo(curvatureDrop(1500) - curvatureDrop(3000) / 2, 1);
  });

  it('отрезки покрывают линию без пропусков', () => {
    const report = sightLine(
      profile(3000, (distance) => 1000 + 30 * Math.sin(distance / 150)),
      // С высоты видны передние склоны всех волн, задние закрыты гребнями.
      100,
      0,
    );
    expect(report.stretches.length).toBeGreaterThan(3);
    expect(report.stretches[0].from).toBe(0);
    expect(report.stretches.at(-1)!.to).toBeCloseTo(3000, 3);
    report.stretches.slice(1).forEach((stretch, index) => {
      expect(stretch.from).toBe(report.stretches[index].to);
      expect(stretch.visible).not.toBe(report.stretches[index].visible);
      expect(stretch.path[0]).toEqual(report.stretches[index].path.at(-1));
    });
    const hidden = report.stretches
      .filter(({ visible }) => !visible)
      .reduce((sum, { from, to }) => sum + to - from, 0);
    expect(report.hiddenLength).toBeCloseTo(hidden, 6);
  });

  it('линия из одной точки видна и ничего не ломает', () => {
    const report = sightLine(profile(0, flat), 1.7, 1.7);
    expect(report.visible).toBe(true);
    expect(report.length).toBeCloseTo(0, 6);
    expect(sightPointAt(report, 100)?.distance).toBeCloseTo(0, 6);
  });

  it('пустой профиль даёт пустой отчёт', () => {
    const report = sightLine({ samples: [], elevations: [], patched: 0 }, 1.7, 1.7);
    expect(report.visible).toBe(true);
    expect(report.points).toEqual([]);
    expect(report.stretches).toEqual([]);
    expect(sightPointAt(report, 0)).toBeNull();
  });
});

/** Прямоугольник высот под зону: высота задаётся функцией от места в пикселях мировой сетки. */
function terrain(spec: ViewshedSpec, elevation: (x: number, y: number) => number): ElevationGrid {
  const plan = planGrid(spec);
  const data = new Float32Array(plan.width * plan.height);
  for (let j = 0; j < plan.height; j++) {
    for (let i = 0; i < plan.width; i++) {
      data[j * plan.width + i] = elevation(plan.left + i + 0.5, plan.top + j + 0.5);
    }
  }
  return { ...plan, data };
}

describe('planGrid', () => {
  it('небольшая зона считается на зуме данных о рельефе', () => {
    const plan = planGrid({ observer: START, radius: 5000, observerHeight: 1.7, targetHeight: 0 });
    expect(plan.zoom).toBe(12);
    const cell = groundResolution(START[1], 12);
    expect(cell).toBeCloseTo(31.5, 0);
    expect(plan.width).toBe(plan.height);
    expect(plan.width * cell).toBeGreaterThan(10_000);
    expect(plan.width * cell).toBeLessThan(10_400);
    const [x, y] = lngLatToPixel(START[0], START[1], 12);
    expect(plan.left + plan.width / 2).toBeCloseTo(x, -1);
    expect(plan.top + plan.height / 2).toBeCloseTo(y, -1);
  });

  it('большая зона переходит на более грубую сетку', () => {
    const plan = planGrid({ observer: START, radius: 50_000, observerHeight: 1.7, targetHeight: 0 });
    expect(plan.zoom).toBe(11);
    expect(plan.width).toBeLessThanOrEqual(2 * 1024 + 3);
  });

  it('в высоких широтах пиксели мельче, и сетка грубеет раньше', () => {
    const plan = planGrid({ observer: [20, 70], radius: 20_000, observerHeight: 1.7, targetHeight: 0 });
    expect(plan.zoom).toBe(11);
  });
});

describe('viewshed', () => {
  const spec: ViewshedSpec = { observer: START, radius: 3000, observerHeight: 1.7, targetHeight: 0 };

  it('на равнине видно всю зону, её площадь — площадь круга', () => {
    const zone = viewshed(terrain(spec, () => 1000), spec);
    expect(zone.area).toBeGreaterThan(Math.PI * 3000 ** 2 * 0.98);
    expect(zone.area).toBeLessThan(Math.PI * 3000 ** 2 * 1.02);
    expect(zone.visibleArea).toBe(zone.area);
    expect(zone.ground).toBeCloseTo(1000, 6);
    expect(zone.mask.includes(HIDDEN)).toBe(false);
    expect(zone.mask[0]).toBe(OUTSIDE);
    expect(zone.mask[Math.floor(zone.mask.length / 2)]).toBe(VISIBLE);
  });

  it('край зоны лежит на заданном радиусе', () => {
    const zone = viewshed(terrain(spec, () => 1000), spec);
    for (const azimuth of [0, 45, 90, 180, 270, 315]) {
      expect(viewshedAt(zone, destination(START, azimuth, 2900))).toBe(true);
      expect(viewshedAt(zone, destination(START, azimuth, 3100))).toBeNull();
    }
  });

  it('стена к востоку закрывает всё, что за ней, а запад остаётся виден', () => {
    const [ox] = lngLatToPixel(START[0], START[1], 12);
    // Стена высотой 100 м в километре к востоку, шириной в три ячейки.
    const wall = ox + 1000 / groundResolution(START[1], 12);
    const zone = viewshed(
      terrain(spec, (x) => (Math.abs(x - wall) < 1.5 ? 1100 : 1000)),
      spec,
    );
    expect(viewshedAt(zone, destination(START, 90, 800))).toBe(true);
    expect(viewshedAt(zone, destination(START, 90, 1300))).toBe(false);
    expect(viewshedAt(zone, destination(START, 90, 2500))).toBe(false);
    expect(viewshedAt(zone, destination(START, 60, 2500))).toBe(false);
    expect(viewshedAt(zone, destination(START, 270, 2500))).toBe(true);
    expect(viewshedAt(zone, destination(START, 0, 2500))).toBe(true);
    expect(zone.visibleArea).toBeLessThan(zone.area * 0.75);
    expect(zone.visibleArea).toBeGreaterThan(zone.area * 0.5);
  });

  it('высокая цель видна и за стеной', () => {
    const [ox] = lngLatToPixel(START[0], START[1], 12);
    const wall = ox + 1000 / groundResolution(START[1], 12);
    const high = { ...spec, targetHeight: 200 };
    const zone = viewshed(
      terrain(high, (x) => (Math.abs(x - wall) < 1.5 ? 1100 : 1000)),
      high,
    );
    // Луч через верх стены на удалении 1,5 км поднимается на 150 м.
    expect(viewshedAt(zone, destination(START, 90, 1500))).toBe(true);
    expect(viewshedAt(zone, destination(START, 90, 2500))).toBe(false);
  });

  it('совпадает с линией видимости по тому же рельефу', () => {
    const [ox, oy] = lngLatToPixel(START[0], START[1], 12);
    const cell = groundResolution(START[1], 12);
    const hills = (x: number, y: number) =>
      1000 + 40 * Math.sin(((x - ox) * cell) / 300) + 25 * Math.cos(((y - oy) * cell) / 200);
    const zone = viewshed(terrain(spec, hills), spec);

    let agreed = 0;
    let total = 0;
    for (const azimuth of [20, 110, 200, 290]) {
      const samples = sampleLine([START, destination(START, azimuth, 2800)], 30);
      const elevations = samples.map(({ position }) => {
        const [x, y] = lngLatToPixel(position[0], position[1], 12);
        return hills(x, y);
      });
      const line = sightLine({ samples, elevations, patched: 0 }, 1.7, 0);
      for (const point of line.points.slice(3)) {
        total += 1;
        if (viewshedAt(zone, point.position) === point.visible) agreed += 1;
      }
    }
    // Расходятся только ячейки на самой границе видимого и скрытого.
    expect(agreed / total).toBeGreaterThan(0.93);
  });

  it('выброс в данных не открывает и не закрывает обзор', () => {
    const grid = terrain(spec, () => 1000);
    const clean = viewshed(grid, spec);
    grid.data[Math.floor(grid.data.length / 2) + 10] = -4617;
    grid.data[Math.floor(grid.data.length / 2) - 20] = 32000;
    const patched = viewshed(grid, spec);
    expect(patched.visibleArea).toBe(clean.visibleArea);
  });

  it('за горизонтом ровная земля не видна', () => {
    const wide: ViewshedSpec = { observer: START, radius: 8000, observerHeight: 1.7, targetHeight: 0 };
    const zone = viewshed(terrain(wide, () => 0), wide);
    expect(viewshedAt(zone, destination(START, 45, 4500))).toBe(true);
    expect(viewshedAt(zone, destination(START, 45, 5500))).toBe(false);
    const share = zone.visibleArea / zone.area;
    expect(share).toBeCloseTo((horizonDistance(1.7) / 8000) ** 2, 1);
  });

  it('углы растра охватывают зону', () => {
    const zone = viewshed(terrain(spec, () => 1000), spec);
    const [northWest, northEast, southEast, southWest] = viewshedCorners(zone);
    expect(northWest[0]).toBe(southWest[0]);
    expect(northEast[0]).toBe(southEast[0]);
    expect(northWest[1]).toBe(northEast[1]);
    expect(northWest[0]).toBeLessThan(destination(START, 270, 3000)[0]);
    expect(northEast[0]).toBeGreaterThan(destination(START, 90, 3000)[0]);
    expect(northWest[1]).toBeGreaterThan(destination(START, 0, 3000)[1]);
    expect(southWest[1]).toBeLessThan(destination(START, 180, 3000)[1]);
    expect(zone.width).toBe(zone.height);
    expect(zone.width % 2).toBe(1);
    expect(zone.width).toBeLessThan(TILE_SIZE);
  });
});

describe('форматы и пределы', () => {
  it('высота пишется с десятыми, пока она мала', () => {
    expect(formatHeight(1.7)).toBe('1,7 м');
    expect(formatHeight(2)).toBe('2 м');
    expect(formatHeight(12.4)).toBe('12 м');
    expect(formatHeight(1250)).toBe('1 250 м');
  });

  it('высота и радиус держатся в пределах', () => {
    expect(clampHeight(-5)).toBe(0);
    expect(clampHeight(20_000)).toBe(10_000);
    expect(clampRadius(10)).toBe(100);
    expect(clampRadius(80_000)).toBe(50_000);
  });
});
