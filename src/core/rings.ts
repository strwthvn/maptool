/** Кольца вокруг фишки: дальности оружия и досягаемость за ход. */

import { destination, type LngLat } from './geodesy';
import { formatLength } from './measure';
import type { MovementSpeeds, Surface } from './movement';
import type { WeaponRange } from './units';

export type RingKind = 'weapon' | 'reach';

export interface Ring {
  kind: RingKind;
  /** Радиус, м. */
  radius: number;
  /** Подпись на карте: короткая, рядом с другими кольцами места мало. */
  label: string;
}

/** Кольца крупнее на карте не рисуются: это уже не окрестность фишки. */
export const RING_MAX = 1_000_000;

/** Шаг, с которым окружность заменяется ломаной, градусы. */
const ARC_STEP = 3;

/**
 * Где на кольце стоит подпись, азимут от центра. Оружие подписано сверху, досягаемость снизу.
 * Одинокое кольцо подписано посередине, соседние — слева и справа: их подписи расходятся
 * в разные стороны и не ложатся друг на друга.
 */
const LABEL_AZIMUTHS: Record<RingKind, { alone: number; among: number[] }> = {
  weapon: { alone: 0, among: [315, 45, 0] },
  reach: { alone: 180, among: [225, 135, 180] },
};

const SURFACE: Record<Surface, { name: string; by: string }> = {
  road: { name: 'дорога', by: 'дороге' },
  track: { name: 'грунтовка', by: 'грунтовке' },
  offroad: { name: 'бездорожье', by: 'бездорожью' },
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function drawable(radius: number): boolean {
  return Number.isFinite(radius) && radius > 0 && radius <= RING_MAX;
}

function list(words: string[]): string {
  if (words.length < 2) return words.join('');
  return `${words.slice(0, -1).join(', ')} и ${words[words.length - 1]}`;
}

/** Кольца дальности оружия, от ближнего к дальнему. Оружие с одной дальностью делит кольцо. */
export function weaponRings(ranges: WeaponRange[]): Ring[] {
  const names = new Map<number, string[]>();
  for (const { name, meters } of ranges) {
    if (!drawable(meters)) continue;
    const known = names.get(meters) ?? [];
    if (name.trim()) known.push(name.trim());
    names.set(meters, known);
  }
  return [...names]
    .sort(([a], [b]) => a - b)
    .map(([radius, owners]) => ({
      kind: 'weapon',
      radius,
      label: [owners.join(', '), formatLength(radius)].filter(Boolean).join(' · '),
    }));
}

/** Сколько фишка пройдёт за ход по ровному месту и по каким покрытиям, от меньшего к большему. */
function reaches(
  speeds: MovementSpeeds,
  turnMinutes: number,
): { radius: number; surfaces: Surface[] }[] {
  const surfaces = new Map<number, Surface[]>();
  for (const surface of ['road', 'track', 'offroad'] as const) {
    const radius = (speeds[surface] * 1000 * turnMinutes) / 60;
    if (!drawable(radius)) continue;
    surfaces.set(radius, [...(surfaces.get(radius) ?? []), surface]);
  }
  return [...surfaces].sort(([a], [b]) => a - b).map(([radius, where]) => ({ radius, surfaces: where }));
}

/**
 * Кольца досягаемости за ход. Это круги: рельеф и препятствия внутри них не учитываются.
 */
export function reachRings(speeds: MovementSpeeds, turnMinutes: number): Ring[] {
  return reaches(speeds, turnMinutes).map(({ radius, surfaces }) => {
    const everywhere = surfaces.length === 3;
    const place = everywhere ? 'За ход' : capitalize(surfaces.map((id) => SURFACE[id].name).join(', '));
    return { kind: 'reach', radius, label: `${place} · ${formatLength(radius)}` };
  });
}

/** Досягаемость за ход одной строкой: «667 м по дороге и грунтовке, 500 м по бездорожью». */
export function describeReach(speeds: MovementSpeeds, turnMinutes: number): string {
  return reaches(speeds, turnMinutes)
    .reverse()
    .map(({ radius, surfaces }) => {
      const length = formatLength(radius);
      if (surfaces.length === 3) return length;
      return `${length} по ${list(surfaces.map((id) => SURFACE[id].by))}`;
    })
    .join(', ');
}

/** Окружность на местности: замкнутая ломаная, первая точка повторена в конце. */
export function ringPath(center: LngLat, radius: number): LngLat[] {
  const path: LngLat[] = [];
  for (let azimuth = 0; azimuth < 360; azimuth += ARC_STEP) {
    path.push(destination(center, azimuth, radius));
  }
  path.push(path[0]);
  return path;
}

/** Азимут подписи кольца, которое идёт `index`-м из `count` колец своего вида у этой фишки. */
export function ringLabelAzimuth(kind: RingKind, index = 0, count = 1): number {
  const { alone, among } = LABEL_AZIMUTHS[kind];
  return count <= 1 ? alone : among[index % among.length];
}

export function ringLabelAt(
  center: LngLat,
  ring: Pick<Ring, 'kind' | 'radius'>,
  index = 0,
  count = 1,
): LngLat {
  return destination(center, ringLabelAzimuth(ring.kind, index, count), ring.radius);
}
