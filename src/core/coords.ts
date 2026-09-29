/** Форматы координат: запись для показа и разбор введённого текста. */

import { wrapLng, type LngLat } from './geodesy';
import { formatMgrs, fromMgrs, toMgrs } from './mgrs';
import { bandIndexOf, bandLimits, fromUtm, inUtmRange, isSouthBand, toUtm, bandLetter } from './utm';

export { wrapLng };

export type CoordFormat = 'dd' | 'dms' | 'mgrs' | 'utm';

export const COORD_FORMATS: { id: CoordFormat; label: string }[] = [
  { id: 'dd', label: 'Градусы' },
  { id: 'dms', label: 'Градусы, минуты, секунды' },
  { id: 'mgrs', label: 'MGRS' },
  { id: 'utm', label: 'UTM' },
];

export function isCoordFormat(value: unknown): value is CoordFormat {
  return COORD_FORMATS.some((format) => format.id === value);
}

export function formatLat(lat: number, digits = 5): string {
  return `${Math.abs(lat).toFixed(digits)}° ${lat < 0 ? 'ю. ш.' : 'с. ш.'}`;
}

export function formatLng(lng: number, digits = 5): string {
  const wrapped = wrapLng(lng);
  return `${Math.abs(wrapped).toFixed(digits)}° ${wrapped < 0 ? 'з. д.' : 'в. д.'}`;
}

/** Градусы, минуты и секунды с десятыми долями секунды (около трёх метров на местности). */
function dms(value: number): string {
  const tenths = Math.round(Math.abs(value) * 36000);
  const degrees = Math.floor(tenths / 36000);
  const minutes = Math.floor((tenths % 36000) / 600);
  const seconds = ((tenths % 600) / 10).toFixed(1);
  return `${degrees}°${String(minutes).padStart(2, '0')}′${seconds.padStart(4, '0')}″`;
}

export function formatLatDms(lat: number): string {
  return `${dms(lat)} ${lat < 0 ? 'ю. ш.' : 'с. ш.'}`;
}

export function formatLngDms(lng: number): string {
  const wrapped = wrapLng(lng);
  return `${dms(wrapped)} ${wrapped < 0 ? 'з. д.' : 'в. д.'}`;
}

export function formatUtm(lng: number, lat: number): string {
  const utm = toUtm(lng, lat);
  // Метры отбрасываются, как и в MGRS, чтобы две записи одной точки сходились цифра в цифру.
  return `${utm.zone}${bandLetter(lat)} ${Math.floor(utm.easting)} ${Math.floor(utm.northing)}`;
}

/**
 * Координаты точки по частям: широта и долгота отдельно, MGRS и UTM — одной строкой.
 * У полюсов, где UTM и MGRS не определены, возвращаются градусы.
 */
export function positionParts(lng: number, lat: number, format: CoordFormat): string[] {
  if (format === 'dms') return [formatLatDms(lat), formatLngDms(lng)];
  if (format !== 'dd' && inUtmRange(lat)) {
    return [format === 'mgrs' ? formatMgrs(toMgrs(lng, lat)) : formatUtm(lng, lat)];
  }
  return [formatLat(lat), formatLng(lng)];
}

export function formatPosition(lng: number, lat: number, format: CoordFormat): string {
  return positionParts(lng, lat, format).join(', ');
}

