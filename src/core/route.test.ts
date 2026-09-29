import { describe, expect, it } from 'vitest';
import { destination, type LngLat } from './geodesy';
import { movementProfile, type Surface } from './movement';
import { sampleLine, type Survey } from './profile';
import {
  activeRoute,
  arrivalTurn,
  computeRoute,
  createRoute,
  fitSurfaces,
  formatDuration,
  formatSlope,
  formatSpeed,
  insertRoutePoint,
  readRoute,
  removeRoutePoint,
  reverseRoute,
  routePointAt,
  routePointAtTime,
  routePointAtTurn,
  routeTitle,
} from './route';
import { createUnit } from './units';

const A: LngLat = [70.4, 34.4];
const B = destination(A, 90, 6000);

const foot = movementProfile('foot');
const wheeled = movementProfile('wheeled');

/** Профиль, в котором высота зависит только от расстояния от начала. */
function terrain(points: LngLat[], height: (distance: number) => number): Survey {
  const samples = sampleLine(points, 30);
  return { samples, elevations: samples.map(({ distance }) => height(distance)), patched: 0 };
}

describe('маршрут по плоскости', () => {
  const report = computeRoute(terrain([A, B], () => 570), ['road'], foot, 10);

  it('время — длина, делённая на скорость', () => {
    expect(report.length).toBeCloseTo(6000, 6);
    expect(report.time).toBeCloseTo(5400, 6);
    expect(report.ascent).toBe(0);
    expect(report.descent).toBe(0);
    expect(report.lowest).toBe(570);
    expect(report.highest).toBe(570);
    expect(report.blocked).toEqual([]);
  });

  it('отметки ходов стоят через равные расстояния', () => {
    expect(report.turns.map(({ turn }) => turn)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(report.turnEvery).toBe(1);
    report.turns.forEach(({ turn, distance, elevation }) => {
      expect(distance).toBeCloseTo((6000 / 9) * turn, 4);
      expect(elevation).toBe(570);
    });
    expect(report.turns[8].position[0]).toBeCloseTo(B[0], 6);
  });

  it('скорость зависит от покрытия', () => {
    const offroad = computeRoute(terrain([A, B], () => 570), ['offroad'], foot, 10);
    expect(offroad.time).toBeCloseTo(7200, 6);
    const driving = computeRoute(terrain([A, B], () => 570), ['track'], wheeled, 10);
    expect(driving.time).toBeCloseTo(720, 6);
    expect(driving.turns.map(({ turn }) => turn)).toEqual([1]);
  });
});

describe('маршрут по постоянному склону', () => {
  const up = computeRoute(terrain([A, destination(A, 90, 3000)], (d) => 1000 + 0.1 * d), ['road'], foot, 10);
  const down = computeRoute(terrain([A, destination(A, 90, 3000)], (d) => 1300 - 0.1 * d), ['road'], foot, 10);

  it('набор и сброс высоты равны перепаду', () => {
    expect(up.ascent).toBeCloseTo(300, 6);
    expect(up.descent).toBe(0);
    expect(down.descent).toBeCloseTo(300, 6);
    expect(down.ascent).toBe(0);
    expect(up.steepest).toBeCloseTo(5.7106, 3);
    expect(down.steepest).toBeCloseTo(-5.7106, 3);
  });

  it('время считается по скорости на этом уклоне', () => {
    // Тоблер: уклон +0,1 даёт exp(−0,35) от скорости на ровном месте, уклон −0,1 — ровно её.
    expect(up.time).toBeCloseTo(3000 / ((4 * Math.exp(-0.35)) / 3.6), 3);
    expect(down.time).toBeCloseTo(2700, 3);
    expect(up.points[10].speed).toBeCloseTo(4 * Math.exp(-0.35), 6);
  });

  it('пологий склон не теряется в пороге шума', () => {
    const gentle = computeRoute(terrain([A, B], (d) => 500 + 0.01 * d), ['road'], foot, 10);
    expect(gentle.ascent).toBeGreaterThan(59);
    expect(gentle.ascent).toBeLessThanOrEqual(60);
  });

  it('рябь данных меньше метра в набор высоты не идёт', () => {
    const noisy = computeRoute(
      terrain([A, B], (d) => 500 + (Math.round(d / 30) % 2) * 0.6),
      ['road'],
      foot,
      10,
    );
    expect(noisy.ascent).toBe(0);
    expect(noisy.descent).toBe(0);
  });
});

describe('непроходимые отрезки', () => {
  // Обрыв в 45° между 900 и 1200 м, остальное ровно.
  const cliff = (d: number) => 500 + Math.max(0, Math.min(300, d - 900));
  const report = computeRoute(terrain([A, B], cliff), ['road'], foot, 10);

  it('отмечаются, а время по ним не считается', () => {
    expect(report.blocked).toHaveLength(1);
    expect(report.blocked[0].from).toBeCloseTo(900, 6);
    expect(report.blocked[0].to).toBeCloseTo(1200, 6);
    expect(report.blocked[0].path).toHaveLength(11);
    expect(report.blockedLength).toBeCloseTo(300, 6);
    expect(report.time).toBeCloseTo(5700 / (4 / 3.6), 6);
    expect(report.legs[0].blocked).toBeCloseTo(300, 6);
  });

  it('конец хода на непроходимый отрезок не приходится', () => {
    for (const { distance } of report.turns) {
      expect(distance <= 900.001 || distance >= 1199.999).toBe(true);
    }
  });

  it('для вертолёта обрыв не препятствие', () => {
    const flight = computeRoute(terrain([A, B], cliff), ['road'], movementProfile('air'), 10);
    expect(flight.blocked).toEqual([]);
    expect(flight.time).toBeCloseTo(6000 / (200 / 3.6), 6);
  });

  it('технике хватает уклона меньше, чем пехоте', () => {
    const slope = (d: number) => 500 + Math.tan((30 * Math.PI) / 180) * d;
    expect(computeRoute(terrain([A, B], slope), ['road'], foot, 10).blockedLength).toBe(0);
    expect(computeRoute(terrain([A, B], slope), ['road'], wheeled, 10).blockedLength).toBeCloseTo(6000, 6);
  });
});

describe('участки маршрута', () => {
  const C = destination(B, 0, 3000);
  const report = computeRoute(terrain([A, B, C], () => 0), ['road', 'offroad'], foot, 30);

  it('считаются каждый со своим покрытием', () => {
    expect(report.legs).toHaveLength(2);
    expect(report.legs[0]).toMatchObject({ surface: 'road', from: 0, blocked: 0 });
    expect(report.legs[0].length).toBeCloseTo(6000, 6);
    expect(report.legs[0].time).toBeCloseTo(5400, 6);
    expect(report.legs[1].from).toBeCloseTo(6000, 6);
    expect(report.legs[1].length).toBeCloseTo(3000, 6);
    expect(report.legs[1].time).toBeCloseTo(3600, 6);
    expect(report.time).toBeCloseTo(9000, 6);
  });

  it('участок без покрытия идёт как предыдущий', () => {
    const short = computeRoute(terrain([A, B, C], () => 0), ['road'], foot, 30);
    expect(short.legs[1].surface).toBe('road');
  });

  it('состояние в произвольной точке интерполируется', () => {
    const point = routePointAt(report, 7500)!;
    expect(point.leg).toBe(1);
    expect(point.time).toBeCloseTo(5400 + 1800, 4);
    expect(point.speed).toBeCloseTo(3, 12);
    expect(routePointAt(report, -5)!.distance).toBe(0);
    expect(routePointAt(report, 1e9)!.time).toBeCloseTo(9000, 6);
  });
});

describe('отметки ходов на длинном маршруте', () => {
  it('прореживаются до круглого шага', () => {
    const far = destination(A, 90, 60_000);
    const report = computeRoute(terrain([A, far], () => 0), ['road'], foot, 1);
    expect(report.turnEvery).toBe(5);
    expect(report.turns).toHaveLength(180);
    expect(report.turns[0].turn).toBe(5);
    expect(report.turns.at(-1)!.turn).toBe(900);
  });
});

describe('правка формы маршрута', () => {
  const shape = {
    points: [A, B, destination(B, 0, 1000)] as LngLat[],
    surfaces: ['road', 'offroad'] as Surface[],
  };
  const M: LngLat = [70.42, 34.41];

  it('новая точка делит участок, покрытие наследуется', () => {
    const next = insertRoutePoint(shape, 2, M);
    expect(next.points).toHaveLength(4);
    expect(next.points[2]).toEqual(M);
    expect(next.surfaces).toEqual(['road', 'offroad', 'offroad']);
    expect(insertRoutePoint(shape, 1, M).surfaces).toEqual(['road', 'road', 'offroad']);
    expect(shape.points).toHaveLength(3);
  });

  it('без точки участки сливаются', () => {
    expect(removeRoutePoint(shape, 1)).toEqual({ points: [A, shape.points[2]], surfaces: ['road'] });
    expect(removeRoutePoint(shape, 0).surfaces).toEqual(['offroad']);
    expect(removeRoutePoint(shape, 2).surfaces).toEqual(['road']);
    expect(removeRoutePoint(shape, 7).points).toHaveLength(3);
  });

  it('разворот меняет порядок и точек, и покрытий', () => {
    const back = reverseRoute(shape);
    expect(back.points[0]).toEqual(shape.points[2]);
    expect(back.surfaces).toEqual(['offroad', 'road']);
  });

  it('покрытий всегда столько же, сколько участков', () => {
    expect(fitSurfaces(['road'], 4)).toEqual(['road', 'road', 'road']);
    expect(fitSurfaces([], 3)).toEqual(['offroad', 'offroad']);
    expect(fitSurfaces(['road', 'track', 'offroad'], 2)).toEqual(['road']);
    expect(fitSurfaces(['road'], 1)).toEqual([]);
  });
});

describe('маршрут в сценарии', () => {
  const spec = {
    unitId: null,
    color: 'friend' as const,
    movement: 'wheeled' as const,
    points: [A, B],
    surfaces: ['track'] as Surface[],
    startTurn: 4,
  };

  it('из одной точки не создаётся', () => {
    expect(createRoute({ ...spec, points: [A] })).toBeNull();
    expect(createRoute(spec)).toMatchObject({
      name: '',
      movement: 'wheeled',
      surfaces: ['track'],
      startTurn: 4,
    });
  });

  it('читается обратно без потерь', () => {
    const route = createRoute(spec)!;
    expect(readRoute(JSON.parse(JSON.stringify(route)))).toEqual(route);
  });

  it('чинится при чтении', () => {
    const route = readRoute({
      points: [A, 'мусор', B, [200, 100], destination(B, 0, 500)],
      surfaces: ['road', 'болото'],
      movement: 'телега',
      color: 'розовый',
      unitId: 5,
    })!;
    expect(route.points).toHaveLength(3);
    expect(route.surfaces).toEqual(['road', 'offroad']);
    expect(route).toMatchObject({
      movement: 'foot',
      color: 'plain',
      unitId: null,
      name: '',
      startTurn: 0,
    });
    expect(readRoute({ points: [A, B], startTurn: 7.6 })!.startTurn).toBe(8);
    expect(readRoute({ points: [A, B], startTurn: -3 })!.startTurn).toBe(0);
    expect(route.id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('без двух верных точек не читается', () => {
    expect(readRoute({ points: [A] })).toBeNull();
    expect(readRoute(null)).toBeNull();
    expect(readRoute([A, B])).toBeNull();
  });

  it('называется по своему имени или по фишке', () => {
    const unit = createUnit({ affiliation: 'friend', type: 'infantry', echelon: 'platoon' }, A);
    unit.callsign = 'Альфа';
    expect(routeTitle({ name: ' На мост ' }, unit)).toBe('На мост');
    expect(routeTitle({ name: '' }, unit)).toBe('Маршрут: Альфа');
    expect(routeTitle({ name: '' })).toBe('Маршрут');
  });
});

describe('запись величин', () => {
  it('время в пути', () => {
    expect(formatDuration(45)).toBe('45 с');
    expect(formatDuration(59.7)).toBe('1 мин');
    expect(formatDuration(600)).toBe('10 мин');
    expect(formatDuration(3599)).toBe('1 ч 00 мин');
    expect(formatDuration(11_100)).toBe('3 ч 05 мин');
    expect(formatDuration(52 * 3600)).toBe('2 сут 4 ч');
  });

  it('скорость и уклон', () => {
    expect(formatSpeed(3.25)).toBe('3,3 км/ч');
    expect(formatSpeed(42.4)).toBe('42 км/ч');
    expect(formatSlope(12.4)).toBe('+12°');
    expect(formatSlope(-7.6)).toBe('−8°');
    expect(formatSlope(0.2)).toBe('0°');
  });
});

describe('маршрут по часам сценария', () => {
  // 6 км по дороге пешком — девять ходов по десять минут.
  const report = computeRoute(terrain([A, B], () => 570), ['road'], foot, 10, 4);

  it('отметки ходов нумеруются по часам', () => {
    expect(report.turns.map(({ turn }) => turn)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(report.turns[0].distance).toBeCloseTo(6000 / 9, 4);
    expect(report.startTurn).toBe(4);
    expect(arrivalTurn(report)).toBeCloseTo(13, 6);
  });

  it('к концу хода фишка стоит на его отметке', () => {
    for (const mark of report.turns) {
      const point = routePointAtTurn(report, mark.turn)!;
      expect(point.distance).toBeCloseTo(mark.distance, 6);
      expect(point.position[0]).toBeCloseTo(mark.position[0], 9);
      expect(point.position[1]).toBeCloseTo(mark.position[1], 9);
    }
  });

  it('до выхода фишка в начале маршрута, после прибытия — в конце', () => {
    expect(routePointAtTurn(report, 0)!.distance).toBe(0);
    expect(routePointAtTurn(report, 4)!.distance).toBe(0);
    expect(routePointAtTurn(report, 13)!.distance).toBeCloseTo(6000, 6);
    expect(routePointAtTurn(report, 40)!.position).toEqual(B);
  });

  it('непроходимый отрезок фишка минует без затрат времени', () => {
    const cliff = (d: number) => 500 + Math.max(0, Math.min(300, d - 900));
    const broken = computeRoute(terrain([A, B], cliff), ['road'], foot, 10);
    // 900 м до обрыва — 810 с; сразу за этим временем фишка уже за обрывом.
    expect(routePointAtTime(broken, 809)!.distance).toBeLessThan(900);
    expect(routePointAtTime(broken, 811)!.distance).toBeGreaterThan(1200);
    expect(routePointAtTime(broken, 811)!.distance).toBeLessThan(1202);
  });

  it('прореженные отметки стоят на круглых ходах по часам', () => {
    const far = destination(A, 90, 60_000);
    const long = computeRoute(terrain([A, far], () => 0), ['road'], foot, 1, 3);
    expect(long.turnEvery).toBe(5);
    expect(long.turns[0].turn).toBe(5);
    expect(long.turns[0].distance).toBeCloseTo((2 * 4000) / 60, 3);
    expect(long.turns[1].turn).toBe(10);
  });

  it('из маршрутов фишки идёт тот, что начат последним', () => {
    const routes = [{ startTurn: 0 }, { startTurn: 6 }, { startTurn: 12 }];
    expect(activeRoute(routes, 0)).toBe(routes[0]);
    expect(activeRoute(routes, 8)).toBe(routes[1]);
    expect(activeRoute(routes, 50)).toBe(routes[2]);
    expect(activeRoute([{ startTurn: 3 }], 2)).toBeUndefined();
    const twins = [{ startTurn: 2 }, { startTurn: 2 }];
    expect(activeRoute(twins, 5)).toBe(twins[1]);
  });
});
