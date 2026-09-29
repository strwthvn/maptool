import { describe, expect, it } from 'vitest';
import {
  AFFILIATIONS,
  ECHELONS,
  STATUSES,
  UNIT_TYPES,
  createUnit,
  duplicateUnit,
  retype,
  sidc,
  unitTitle,
  type SymbolSpec,
} from './units';

const base: SymbolSpec = {
  affiliation: 'friend',
  type: 'infantry',
  echelon: 'platoon',
  status: 'present',
};

describe('sidc', () => {
  it('собирает код пехотного взвода', () => {
    expect(sidc(base)).toBe('SFGPUCI----D---');
  });

  it('отражает сторону, состояние и эшелон', () => {
    expect(sidc({ ...base, affiliation: 'hostile', status: 'destroyed', echelon: 'company' })).toBe(
      'SHGXUCI----E---',
    );
  });

  it('помечает штаб модификатором, а не функцией', () => {
    expect(sidc({ ...base, type: 'hq', echelon: 'battalion' })).toBe('SFGPU-----AF---');
  });

  it('ставит спецназ в своё измерение', () => {
    expect(sidc({ ...base, type: 'sof', echelon: 'team' })).toBe('SFFPG------A---');
  });

  it('не приписывает эшелон воздушным целям', () => {
    expect(sidc({ ...base, type: 'attackHelicopter' })).toBe('SFAPMHA--------');
  });

  it('всегда даёт 15 знаков', () => {
    for (const side of AFFILIATIONS) {
      for (const type of UNIT_TYPES) {
        for (const size of ECHELONS) {
          for (const state of STATUSES) {
            const code = sidc({
              affiliation: side.id,
              type: type.id,
              echelon: size.id,
              status: state.id,
            });
            expect(code).toMatch(/^S[FHNU][GAF][PACDX][A-Z-]{6}[A-][A-I-]-{3}$/);
            expect(code).toHaveLength(15);
          }
        }
      }
    }
  });
});

describe('unitTitle', () => {
  it('предпочитает позывной', () => {
    expect(unitTitle({ callsign: ' Альфа-1 ', type: 'infantry', echelon: 'platoon' })).toBe(
      'Альфа-1',
    );
  });

  it('без позывного называет тип и эшелон', () => {
    expect(unitTitle({ callsign: '', type: 'infantry', echelon: 'platoon' })).toBe('Пехота, взвод');
    expect(unitTitle({ callsign: '  ', type: 'armor', echelon: 'none' })).toBe('Танки');
    expect(unitTitle({ callsign: '', type: 'uav', echelon: 'platoon' })).toBe('БПЛА');
  });
});

describe('retype', () => {
  it('меняет профиль движения вслед за типом, если его не трогали', () => {
    const unit = createUnit(base, [70, 34]);
    expect(retype(unit, 'armor')).toEqual({ type: 'armor', movement: 'tracked' });
  });

  it('сохраняет профиль движения, выбранный вручную', () => {
    const unit = createUnit(base, [70, 34]);
    unit.movement = 'footLoaded';
    expect(retype(unit, 'armor')).toEqual({ type: 'armor', movement: 'footLoaded' });
  });
});

describe('создание юнитов', () => {
  it('берёт профиль движения по типу', () => {
    const tank = createUnit({ affiliation: 'hostile', type: 'armor', echelon: 'platoon' }, [70, 34]);
    expect(tank.movement).toBe('tracked');
    expect(tank.position).toEqual([70, 34]);
    expect(tank.status).toBe('present');
  });

  it('копия получает свой идентификатор и не делит дальности с оригиналом', () => {
    const original = createUnit(base, [70, 34]);
    original.ranges.push({ name: 'M240', meters: 800 });
    const copy = duplicateUnit(original, [71, 35]);

    expect(copy.id).not.toBe(original.id);
    expect(copy.position).toEqual([71, 35]);
    copy.ranges[0].meters = 1;
    expect(original.ranges[0].meters).toBe(800);
  });
});
