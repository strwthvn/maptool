import { describe, expect, it } from 'vitest';
import {
  clampTurn,
  clampTurnNumber,
  clockMoment,
  defaultClock,
  formatElapsed,
  formatMoment,
  readClock,
  readStart,
} from './clock';

describe('начало сценария', () => {
  it('принимает дату со временем', () => {
    expect(readStart('2003-06-14T05:30')).toBe('2003-06-14T05:30');
    expect(readStart('2003-06-14T05:30:00.000Z')).toBe('2003-06-14T05:30');
  });

  it('отвергает то, чего в календаре нет', () => {
    expect(readStart('2003-02-30T05:30')).toBeNull();
    expect(readStart('2003-06-14T24:10')).toBeNull();
    expect(readStart('14.06.2003 05:30')).toBeNull();
    expect(readStart('')).toBeNull();
    expect(readStart(20030614)).toBeNull();
  });
});

describe('время хода', () => {
  const clock = { start: '2003-06-14T05:30', turnMinutes: 10 };

  it('считается от начала сценария', () => {
    expect(formatMoment(clock, 0)).toBe('14.06.2003 05:30');
    expect(formatMoment(clock, 3)).toBe('14.06.2003 06:00');
    expect(clockMoment(clock, 9)).toEqual({ date: '14.06.2003', time: '07:00' });
  });

  it('переходит через полночь, месяц и год', () => {
    expect(formatMoment(clock, 111)).toBe('15.06.2003 00:00');
    expect(formatMoment({ start: '2004-02-28T23:50', turnMinutes: 10 }, 1)).toBe('29.02.2004 00:00');
    expect(formatMoment({ start: '2003-12-31T23:00', turnMinutes: 60 }, 1)).toBe('01.01.2004 00:00');
  });

  it('не знает летнего времени: сутки всегда 24 часа', () => {
    expect(formatMoment({ start: '2003-03-29T12:00', turnMinutes: 1440 }, 2)).toBe('31.03.2003 12:00');
  });

  it('дробный ход даёт время с точностью до минуты', () => {
    expect(formatMoment(clock, 1.26)).toBe('14.06.2003 05:43');
  });

  it('без начала сценария показывает время от начала', () => {
    expect(formatMoment({ start: null, turnMinutes: 10 }, 3)).toBe('+0:30');
    expect(formatMoment({ start: null, turnMinutes: 10 }, 157)).toBe('+26:10');
    expect(formatElapsed(0)).toBe('+0:00');
  });
});

describe('часы из файла', () => {
  it('чинятся при чтении', () => {
    expect(readClock(null)).toEqual(defaultClock());
    expect(readClock({ turnMinutes: 15 })).toEqual({ ...defaultClock(), turnMinutes: 15 });
    expect(readClock({ start: 'вчера', turnMinutes: 0, turn: -4, follow: 'да' })).toEqual({
      start: null,
      turnMinutes: 1,
      turn: 0,
      follow: false,
    });
    expect(readClock({ start: '2003-06-14T05:30', turnMinutes: 5, turn: 12.4, follow: true })).toEqual({
      start: '2003-06-14T05:30',
      turnMinutes: 5,
      turn: 12,
      follow: true,
    });
  });

  it('держат длину и номер хода в пределах', () => {
    expect(clampTurn(0)).toBe(1);
    expect(clampTurn(12.4)).toBe(12);
    expect(clampTurn(1e6)).toBe(1440);
    expect(clampTurnNumber(-1)).toBe(0);
    expect(clampTurnNumber(1e9)).toBe(9999);
  });
});
