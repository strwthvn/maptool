import { describe, expect, it } from 'vitest';
import { formatPosition, parsePosition, positionParts } from './coords';

describe('запись координат', () => {
  it('поддерживает четыре формата', () => {
    expect(formatPosition(70.45, 34.43, 'dd')).toBe('34.43000° с. ш., 70.45000° в. д.');
    expect(formatPosition(70.45, 34.43, 'dms')).toBe('34°25′48.0″ с. ш., 70°27′00.0″ в. д.');
    expect(formatPosition(70.45, 34.43, 'mgrs')).toBe('42S XD 33231 10788');
    expect(formatPosition(70.45, 34.43, 'utm')).toBe('42S 633231 3810788');
  });

  it('пишет южное и западное полушария', () => {
    expect(formatPosition(-68.3, -54.8, 'dms')).toBe('54°48′00.0″ ю. ш., 68°18′00.0″ з. д.');
  });

  it('переносит округление секунд в минуты и градусы', () => {
    expect(positionParts(0, 34.999999, 'dms')[0]).toBe('35°00′00.0″ с. ш.');
  });

  it('у полюсов вместо MGRS и UTM показывает градусы', () => {
    expect(formatPosition(10, 88, 'mgrs')).toBe('88.00000° с. ш., 10.00000° в. д.');
    expect(formatPosition(10, -85, 'utm')).toBe('85.00000° ю. ш., 10.00000° в. д.');
  });
});

describe('разбор координат', () => {
  const near = (text: string, lng: number, lat: number, digits = 5) => {
    const [parsedLng, parsedLat] = parsePosition(text);
    expect(parsedLng).toBeCloseTo(lng, digits);
    expect(parsedLat).toBeCloseTo(lat, digits);
  };

  it('понимает десятичные градусы: сначала широта, потом долгота', () => {
    near('34.43 70.45', 70.45, 34.43);
    near('34.43, 70.45', 70.45, 34.43);
    near('34.43,70.45', 70.45, 34.43);
    near('34,43 70,45', 70.45, 34.43);
    near('34,43; 70,45', 70.45, 34.43);
    near('-33.87 151.2', 151.2, -33.87);
  });

  it('понимает полушария, в том числе в обратном порядке', () => {
    near('34.43 N 70.45 E', 70.45, 34.43);
    near('N34.43 E70.45', 70.45, 34.43);
    near('70.45E 34.43N', 70.45, 34.43);
    near('33.87 S, 151.2 E', 151.2, -33.87);
    near('54.8° ю. ш., 68.3° з. д.', -68.3, -54.8);
    near('34.43 с.ш. 70.45 в.д.', 70.45, 34.43);
  });

  it('понимает минуты и секунды', () => {
    near('34°25′48″ N 70°27′00″ E', 70.45, 34.43);
    near(`34°25'48" 70°27'0"`, 70.45, 34.43);
    near('34 25 48 70 27 0', 70.45, 34.43);
    near('34°25.8′ 70°27′', 70.45, 34.43);
    near('34-25-48 N 70-27-00 E', 70.45, 34.43);
    near('33°52′12″ ю. ш., 151°12′00″ в. д.', 151.2, -33.87);
  });

  it('понимает MGRS с пробелами и без, любой точности', () => {
    near('42S XD 33231 10788', 70.45, 34.43, 4);
    near('42sxd3323110788', 70.45, 34.43, 4);
    near('42S XD 332 107', 70.45, 34.43, 2);
    near('56H LH 33510 50800', 151.2, -33.87, 4);
    const [lng, lat] = parsePosition('42S XD');
    expect(lng).toBeGreaterThan(70);
    expect(lng).toBeLessThan(71.3);
    expect(lat).toBeGreaterThan(34.3);
    expect(lat).toBeLessThan(35.3);
  });

  it('понимает UTM', () => {
    near('42S 633231 3810788', 70.45, 34.43, 4);
    near('42 S 633231,04 3810788,5', 70.45, 34.43, 5);
    near('56H 333510 6250800', 151.2, -33.87, 4);
  });

  it('разбирает собственную запись во всех форматах', () => {
    for (const format of ['dd', 'dms', 'mgrs', 'utm'] as const) {
      near(formatPosition(70.45123, 34.43456, format), 70.45123, 34.43456, 4);
      near(formatPosition(-68.30321, -54.80654, format), -68.30321, -54.80654, 4);
    }
  });

  it('приводит долготу к ±180°', () => {
    near('10 190', -170, 10);
  });

  it('объясняет, что не так', () => {
    expect(() => parsePosition('')).toThrow('Введите координаты.');
    expect(() => parsePosition('34.43')).toThrow('Нужны две координаты');
    expect(() => parsePosition('34,70')).toThrow('Нужны две координаты');
    expect(() => parsePosition('Джелалабад')).toThrow('Не удалось разобрать');
    expect(() => parsePosition('95 70')).toThrow('Широта не бывает больше 90°');
    expect(() => parsePosition('34 N 70')).toThrow('Укажите полушарие');
    expect(() => parsePosition('34°70′ 70°')).toThrow('Нужны две координаты');
    expect(() => parsePosition('34°70′ 70°10′')).toThrow('Минут и секунд');
    expect(() => parsePosition('42S XD 332 10')).toThrow('цифр поровну');
    expect(() => parsePosition('42S AD 33231 10788')).toThrow('нет квадрата AD');
    expect(() => parsePosition('42S XP 33231 10788')).toThrow('В поясе S');
    expect(() => parsePosition('42S XI 1 1')).toThrow('похоже на MGRS');
    expect(() => parsePosition('42S 6332 3810788')).toThrow('похоже на UTM');
    expect(() => parsePosition('61S 633231 3810788')).toThrow('от 1 до 60');
  });
});
