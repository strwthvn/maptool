import { describe, expect, it } from 'vitest';
import { angleCircle, formatAzimuth, fromAngleUnit, toAngleUnit } from './angles';
import type { LngLat } from './geodesy';
import { formatArea, formatLength, measure } from './measure';

const SQUARE: LngLat[] = [
  [70.4, 34.4],
  [70.5, 34.4],
  [70.5, 34.5],
  [70.4, 34.5],
];

describe('измерение', () => {
  it('у линии считает отрезки и общую длину', () => {
    const result = measure(SQUARE, false);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0].azimuth).toBeCloseTo(89.97, 1);
    expect(result.segments[1].azimuth).toBeCloseTo(0, 5);
    expect(result.segments[1].length).toBeCloseTo(11093.5, 0);
    expect(result.length).toBeCloseTo(
      result.segments.reduce((sum, { length }) => sum + length, 0),
      6,
    );
    expect(result.area).toBeNull();
  });

  it('у замкнутой фигуры добавляет замыкающий отрезок, периметр и площадь', () => {
    const result = measure(SQUARE, true);
    expect(result.segments).toHaveLength(4);
    expect(result.segments[3].to).toEqual(SQUARE[0]);
    expect(result.length).toBeCloseTo(40565.06, 1);
    expect(result.area! / 101939361.39).toBeCloseTo(1, 6);
  });

  it('фигуру из двух точек не замыкает', () => {
    const result = measure(SQUARE.slice(0, 2), true);
    expect(result.segments).toHaveLength(1);
    expect(result.area).toBeNull();
  });

  it('одна точка или ни одной — пустой результат', () => {
    expect(measure([], false)).toEqual({ segments: [], length: 0, area: null });
    expect(measure([SQUARE[0]], true)).toEqual({ segments: [], length: 0, area: null });
  });

  it('даёт середину отрезка для подписи', () => {
    const [lng, lat] = measure(SQUARE, false).segments[1].middle;
    expect(lng).toBeCloseTo(70.5, 9);
    expect(lat).toBeCloseTo(34.45, 4);
  });
});

describe('запись длины и площади', () => {
  it('длина: метры, потом километры', () => {
    expect(formatLength(0)).toBe('0 м');
    expect(formatLength(849.6)).toBe('850 м');
    expect(formatLength(1250)).toBe('1,25 км');
    expect(formatLength(12_345)).toBe('12,35 км');
    expect(formatLength(634_601)).toBe('634,6 км');
    expect(formatLength(1_234_567)).toBe('1\u00a0234,6 км');
  });

  it('площадь: квадратные метры, гектары, квадратные километры', () => {
    expect(formatArea(2500)).toBe('2500 м²');
    expect(formatArea(125_000)).toBe('12,5 га');
    expect(formatArea(101_939_361)).toBe('101,94 км²');
  });
});

describe('запись азимута', () => {
  it('в градусах — с десятыми', () => {
    expect(formatAzimuth(47.26, 'deg')).toBe('47,3°');
    expect(formatAzimuth(0, 'deg')).toBe('0,0°');
    expect(formatAzimuth(359.97, 'deg')).toBe('0,0°');
    expect(formatAzimuth(-90, 'deg')).toBe('270,0°');
  });

  it('в тысячных НАТО — четыре цифры', () => {
    expect(formatAzimuth(90, 'mil6400')).toBe('1600 тыс.');
    expect(formatAzimuth(47.26, 'mil6400')).toBe('0840 тыс.');
    expect(formatAzimuth(359.99, 'mil6400')).toBe('0000 тыс.');
  });

  it('в советских тысячных — большие и малые деления угломера', () => {
    expect(formatAzimuth(90, 'mil6000')).toBe('15-00');
    expect(formatAzimuth(47.26, 'mil6000')).toBe('7-88');
    expect(formatAzimuth(180, 'mil6000')).toBe('30-00');
    expect(formatAzimuth(0.3, 'mil6000')).toBe('0-05');
  });
});

describe('углы числом', () => {
  it('переводит градусы в выбранные единицы и обратно', () => {
    expect(toAngleUnit(90, 'deg')).toBe(90);
    expect(toAngleUnit(47.26, 'deg')).toBe(47.3);
    expect(toAngleUnit(90, 'mil6400')).toBe(1600);
    expect(toAngleUnit(200, 'mil6000')).toBe(3333);
    expect(fromAngleUnit(1600, 'mil6400')).toBe(90);
    expect(fromAngleUnit(1500, 'mil6000')).toBe(90);
    expect(fromAngleUnit(45.5, 'deg')).toBe(45.5);
  });

  it('знает, сколько единиц в круге', () => {
    expect(angleCircle('deg')).toBe(360);
    expect(angleCircle('mil6400')).toBe(6400);
    expect(angleCircle('mil6000')).toBe(6000);
  });
});
