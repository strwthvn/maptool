import { describe, expect, it } from 'vitest';
import {
  MOVEMENT_PROFILES,
  isBlocked,
  movementProfile,
  readOverrides,
  readSpeeds,
  slopeFactor,
  speedAt,
} from './movement';

const foot = movementProfile('foot');
const wheeled = movementProfile('wheeled');
const air = movementProfile('air');

describe('скорость пешком', () => {
  it('на ровном месте равна скорости профиля', () => {
    expect(speedAt(foot, 'road', 0)).toBeCloseTo(4, 12);
    expect(speedAt(foot, 'offroad', 0)).toBeCloseTo(3, 12);
    expect(speedAt(movementProfile('footLoaded'), 'offroad', 0)).toBeCloseTo(1.5, 12);
  });

  it('по функции Тоблера быстрее всего на пологом спуске', () => {
    const best = (-Math.atan(0.05) * 180) / Math.PI;
    expect(slopeFactor(foot, best)).toBeCloseTo(Math.exp(0.175), 12);
    expect(slopeFactor(foot, best - 1)).toBeLessThan(slopeFactor(foot, best));
    expect(slopeFactor(foot, best + 1)).toBeLessThan(slopeFactor(foot, best));
  });

  it('в гору падает сильнее, чем на таком же спуске', () => {
    expect(slopeFactor(foot, 10)).toBeCloseTo(0.53948, 4);
    expect(slopeFactor(foot, -10)).toBeCloseTo(0.76556, 4);
    expect(speedAt(foot, 'road', 10)).toBeCloseTo(4 * 0.53948, 3);
  });

  it('круче предельного уклона движения нет ни вверх, ни вниз', () => {
    expect(speedAt(foot, 'road', 35)).toBeGreaterThan(0);
    expect(speedAt(foot, 'road', 35.1)).toBe(0);
    expect(speedAt(foot, 'road', -35.1)).toBe(0);
    expect(isBlocked(foot, -40)).toBe(true);
  });
});

describe('скорость техники', () => {
  it('падает линейно и одинаково на подъёме и спуске', () => {
    expect(speedAt(wheeled, 'road', 0)).toBe(60);
    expect(speedAt(wheeled, 'road', 12.5)).toBeCloseTo(33, 12);
    expect(speedAt(wheeled, 'road', -12.5)).toBeCloseTo(33, 12);
    expect(speedAt(wheeled, 'track', 12.5)).toBeCloseTo(16.5, 12);
  });

  it('на предельном уклоне техника ползёт, круче — не идёт', () => {
    expect(speedAt(wheeled, 'road', 25)).toBeCloseTo(6, 12);
    expect(speedAt(wheeled, 'road', 25.5)).toBe(0);
    expect(speedAt(movementProfile('tracked'), 'offroad', 28)).toBeGreaterThan(0);
  });
});

describe('вертолёт', () => {
  it('летит с одной скоростью над любым рельефом', () => {
    expect(speedAt(air, 'offroad', 0)).toBe(200);
    expect(speedAt(air, 'road', 70)).toBe(200);
    expect(isBlocked(air, 89)).toBe(false);
  });
});

describe('скорости из сценария', () => {
  it('заменяют исходные только у своего профиля', () => {
    const overrides = { foot: { road: 5, track: 4.5, offroad: 2, maxSlope: 30 } };
    expect(movementProfile('foot', overrides)).toMatchObject({ road: 5, offroad: 2, maxSlope: 30 });
    expect(movementProfile('foot', overrides).label).toBe('Пехота');
    expect(movementProfile('wheeled', overrides)).toEqual(wheeled);
  });

  it('чинятся при чтении: мусор заменяется исходным, значения приводятся к пределам', () => {
    expect(readSpeeds({ road: 'быстро', track: -3, offroad: 5000, maxSlope: 120 }, 'foot')).toEqual({
      road: 4,
      track: 0.1,
      offroad: 1000,
      maxSlope: 80,
    });
    expect(readSpeeds(null, 'wheeled')).toMatchObject({ road: 60, maxSlope: 25 });
  });

  it('вертолёту предельный уклон задать нельзя', () => {
    expect(readSpeeds({ road: 150, maxSlope: 20 }, 'air')).toMatchObject({
      road: 150,
      maxSlope: null,
    });
  });

  it('совпавшие с исходными в сценарии не хранятся', () => {
    const { road, track, offroad, maxSlope } = foot;
    expect(readOverrides({ foot: { road, track, offroad, maxSlope }, дракон: { road: 1 } })).toEqual(
      {},
    );
    expect(readOverrides({ tracked: { road: 50 } })).toEqual({
      tracked: { road: 50, track: 30, offroad: 20, maxSlope: 30 },
    });
    expect(readOverrides('мусор')).toEqual({});
  });

  it('у каждого профиля скорость положительна на всех покрытиях', () => {
    for (const profile of MOVEMENT_PROFILES) {
      for (const surface of ['road', 'track', 'offroad'] as const) {
        expect(speedAt(profile, surface, 0)).toBeGreaterThan(0);
      }
    }
  });
});
