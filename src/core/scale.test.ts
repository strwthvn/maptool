import { describe, expect, it } from 'vitest';
import { formatDistance, metersPerPixel, scaleBar } from './scale';
import { formatLat, formatLng, wrapLng } from './coords';

describe('metersPerPixel', () => {
  it('на экваторе при нулевом зуме — окружность Земли на 512 пикселей', () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(78271.517, 2);
  });

  it('уменьшается вдвое с каждым зумом и по косинусу широты', () => {
    expect(metersPerPixel(0, 1)).toBeCloseTo(metersPerPixel(0, 0) / 2, 6);
    expect(metersPerPixel(60, 5)).toBeCloseTo(metersPerPixel(0, 5) / 2, 6);
  });
});

describe('scaleBar', () => {
  it('выбирает круглое значение, которое помещается в отведённую ширину', () => {
    expect(scaleBar(10, 120)).toEqual({ meters: 1000, px: 100 });
    expect(scaleBar(10, 60)).toEqual({ meters: 500, px: 50 });
    expect(scaleBar(10, 25)).toEqual({ meters: 200, px: 20 });
  });
});

describe('formatDistance', () => {
  it('переходит на километры с тысячи метров', () => {
    expect(formatDistance(500)).toBe('500 м');
    expect(formatDistance(1000)).toBe('1 км');
    expect(formatDistance(2500)).toBe('2,5 км');
  });
});

describe('координаты', () => {
  it('подписывает полушария', () => {
    expect(formatLat(34.43012)).toBe('34.43012° с. ш.');
    expect(formatLat(-1.5, 1)).toBe('1.5° ю. ш.');
    expect(formatLng(70.4512)).toBe('70.45120° в. д.');
    expect(formatLng(-70.4512)).toBe('70.45120° з. д.');
  });

  it('приводит долготу к диапазону ±180', () => {
    expect(wrapLng(190)).toBe(-170);
    expect(wrapLng(-190)).toBe(170);
    expect(formatLng(430.5, 1)).toBe('70.5° в. д.');
  });
});
