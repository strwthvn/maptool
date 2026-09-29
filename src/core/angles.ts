/** Единицы измерения углов: градусы и тысячные двух систем. */

import { normalizeAzimuth } from './geodesy';

export type AngleUnit = 'deg' | 'mil6400' | 'mil6000';

export const ANGLE_UNITS: { id: AngleUnit; label: string }[] = [
  { id: 'deg', label: 'Градусы' },
  { id: 'mil6400', label: 'Тысячные НАТО, 6400 в круге' },
  { id: 'mil6000', label: 'Тысячные советские, 6000 в круге' },
];

export function isAngleUnit(value: unknown): value is AngleUnit {
  return ANGLE_UNITS.some((unit) => unit.id === value);
}

/** Сколько единиц в полном круге. */
export function angleCircle(unit: AngleUnit): number {
  if (unit === 'mil6400') return 6400;
  return unit === 'mil6000' ? 6000 : 360;
}

/** Обозначение единицы после числа. */
export function angleSuffix(unit: AngleUnit): string {
  return unit === 'deg' ? '°' : 'тыс.';
}

/** Угол числом в выбранных единицах: градусы с десятыми, тысячные целые. */
export function toAngleUnit(degrees: number, unit: AngleUnit): number {
  const value = (degrees / 360) * angleCircle(unit);
  return unit === 'deg' ? Math.round(value * 10) / 10 : Math.round(value);
}

export function fromAngleUnit(value: number, unit: AngleUnit): number {
  return (value / angleCircle(unit)) * 360;
}

function mils(degrees: number, circle: number): number {
  return Math.round((normalizeAzimuth(degrees) / 360) * circle) % circle;
}

/**
 * Запись азимута: «47,3°», «0841 тыс.» или «7-88».
 * Советские тысячные пишутся через дефис: большие деления угломера и малые.
 */
export function formatAzimuth(degrees: number, unit: AngleUnit): string {
  if (unit === 'mil6400') return `${String(mils(degrees, 6400)).padStart(4, '0')} тыс.`;
  if (unit === 'mil6000') {
    const value = mils(degrees, 6000);
    return `${Math.floor(value / 100)}-${String(value % 100).padStart(2, '0')}`;
  }
  const tenths = Math.round(normalizeAzimuth(degrees) * 10) % 3600;
  return `${(tenths / 10).toFixed(1).replace('.', ',')}°`;
}
