/** Профили движения: скорости по покрытиям и зависимость скорости от уклона. */

export type MovementProfileId = 'foot' | 'footLoaded' | 'wheeled' | 'tracked' | 'air';

export type Surface = 'road' | 'track' | 'offroad';

export const SURFACES: { id: Surface; label: string }[] = [
  { id: 'road', label: 'Дорога' },
  { id: 'track', label: 'Грунтовка' },
  { id: 'offroad', label: 'Бездорожье' },
];

export function isSurface(value: unknown): value is Surface {
  return SURFACES.some((surface) => surface.id === value);
}

/** Скорости на ровном месте, км/ч, и предельный уклон, градусы. */
export interface MovementSpeeds {
  road: number;
  track: number;
  offroad: number;
  /** null — рельеф не ограничивает движение. */
  maxSlope: number | null;
}

/** Как уклон меняет скорость: пешком, на технике или никак. */
export type SlopeLaw = 'tobler' | 'linear' | 'none';

export interface MovementProfile extends MovementSpeeds {
  id: MovementProfileId;
  label: string;
  slope: SlopeLaw;
}

/** Скорости, которые пользователь поменял в сценарии. */
export type ProfileOverrides = Partial<Record<MovementProfileId, MovementSpeeds>>;

export const MOVEMENT_PROFILES: MovementProfile[] = [
  { id: 'foot', label: 'Пехота', slope: 'tobler', road: 4, track: 4, offroad: 3, maxSlope: 35 },
  {
    id: 'footLoaded',
    label: 'Пехота с грузом, горы',
    slope: 'tobler',
    road: 3,
    track: 3,
    offroad: 1.5,
    maxSlope: 35,
  },
  {
    id: 'wheeled',
    label: 'Колёсная техника',
    slope: 'linear',
    road: 60,
    track: 30,
    offroad: 10,
    maxSlope: 25,
  },
  {
    id: 'tracked',
    label: 'Гусеничная техника',
    slope: 'linear',
    road: 45,
    track: 30,
    offroad: 20,
    maxSlope: 30,
  },
  {
    id: 'air',
    label: 'Вертолёт',
    slope: 'none',
    road: 200,
    track: 200,
    offroad: 200,
    maxSlope: null,
  },
];

export const SPEED_MIN = 0.1;
export const SPEED_MAX = 1000;
export const SLOPE_MIN = 1;
export const SLOPE_MAX = 80;

/** Параметры функции Тоблера: крутизна падения скорости и уклон, на котором идти быстрее всего. */
const TOBLER_RATE = 3.5;
const TOBLER_SHIFT = 0.05;

/** Доля скорости, с которой техника идёт по предельному уклону. */
const CRAWL = 0.1;

const RAD = Math.PI / 180;

export function isMovementProfileId(value: unknown): value is MovementProfileId {
  return MOVEMENT_PROFILES.some((profile) => profile.id === value);
}

/** Профиль со скоростями из сценария, а где их не меняли — с исходными. */
export function movementProfile(
  id: MovementProfileId,
  overrides: ProfileOverrides = {},
): MovementProfile {
  const base = MOVEMENT_PROFILES.find((profile) => profile.id === id)!;
  return { ...base, ...overrides[id] };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampSpeed(kmh: number): number {
  return clamp(kmh, SPEED_MIN, SPEED_MAX);
}

export function clampSlope(degrees: number): number {
  return clamp(degrees, SLOPE_MIN, SLOPE_MAX);
}

/** Приводит произвольные данные к скоростям профиля; чего нет или что испорчено — берёт исходное. */
export function readSpeeds(data: unknown, id: MovementProfileId): MovementSpeeds {
  const base = movementProfile(id);
  const source = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const speed = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? clampSpeed(value) : fallback;
  const { maxSlope } = source;
  return {
    road: speed(source.road, base.road),
    track: speed(source.track, base.track),
    offroad: speed(source.offroad, base.offroad),
    maxSlope:
      base.maxSlope === null
        ? null
        : typeof maxSlope === 'number' && Number.isFinite(maxSlope)
          ? clampSlope(maxSlope)
          : base.maxSlope,
  };
}

export function readOverrides(data: unknown): ProfileOverrides {
  const overrides: ProfileOverrides = {};
  if (typeof data !== 'object' || data === null) return overrides;
  for (const { id } of MOVEMENT_PROFILES) {
    const stored = (data as Record<string, unknown>)[id];
    if (stored === undefined) continue;
    const speeds = readSpeeds(stored, id);
    if (!sameSpeeds(speeds, movementProfile(id))) overrides[id] = speeds;
  }
  return overrides;
}

export function sameSpeeds(a: MovementSpeeds, b: MovementSpeeds): boolean {
  return (
    a.road === b.road && a.track === b.track && a.offroad === b.offroad && a.maxSlope === b.maxSlope
  );
}

/** Круче этого уклона профиль не идёт. */
export function isBlocked(profile: MovementSpeeds, slope: number): boolean {
  return profile.maxSlope !== null && Math.abs(slope) > profile.maxSlope;
}

/**
 * Во сколько раз уклон меняет скорость. Уклон в градусах вдоль движения: подъём — плюс, спуск — минус.
 * Пешком — по функции Тоблера: быстрее всего на пологом спуске, медленнее и в гору, и на крутом спуске.
 * Техника теряет скорость линейно и у предельного уклона едва ползёт.
 */
export function slopeFactor(profile: MovementProfile, slope: number): number {
  if (profile.slope === 'tobler') {
    const grade = Math.tan(clamp(slope, -89, 89) * RAD);
    return Math.exp(-TOBLER_RATE * Math.abs(grade + TOBLER_SHIFT) + TOBLER_RATE * TOBLER_SHIFT);
  }
  if (profile.slope === 'linear' && profile.maxSlope !== null) {
    const share = Math.min(1, Math.abs(slope) / profile.maxSlope);
    return 1 - (1 - CRAWL) * share;
  }
  return 1;
}

/** Скорость на покрытии и уклоне, км/ч; 0 — уклон круче предельного. */
export function speedAt(profile: MovementProfile, surface: Surface, slope: number): number {
  if (isBlocked(profile, slope)) return 0;
  return profile[surface] * slopeFactor(profile, slope);
}
