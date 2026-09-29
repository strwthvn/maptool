/** Координаты MGRS поверх UTM: зона и пояс, квадрат 100 км, метры внутри квадрата. */

import type { LngLat } from './geodesy';
import {
  bandIndexOf,
  bandLetter,
  bandLimits,
  fromUtm,
  isSouthBand,
  toUtm,
  utmZone,
  type Utm,
} from './utm';

export const SQUARE = 100_000;

/** Буквы столбцов квадратов чередуются по зонам с периодом 3. */
const COLUMNS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];

/** Буквы рядов повторяются каждые 2000 км; в чётных зонах отсчёт сдвинут на пять букв. */
const ROWS = 'ABCDEFGHJKLMNPQRSTUV';
const ROW_CYCLE = ROWS.length * SQUARE;
const EVEN_ZONE_SHIFT = 5;

export interface Mgrs {
  zone: number;
  band: string;
  /** Две буквы квадрата 100 км. */
  square: string;
  /** Метры внутри квадрата, от 0 до 99 999. */
  easting: number;
  northing: number;
}

export function columnLetter(zone: number, easting: number): string {
  const index = Math.floor(easting / SQUARE) - 1;
  return COLUMNS[(zone - 1) % 3][index] ?? '?';
}

export function rowLetter(zone: number, northing: number): string {
  const shift = zone % 2 === 0 ? EVEN_ZONE_SHIFT : 0;
  const index = (Math.floor(northing / SQUARE) + shift) % ROWS.length;
  return ROWS[(index + ROWS.length) % ROWS.length];
}

export function squareId(zone: number, easting: number, northing: number): string {
  return columnLetter(zone, easting) + rowLetter(zone, northing);
}

export function utmToMgrs(utm: Utm, lat: number): Mgrs {
  // Метры отбрасываются, а не округляются: координата называет квадрат, в котором лежит точка.
  const easting = Math.floor(utm.easting);
  const northing = Math.floor(utm.northing);
  return {
    zone: utm.zone,
    band: bandLetter(lat),
    square: squareId(utm.zone, easting, northing),
    easting: easting % SQUARE,
    northing: northing % SQUARE,
  };
}

export function toMgrs(lng: number, lat: number): Mgrs {
  return utmToMgrs(toUtm(lng, lat, utmZone(lng, lat)), lat);
}

/**
 * Запись координаты. `digits` — число цифр в каждой половине:
 * 5 — с точностью до метра, 3 — до 100 м, 0 — только квадрат.
 */
export function formatMgrs(mgrs: Mgrs, digits = 5): string {
  const head = `${mgrs.zone}${mgrs.band} ${mgrs.square}`;
  if (digits === 0) return head;
  const part = (value: number) =>
    String(Math.floor(value / 10 ** (5 - digits))).padStart(digits, '0');
  return `${head} ${part(mgrs.easting)} ${part(mgrs.northing)}`;
}

/** Юго-западный угол квадрата, который называет координата. */
export function mgrsToUtm(mgrs: Mgrs): Utm | null {
  const column = COLUMNS[(mgrs.zone - 1) % 3].indexOf(mgrs.square[0]);
  const row = ROWS.indexOf(mgrs.square[1]);
  const band = bandIndexOf(mgrs.band);
  if (column < 0 || row < 0 || band < 0 || mgrs.zone < 1 || mgrs.zone > 60) return null;

  const south = isSouthBand(band);
  const shift = mgrs.zone % 2 === 0 ? EVEN_ZONE_SHIFT : 0;
  const easting = (column + 1) * SQUARE + mgrs.easting;
  const inCycle = ((row - shift + ROWS.length) % ROWS.length) * SQUARE + mgrs.northing;

  // Буква ряда задаёт северную координату с точностью до 2000 км. Из возможных значений
  // подходит то, что попадает в широтный пояс или лежит к нему ближе всего.
  const [bandSouth, bandNorth] = bandLimits(band);
  let best: Utm | null = null;
  let bestMiss = Infinity;
  for (let northing = inCycle; northing < 10_000_000; northing += ROW_CYCLE) {
    const candidate: Utm = { zone: mgrs.zone, south, easting, northing };
    const lat = fromUtm(candidate)[1];
    const miss = Math.max(0, bandSouth - lat, lat - bandNorth);
    if (miss < bestMiss) {
      best = candidate;
      bestMiss = miss;
    }
  }
  return best;
}

/**
 * Точка по координате MGRS: центр квадрата, размер которого задан точностью `digits`.
 * Центр, а не угол, чтобы точка при обратном пересчёте давала ту же запись.
 */
export function fromMgrs(mgrs: Mgrs, digits = 5): LngLat | null {
  const corner = mgrsToUtm(mgrs);
  if (!corner) return null;
  const half = 10 ** (5 - digits) / 2;
  return fromUtm({ ...corner, easting: corner.easting + half, northing: corner.northing + half });
}
