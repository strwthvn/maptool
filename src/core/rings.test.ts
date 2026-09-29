import { describe, expect, it } from 'vitest';
import { distance, type LngLat } from './geodesy';
import { movementProfile } from './movement';
import { describeReach, reachRings, ringLabelAt, ringPath, weaponRings } from './rings';

const A: LngLat = [70.45, 34.43];

describe('кольца дальности оружия', () => {
  it('идут от ближнего к дальнему, с именем и дальностью', () => {
    expect(
      weaponRings([
        { name: 'ДШК', meters: 2000 },
        { name: 'АК-74', meters: 500 },
      ]),
    ).toEqual([
      { kind: 'weapon', radius: 500, label: 'АК-74 · 500 м' },
      { kind: 'weapon', radius: 2000, label: 'ДШК · 2,00 км' },
    ]);
  });

  it('оружие с одной дальностью делит кольцо', () => {
    expect(
      weaponRings([
        { name: 'ПКМ', meters: 1000 },
        { name: ' СВД ', meters: 1000 },
        { name: '', meters: 1000 },
      ]),
    ).toEqual([{ kind: 'weapon', radius: 1000, label: 'ПКМ, СВД · 1,00 км' }]);
  });

  it('без имени подписана одна дальность, а нулевая не рисуется', () => {
    expect(
      weaponRings([
        { name: '', meters: 300 },
        { name: 'Новое', meters: 0 },
        { name: 'Ракета', meters: 5e6 },
      ]),
    ).toEqual([{ kind: 'weapon', radius: 300, label: '300 м' }]);
  });
});

describe('досягаемость за ход', () => {
  it('у пехоты — два кольца: дорога с грунтовкой и бездорожье', () => {
    const rings = reachRings(movementProfile('foot'), 10);
    expect(rings.map(({ label }) => label)).toEqual([
      'Бездорожье · 500 м',
      'Дорога, грунтовка · 667 м',
    ]);
    expect(rings[1].radius).toBeCloseTo(666.667, 3);
  });

  it('у техники — три кольца', () => {
    expect(reachRings(movementProfile('wheeled'), 10).map(({ label }) => label)).toEqual([
      'Бездорожье · 1,67 км',
      'Грунтовка · 5,00 км',
      'Дорога · 10,00 км',
    ]);
  });

  it('у вертолёта — одно, покрытие ему безразлично', () => {
    expect(reachRings(movementProfile('air'), 10)).toEqual([
      { kind: 'reach', radius: (200_000 * 10) / 60, label: 'За ход · 33,33 км' },
    ]);
  });

  it('следует за длиной хода и скоростями сценария', () => {
    const fast = movementProfile('foot', { foot: { road: 6, track: 6, offroad: 6, maxSlope: 35 } });
    expect(reachRings(fast, 30)).toEqual([{ kind: 'reach', radius: 3000, label: 'За ход · 3,00 км' }]);
  });

  it('слишком большие кольца не рисуются', () => {
    expect(reachRings(movementProfile('air'), 1440)).toEqual([]);
  });

  it('описывается одной строкой', () => {
    expect(describeReach(movementProfile('foot'), 10)).toBe(
      '667 м по дороге и грунтовке, 500 м по бездорожью',
    );
    expect(describeReach(movementProfile('air'), 10)).toBe('33,33 км');
  });
});

describe('окружность на местности', () => {
  it('замкнута, и все её точки на одном расстоянии от центра', () => {
    const path = ringPath(A, 1500);
    expect(path).toHaveLength(121);
    expect(path[120]).toEqual(path[0]);
    for (const point of path) expect(distance(A, point)).toBeCloseTo(1500, 5);
  });

  it('подпись оружия стоит на севере кольца, досягаемости — на юге', () => {
    const north = ringLabelAt(A, { kind: 'weapon', radius: 1000 });
    const south = ringLabelAt(A, { kind: 'reach', radius: 1000 });
    expect(north[0]).toBeCloseTo(A[0], 9);
    expect(north[1]).toBeGreaterThan(A[1]);
    expect(south[1]).toBeLessThan(A[1]);
    expect(distance(A, south)).toBeCloseTo(1000, 5);
  });

  it('подписи соседних колец стоят с разных сторон', () => {
    const first = ringLabelAt(A, { kind: 'weapon', radius: 1000 }, 0, 3);
    const second = ringLabelAt(A, { kind: 'weapon', radius: 1000 }, 1, 3);
    const third = ringLabelAt(A, { kind: 'weapon', radius: 1000 }, 2, 3);
    expect(first[0]).toBeLessThan(A[0]);
    expect(second[0]).toBeGreaterThan(A[0]);
    expect(third[0]).toBeCloseTo(A[0], 9);
    for (const at of [first, second, third]) expect(at[1]).toBeGreaterThan(A[1]);
    expect(ringLabelAt(A, { kind: 'reach', radius: 1000 }, 3, 4)).toEqual(
      ringLabelAt(A, { kind: 'reach', radius: 1000 }, 0, 4),
    );
  });
});