const MGRS_LIKE = /^\d{1,2}\s*[A-Z]\s*[A-Z]{2}/;
const MGRS = /^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d*)$/;
const UTM_LIKE = /^\d{1,2}\s*[A-Z]\s+\d{4,}/;
const UTM = /^(\d{1,2})\s*([C-HJ-NP-X])\s+(\d{6}(?:[.,]\d+)?)\s+(\d{1,8}(?:[.,]\d+)?)$/;
const LAT_LNG_CHARS = /^[\d\s.,;:+\-°'"′″ʹʺ’”NSEW]+$/;
const LAT_LNG_TOKEN = /([NSEW])|([-+]?\d+(?:[.,]\d+)?)/g;

/** Насколько точка может выходить за свой широтный пояс, градусы: квадраты на границе поясов общие. */
const BAND_TOLERANCE = 1;

function number(text: string): number {
  return Number(text.replace(',', '.'));
}

function normalize(text: string): string {
  return text
    .trim()
    .toUpperCase()
    .replace(/С\.?\s*Ш\.?/g, 'N')
    .replace(/Ю\.?\s*Ш\.?/g, 'S')
    .replace(/В\.?\s*Д\.?/g, 'E')
    .replace(/З\.?\s*Д\.?/g, 'W');
}

function parseMgrs(input: string): LngLat {
  const match = MGRS.exec(input.replace(/\s+/g, ''));
  if (!match) throw new Error('Это похоже на MGRS, но запись неполная. Пример: 42S XD 33301 10900.');
  const [, zone, band, square, digits] = match;
  if (digits.length % 2 !== 0 || digits.length > 10) {
    throw new Error('В MGRS цифр поровну на восток и на север, не больше пяти на каждую.');
  }

  const half = digits.length / 2;
  const scale = 10 ** (5 - half);
  const point = fromMgrs(
    {
      zone: Number(zone),
      band,
      square,
      easting: half ? Number(digits.slice(0, half)) * scale : 0,
      northing: half ? Number(digits.slice(half)) * scale : 0,
    },
    half,
  );
  if (!point) throw new Error(`В зоне ${Number(zone)} нет квадрата ${square}.`);

  const [south, north] = bandLimits(bandIndexOf(band));
  if (point[1] < south - BAND_TOLERANCE || point[1] > north + BAND_TOLERANCE) {
    throw new Error(`В поясе ${band} зоны ${Number(zone)} нет квадрата ${square}.`);
  }
  return point;
}

function parseUtm(input: string): LngLat {
  const match = UTM.exec(input);
  if (!match) throw new Error('Это похоже на UTM, но запись неполная. Пример: 42S 433301 3810900.');
  const zone = Number(match[1]);
  const easting = number(match[3]);
  const northing = number(match[4]);
  if (zone < 1 || zone > 60) throw new Error('Зоны UTM нумеруются от 1 до 60.');
  if (northing > 10_000_000) throw new Error('Северная координата UTM не бывает больше 10 000 000 м.');
  return fromUtm({ zone, south: isSouthBand(bandIndexOf(match[2])), easting, northing });
}

function parseLatLng(input: string): LngLat {
  if (!LAT_LNG_CHARS.test(input)) throw new Error('Не удалось разобрать координаты.');

  const letters: string[] = [];
  const numbers: string[] = [];
  for (const [, letter, value] of input.matchAll(LAT_LNG_TOKEN)) {
    if (letter) letters.push(letter);
    else numbers.push(value);
  }

  if (numbers.length !== 2 && numbers.length !== 4 && numbers.length !== 6) {
    throw new Error('Нужны две координаты: широта и долгота.');
  }
  const vertical = letters.filter((letter) => letter === 'N' || letter === 'S');
  const horizontal = letters.filter((letter) => letter === 'E' || letter === 'W');
  if (letters.length > 0 && (vertical.length !== 1 || horizontal.length !== 1)) {
    throw new Error('Укажите полушарие для обеих координат или не указывайте вовсе.');
  }

  const size = numbers.length / 2;
  const value = (parts: string[], negative: boolean) => {
    const [degrees, minutes = 0, seconds = 0] = parts.map((part) => Math.abs(number(part)));
    if (minutes >= 60 || seconds >= 60) throw new Error('Минут и секунд не бывает больше 60.');
    const sign = negative || parts[0].startsWith('-') ? -1 : 1;
    return sign * (degrees + minutes / 60 + seconds / 3600);
  };

  const latFirst = letters.length === 0 || letters[0] === 'N' || letters[0] === 'S';
  const first = numbers.slice(0, size);
  const second = numbers.slice(size);
  const lat = value(latFirst ? first : second, vertical[0] === 'S');
  const lng = value(latFirst ? second : first, horizontal[0] === 'W');

  if (Math.abs(lat) > 90) throw new Error('Широта не бывает больше 90°.');
  if (Math.abs(lng) > 360) throw new Error('Долгота не бывает больше 180°.');
  return [wrapLng(lng), lat];
}

/**
 * Точка по введённому тексту: широта и долгота (десятичные или с минутами и секундами),
 * MGRS или UTM. Если текст не разобрать, бросает ошибку с объяснением для пользователя.
 */
export function parsePosition(text: string): LngLat {
  const input = normalize(text);
  if (!input) throw new Error('Введите координаты.');
  if (MGRS_LIKE.test(input)) return parseMgrs(input);
  if (UTM_LIKE.test(input)) return parseUtm(input);
  return parseLatLng(input);
}
