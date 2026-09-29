/** Сценарий: всё, что пользователь расставил на карте. Формат файла и его разбор. */

import { defaultClock, readClock, type Clock } from './clock';
import { readGraphic, type Graphic } from './graphics';
import { isMovementProfileId, readOverrides, type ProfileOverrides } from './movement';
import { readRoute, type Route } from './route';
import {
  AFFILIATIONS,
  ECHELONS,
  STATUSES,
  UNIT_TYPES,
  newId,
  unitType,
  type Unit,
  type WeaponRange,
} from './units';

export const SCENARIO_FORMAT = 'maptool-scenario';
/**
 * Версия 2 добавила тактическую графику, версия 3 — маршруты, длину хода и скорости движения,
 * версия 4 — часы, ход выхода на маршрут и кольца вокруг фишек.
 * Старые файлы читаются: чего в них нет, того нет и в сценарии.
 */
export const SCENARIO_VERSION = 4;

export type { Clock };

export interface Scenario {
  name: string;
  units: Unit[];
  graphics: Graphic[];
  routes: Route[];
  clock: Clock;
  /** Скорости профилей движения, которые отличаются от исходных. */
  profiles: ProfileOverrides;
}

export interface ScenarioFile extends Scenario {
  format: typeof SCENARIO_FORMAT;
  version: number;
}

export function emptyScenario(): Scenario {
  return {
    name: '',
    units: [],
    graphics: [],
    routes: [],
    clock: defaultClock(),
    profiles: {},
  };
}

export function serializeScenario(scenario: Scenario): string {
  const file: ScenarioFile = {
    format: SCENARIO_FORMAT,
    version: SCENARIO_VERSION,
    name: scenario.name,
    units: scenario.units,
    graphics: scenario.graphics,
    routes: scenario.routes,
    clock: scenario.clock,
    profiles: scenario.profiles,
  };
  return JSON.stringify(file, null, 2);
}

/** Разбирает текст файла. Бросает ошибку с объяснением, если это не сценарий. */
export function parseScenario(text: string): Scenario {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл не читается: это не JSON.');
  }
  if (!isRecord(data) || data.format !== SCENARIO_FORMAT) {
    throw new Error('Это не файл сценария Maptool.');
  }
  if (typeof data.version !== 'number' || data.version > SCENARIO_VERSION) {
    throw new Error('Сценарий сохранён более новой версией Maptool.');
  }
  return readScenario(data);
}

/**
 * Приводит произвольные данные к сценарию: испорченные фишки, знаки и маршруты отбрасывает,
 * поля чинит.
 */
export function readScenario(data: unknown): Scenario {
  if (!isRecord(data)) return emptyScenario();
  const seen = new Set<string>();
  const units: Unit[] = [];
  for (const item of Array.isArray(data.units) ? data.units : []) {
    const unit = readUnit(item);
    if (!unit) continue;
    if (seen.has(unit.id)) unit.id = newId();
    seen.add(unit.id);
    units.push(unit);
  }
  const graphics: Graphic[] = [];
  for (const item of Array.isArray(data.graphics) ? data.graphics : []) {
    const graphic = readGraphic(item);
    if (!graphic) continue;
    if (seen.has(graphic.id)) graphic.id = newId();
    seen.add(graphic.id);
    graphics.push(graphic);
  }
  const routes: Route[] = [];
  for (const item of Array.isArray(data.routes) ? data.routes : []) {
    const route = readRoute(item);
    if (!route) continue;
    if (seen.has(route.id)) route.id = newId();
    seen.add(route.id);
    // Маршрут пропавшей фишки остаётся, но уже ничей.
    if (!units.some((unit) => unit.id === route.unitId)) route.unitId = null;
    routes.push(route);
  }
  return {
    name: text(data.name),
    units,
    graphics,
    routes,
    clock: readClock(data.clock),
    profiles: readOverrides(data.profiles),
  };
}


function readUnit(data: unknown): Unit | null {
  if (!isRecord(data)) return null;
  const type = oneOf(UNIT_TYPES, data.type);
  const side = oneOf(AFFILIATIONS, data.affiliation);
  const position = readPosition(data.position);
  if (!type || !side || !position) return null;

  return {
    id: typeof data.id === 'string' && data.id ? data.id : newId(),
    affiliation: side,
    type,
    echelon: oneOf(ECHELONS, data.echelon) ?? 'none',
    status: oneOf(STATUSES, data.status) ?? 'present',
    callsign: text(data.callsign),
    position,
    movement: isMovementProfileId(data.movement) ? data.movement : unitType(type).movement,
    ranges: (Array.isArray(data.ranges) ? data.ranges : []).flatMap(readRange),
    showRanges: data.showRanges === true,
    showReach: data.showReach === true,
    notes: text(data.notes),
  };
}

function readPosition(data: unknown): [number, number] | null {
  if (!Array.isArray(data) || data.length !== 2) return null;
  const [lng, lat] = data;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (Math.abs(lat) > 90) return null;
  return [lng, lat];
}

function readRange(data: unknown): WeaponRange[] {
  if (!isRecord(data)) return [];
  const meters = Number(data.meters);
  if (!Number.isFinite(meters) || meters < 0) return [];
  return [{ name: text(data.name), meters }];
}

function oneOf<Id extends string>(list: { id: Id }[], value: unknown): Id | null {
  return list.find((item) => item.id === value)?.id ?? null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
