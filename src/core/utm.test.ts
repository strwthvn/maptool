import { describe, expect, it } from 'vitest';
import { formatMgrs, fromMgrs, squareId, toMgrs } from './mgrs';
import { bandLetter, fromUtm, toUtm, utmZone, zoneCell } from './utm';

// Эталонные значения получены в proj4 и в библиотеке mgrs.

describe('UTM', () => {
  it('пересчитывает широту и долготу в метры зоны', () => {
    const utm = toUtm(70.45, 34.43);
    expect(utm.zone).toBe(42);
    expect(utm.south).toBe(false);
    expect(utm.easting).toBeCloseTo(633231.0421, 3);
    expect(utm.northing).toBeCloseTo(3810788.5007, 3);
  });

  it('в южном полушарии отсчитывает север от 10 000 км', () => {
    const utm = toUtm(151.2, -33.87);
    expect(utm.zone).toBe(56);
    expect(utm.south).toBe(true);
    expect(Math.floor(utm.easting)).toBe(333510);
    expect(Math.floor(utm.northing)).toBe(6250800);
  });

  it('на осевом меридиане даёт 500 км', () => {
    expect(toUtm(69, 34).easting).toBeCloseTo(500000, 6);
  });

  it('пересчитывает обратно без потерь', () => {
    for (const [lng, lat] of [
      [70.45, 34.43],
      [151.2, -33.87],
      [-0.1276, 51.5072],
      [-68.3, -54.8],
      [179.99, 83.9],
    ]) {
      const [backLng, backLat] = fromUtm(toUtm(lng, lat));
      expect(backLng).toBeCloseTo(lng, 9);
      expect(backLat).toBeCloseTo(lat, 9);
    }
  });

  it('умеет считать в соседней зоне', () => {
    const own = toUtm(72.1, 34);
    const neighbour = toUtm(72.1, 34, 42);
    expect(own.zone).toBe(43);
    expect(neighbour.easting).toBeGreaterThan(780000);
    expect(fromUtm(neighbour)[0]).toBeCloseTo(72.1, 9);
  });
});

describe('зоны и пояса', () => {
  it('делит мир на зоны по шесть градусов', () => {
    expect(utmZone(-180, 0)).toBe(1);
    expect(utmZone(-0.1, 51)).toBe(30);
    expect(utmZone(0, 51)).toBe(31);
    expect(utmZone(179.9, 0)).toBe(60);
    expect(utmZone(180, 0)).toBe(1);
  });

  it('знает расширенную зону у Норвегии', () => {
    expect(utmZone(5.32, 60.39)).toBe(32);
    expect(utmZone(2.9, 60.39)).toBe(31);
    expect(utmZone(5.32, 55.9)).toBe(31);
  });

  it('знает расширенные зоны у Шпицбергена', () => {
    expect(utmZone(8.9, 78)).toBe(31);
    expect(utmZone(15.6, 78.2)).toBe(33);
    expect(utmZone(25, 78)).toBe(35);
    expect(utmZone(40, 78)).toBe(37);
  });

  it('обозначает пояса буквами без I и O, пояс X тянется до 84°', () => {
    expect(bandLetter(-80)).toBe('C');
    expect(bandLetter(-0.1)).toBe('M');
    expect(bandLetter(0)).toBe('N');
    expect(bandLetter(34.43)).toBe('S');
    expect(bandLetter(72)).toBe('X');
    expect(bandLetter(84)).toBe('X');
  });

  it('даёт границы ячейки', () => {
    expect(zoneCell(42, 14)).toEqual({ west: 66, east: 72, south: 32, north: 40 });
    expect(zoneCell(32, 17)).toEqual({ west: 3, east: 12, south: 56, north: 64 });
    expect(zoneCell(31, 17)).toEqual({ west: 0, east: 3, south: 56, north: 64 });
    expect(zoneCell(33, 19)).toEqual({ west: 9, east: 21, south: 72, north: 84 });
    expect(zoneCell(34, 19)).toBeNull();
  });
});

describe('MGRS', () => {
  const at = (lng: number, lat: number, digits?: number) => formatMgrs(toMgrs(lng, lat), digits);

  it('совпадает с эталоном', () => {
    expect(at(70.45, 34.43)).toBe('42S XD 33231 10788');
    expect(at(5.32, 60.39)).toBe('32V KN 97230 00510');
    expect(at(15.6, 78.2)).toBe('33X WG 13696 80760');
    expect(at(151.2, -33.87)).toBe('56H LH 33510 50800');
  });

  it('сокращает запись отбрасыванием цифр', () => {
    expect(at(70.45, 34.43, 3)).toBe('42S XD 332 107');
    expect(at(70.45, 34.43, 1)).toBe('42S XD 3 1');
    expect(at(70.45, 34.43, 0)).toBe('42S XD');
  });

  it('называет квадрат по зоне и метрам', () => {
    expect(squareId(42, 633231, 3810788)).toBe('XD');
    expect(squareId(56, 333510, 6250800)).toBe('LH');
  });

  it('возвращает центр квадрата заданной точности', () => {
    const [lng, lat] = fromMgrs(
      { zone: 42, band: 'S', square: 'XD', easting: 33000, northing: 10000 },
      2,
    )!;
    const utm = toUtm(lng, lat);
    expect(utm.easting).toBeCloseTo(633500, 3);
    expect(utm.northing).toBeCloseTo(3810500, 3);
  });

  it('восстанавливает точку в пределах метра', () => {
    for (const [lng, lat] of [
      [70.45, 34.43],
      [151.2, -33.87],
      [5.32, 60.39],
      [-68.3, -54.8],
      [15.6, 78.2],
      [-179.99, -79.9],
    ]) {
      const [backLng, backLat] = fromMgrs(toMgrs(lng, lat))!;
      expect(backLng).toBeCloseTo(lng, 4);
      expect(backLat).toBeCloseTo(lat, 4);
    }
  });

  it('не принимает квадрат, которого в зоне нет', () => {
    expect(fromMgrs({ zone: 42, band: 'S', square: 'AD', easting: 0, northing: 0 })).toBeNull();
  });
});
