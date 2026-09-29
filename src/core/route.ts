/** Маршрут: ломаная с покрытием по участкам и расчёт движения по ней с учётом рельефа. */

import { clampTurn, clampTurnNumber } from './clock';
import type { LngLat } from './geodesy';
import { GRAPHIC_COLORS, type GraphicColor } from './graphics';
import {
  isMovementProfileId,
  isSurface,
  speedAt,
  type MovementProfile,
  type MovementProfileId,
  type Surface,
} from './movement';
import type { Survey } from './profile';
import { newId, unitTitle, type Unit } from './units';

export interface Route {
  id: string;
  name: string;
  /** Фишка, которая идёт по маршруту; null — маршрут ничей. */
  unitId: string | null;
  color: GraphicColor;
  movement: MovementProfileId;
  points: LngLat[];
  /** Покрытие участков между точками: на одно меньше, чем точек. */
  surfaces: Surface[];
  /** Ход, с концом которого фишка выходит на маршрут: к концу следующего она уже в пути. */
  startTurn: number;
}

export type RouteShape = Pick<Route, 'points' | 'surfaces'>;

export const DEFAULT_SURFACE: Surface = 'offroad';

/** Перепады меньше этого в набор и сброс высоты не идут: это шум данных о рельефе, м. */
const CLIMB_THRESHOLD = 1;

/** Больше отметок ходов на одном маршруте не ставится: отметки прореживаются. */
const MAX_TURN_MARKS = 200;

/** Ход, который кончается в конце маршрута, не должен пропасть из-за округления, с. */
const TIME_SLACK = 1e-3;

const DEG = 180 / Math.PI;

/** Покрытия ровно по числу участков; недостающие берутся у предыдущего участка. */
export function fitSurfaces(surfaces: Surface[], points: number): Surface[] {
  const legs = Math.max(0, points - 1);
  const fitted = surfaces.slice(0, legs);
  while (fitted.length < legs) fitted.push(fitted[fitted.length - 1] ?? DEFAULT_SURFACE);
  return fitted;
}

export function createRoute(
  spec: Pick<Route, 'unitId' | 'color' | 'movement' | 'points' | 'surfaces' | 'startTurn'>,
): Route | null {
  if (spec.points.length < 2) return null;
  return {
    id: newId(),
    name: '',
    unitId: spec.unitId,
    color: spec.color,
    movement: spec.movement,
    points: spec.points.map(([lng, lat]) => [lng, lat]),
    surfaces: fitSurfaces(spec.surfaces, spec.points.length),
    startTurn: clampTurnNumber(spec.startTurn),
  };
}

/** Имя маршрута для списков: своё, а без него — по фишке, которая по нему идёт. */
export function routeTitle(route: Pick<Route, 'name'>, unit?: Unit): string {
  const name = route.name.trim();
  if (name) return name;
  return unit ? `Маршрут: ${unitTitle(unit)}` : 'Маршрут';
}

/** Новая точка на месте `index`: участок, на который она встала, делится на два с тем же покрытием. */
export function insertRoutePoint(route: RouteShape, index: number, point: LngLat): RouteShape {
  const at = Math.max(1, Math.min(route.points.length - 1, index));
  const points = route.points.map(([lng, lat]): LngLat => [lng, lat]);
  const surfaces = fitSurfaces(route.surfaces, points.length);
  points.splice(at, 0, point);
  surfaces.splice(at, 0, surfaces[at - 1]);
  return { points, surfaces };
}

/** Без точки `index`: два участка у неё сливаются в один с покрытием первого. */
export function removeRoutePoint(route: RouteShape, index: number): RouteShape {
  const points = route.points.map(([lng, lat]): LngLat => [lng, lat]);
  const surfaces = fitSurfaces(route.surfaces, points.length);
  if (index < 0 || index >= points.length) return { points, surfaces };
  points.splice(index, 1);
  surfaces.splice(Math.min(index, surfaces.length - 1), 1);
  return { points, surfaces };
}

/** Тот же маршрут в обратную сторону. */
export function reverseRoute(route: RouteShape): RouteShape {
  return {
    points: route.points.map(([lng, lat]): LngLat => [lng, lat]).reverse(),
    surfaces: fitSurfaces(route.surfaces, route.points.length).reverse(),
  };
}

export interface RoutePoint {
  position: LngLat;
  /** Расстояние от начала маршрута, м. */
  distance: number;
  elevation: number;
  leg: number;
  /** Уклон на шаге, который начинается в этой точке, градусы: подъём — плюс, спуск — минус. */
  slope: number;
  /** Скорость на этом шаге, км/ч; 0 — шаг непроходим. */
  speed: number;
  /** Время в пути до этой точки, с. Непроходимые шаги времени не прибавляют. */
  time: number;
  blocked: boolean;
}

export interface RouteLeg {
  surface: Surface;
  /** Где участок начинается, м от начала маршрута. */
  from: number;
  length: number;
  time: number;
  /** Сколько метров участка круче предельного уклона. */
  blocked: number;
}

/** Отрезок маршрута круче предельного уклона. */
export interface BlockedStretch {
  from: number;
  to: number;
  path: LngLat[];
}

/** Место, где фишка окажется к концу хода. */
export interface TurnMark {
  /** Номер хода по часам сценария. */
  turn: number;
  position: LngLat;
  distance: number;
  elevation: number;
}

export interface RouteReport {
  length: number;
  /** Время в пути без непроходимых отрезков, с. */
  time: number;
  /** Длина хода, с которой поставлены отметки, минуты, и ход выхода на маршрут. */
  turnMinutes: number;
  startTurn: number;
  ascent: number;
  descent: number;
  lowest: number;
  highest: number;
  /** Самый крутой уклон на маршруте, градусы, со знаком. */
  steepest: number;
  blockedLength: number;
  points: RoutePoint[];
  legs: RouteLeg[];
  blocked: BlockedStretch[];
  turns: TurnMark[];
  /** Отметки стоят на каждом таком ходе: на длинном маршруте — не на каждом. */
  turnEvery: number;
  /** Сколько высот восстановлено по соседним из-за выбросов в данных. */
  patched: number;
}

function climb(elevations: number[]): { ascent: number; descent: number } {
  let ascent = 0;
  let descent = 0;
  let level = elevations[0] ?? 0;
  for (const elevation of elevations) {
    const change = elevation - level;
    if (Math.abs(change) < CLIMB_THRESHOLD) continue;
    if (change > 0) ascent += change;
    else descent -= change;
    level = elevation;
  }
  return { ascent, descent };
}

/** Наименьшее из чисел 1, 2, 5, 10, 20, 50…, которое не меньше данного. */
function roundStep(value: number): number {
  let step = 1;
  for (;;) {
    for (const factor of [1, 2, 5]) {
      if (step * factor >= value) return step * factor;
    }
    step *= 10;
  }
}

function between(a: LngLat, b: LngLat, share: number): LngLat {
  return [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share];
}

/**
 * Расчёт движения по снятому профилю. Уклон берётся вдоль движения на каждом шаге профиля,
 * скорость — по покрытию участка и уклону. Шаги круче предельного уклона непроходимы:
 * они отмечаются, а время по ним не считается.
 */
export function computeRoute(
  { samples, elevations, patched }: Survey,
  surfaces: Surface[],
  profile: MovementProfile,
  turnMinutes: number,
  startTurn = 0,
): RouteReport {
  const points: RoutePoint[] = [];
  const legs: RouteLeg[] = [];
  const blocked: BlockedStretch[] = [];
  let time = 0;
  let steepest = 0;
  let open: BlockedStretch | null = null;

  const legOf = (index: number, from: number): RouteLeg =>
    (legs[index] ??= {
      surface: surfaces[index] ?? surfaces[surfaces.length - 1] ?? DEFAULT_SURFACE,
      from,
      length: 0,
      time: 0,
      blocked: 0,
    });

  for (let i = 0; i < samples.length - 1; i++) {
    const from = samples[i];
    const to = samples[i + 1];
    const run = to.distance - from.distance;
    const slope = run > 0 ? Math.atan2(elevations[i + 1] - elevations[i], run) * DEG : 0;
    const leg = legOf(from.leg, from.distance);
    const speed = speedAt(profile, leg.surface, slope);
    const impassable = speed === 0;
    const seconds = impassable ? 0 : run / (speed / 3.6);

    points.push({
      position: from.position,
      distance: from.distance,
      elevation: elevations[i],
      leg: from.leg,
      slope,
      speed,
      time,
      blocked: impassable,
    });

    if (Math.abs(slope) > Math.abs(steepest)) steepest = slope;
    leg.length += run;
    leg.time += seconds;
    time += seconds;

    if (impassable) {
      leg.blocked += run;
      if (open) {
        open.to = to.distance;
        open.path.push(to.position);
      } else {
        open = { from: from.distance, to: to.distance, path: [from.position, to.position] };
        blocked.push(open);
      }
    } else {
      open = null;
    }
  }

  const last = samples.length - 1;
  if (last >= 0) {
    const previous = points[points.length - 1];
    points.push({
      position: samples[last].position,
      distance: samples[last].distance,
      elevation: elevations[last],
      leg: samples[last].leg,
      slope: previous?.slope ?? 0,
      speed: previous?.speed ?? 0,
      time,
      blocked: false,
    });
  }

  const minutes = clampTurn(turnMinutes);
  const turnSeconds = minutes * 60;
  const departure = clampTurnNumber(startTurn);
  const turnEvery = roundStep(Math.floor(time / turnSeconds) / MAX_TURN_MARKS);
  const turns: TurnMark[] = [];
  // Прореженные отметки стоят на круглых номерах ходов по часам сценария.
  let turn = (Math.floor(departure / turnEvery) + 1) * turnEvery;
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    // Непроходимый шаг времени не занимает: конец хода на него не приходится.
    while (to.time > from.time && (turn - departure) * turnSeconds <= to.time + TIME_SLACK) {
      const at = (turn - departure) * turnSeconds;
      const share = Math.min(1, (at - from.time) / (to.time - from.time));
      turns.push({
        turn,
        position: between(from.position, to.position, share),
        distance: from.distance + (to.distance - from.distance) * share,
        elevation: from.elevation + (to.elevation - from.elevation) * share,
      });
      turn += turnEvery;
    }
  }

  return {
    length: samples[last]?.distance ?? 0,
    time,
    turnMinutes: minutes,
    startTurn: departure,
    ...climb(elevations),
    lowest: elevations.length ? Math.min(...elevations) : 0,
    highest: elevations.length ? Math.max(...elevations) : 0,
    steepest,
    blockedLength: blocked.reduce((sum, stretch) => sum + stretch.to - stretch.from, 0),
    points,
    legs,
    blocked,
    turns,
    turnEvery,
    patched,
  };
}

/** Состояние движения на расстоянии `distance` от начала маршрута. */
export function routePointAt(report: RouteReport, distance: number): RoutePoint | null {
  const { points } = report;
  if (points.length === 0) return null;
  const at = Math.max(0, Math.min(report.length, distance));

  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (points[middle].distance <= at) low = middle;
    else high = middle;
  }
  const from = points[low];
  const to = points[high];
  const run = to.distance - from.distance;
  const share = run > 0 ? (at - from.distance) / run : 0;
  return {
    ...from,
    position: between(from.position, to.position, share),
    distance: at,
    elevation: from.elevation + (to.elevation - from.elevation) * share,
    time: from.time + (to.time - from.time) * share,
  };
}

/**
 * Состояние движения через `seconds` после выхода на маршрут. До выхода это начало маршрута,
 * после прибытия — конец. Место совпадает с отметкой хода, если время кратно ходу.
 */
export function routePointAtTime(report: RouteReport, seconds: number): RoutePoint | null {
  const { points } = report;
  if (points.length === 0) return null;
  if (seconds <= 0) return points[0];
  if (seconds >= report.time - TIME_SLACK) return points[points.length - 1];

  // Первый шаг, к концу которого набирается нужное время. Время вдоль маршрута не убывает.
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (points[middle].time < seconds) low = middle;
    else high = middle;
  }
  const from = points[low];
  const to = points[high];
  const share = to.time > from.time ? (seconds - from.time) / (to.time - from.time) : 0;
  return {
    ...from,
    position: between(from.position, to.position, share),
    distance: from.distance + (to.distance - from.distance) * share,
    elevation: from.elevation + (to.elevation - from.elevation) * share,
    time: seconds,
  };
}

/** Где фишка на маршруте к концу хода `turn`. */
export function routePointAtTurn(report: RouteReport, turn: number): RoutePoint | null {
  return routePointAtTime(report, (turn - report.startTurn) * report.turnMinutes * 60);
}

/** Где фишка на маршруте к концу хода `turn`, если она в это время в пути; иначе null. */
export function enRoute(report: RouteReport, turn: number): RoutePoint | null {
  if (turn <= report.startTurn || turn >= arrivalTurn(report)) return null;
  return routePointAtTurn(report, turn);
}

/** Ход, считая дробную часть, к концу которого маршрут пройден. */
export function arrivalTurn(report: RouteReport): number {
  return report.startTurn + report.time / (report.turnMinutes * 60);
}

/**
 * Маршрут, по которому фишка идёт на ходу `turn`: из уже начатых — тот, что начат последним.
 * Маршруты, выход на которые ещё впереди, не считаются.
 */
export function activeRoute<R extends Pick<Route, 'startTurn'>>(
  routes: R[],
  turn: number,
): R | undefined {
  let active: R | undefined;
  for (const route of routes) {
    if (route.startTurn > turn) continue;
    if (!active || route.startTurn >= active.startTurn) active = route;
  }
  return active;
}

function padded(value: number): string {
  return String(value).padStart(2, '0');
}

/** Время в пути: «45 с», «12 мин», «3 ч 05 мин», «2 сут 4 ч». */
export function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole} с`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} ч ${padded(minutes % 60)} мин`;
  const hours = Math.round(seconds / 3600);
  return `${Math.floor(hours / 24)} сут ${hours % 24} ч`;
}

export function formatSpeed(kmh: number): string {
  const digits = kmh < 10 ? 1 : 0;
  return `${kmh.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })} км/ч`;
}

export function formatElevation(meters: number): string {
  return `${Math.round(meters).toLocaleString('ru-RU')} м`;
}

/** Уклон в градусах со знаком: «+12°», «−7°», «0°». */
export function formatSlope(degrees: number): string {
  const rounded = Math.round(degrees);
  if (rounded === 0) return '0°';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}°`;
}

function readPoint(data: unknown): LngLat | null {
  if (!Array.isArray(data) || data.length !== 2) return null;
  const [lng, lat] = data;
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90) return null;
  return [lng, lat];
}

/** Приводит произвольные данные к маршруту; null, если маршрут не восстановить. */
export function readRoute(data: unknown): Route | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const source = data as Record<string, unknown>;

  const points = (Array.isArray(source.points) ? source.points : []).flatMap((point) => {
    const read = readPoint(point);
    return read ? [read] : [];
  });
  if (points.length < 2) return null;

  const surfaces = (Array.isArray(source.surfaces) ? source.surfaces : []).map((surface) =>
    isSurface(surface) ? surface : DEFAULT_SURFACE,
  );
  return {
    id: typeof source.id === 'string' && source.id ? source.id : newId(),
    name: typeof source.name === 'string' ? source.name : '',
    unitId: typeof source.unitId === 'string' && source.unitId ? source.unitId : null,
    color: GRAPHIC_COLORS.find((color) => color.id === source.color)?.id ?? 'plain',
    movement: isMovementProfileId(source.movement) ? source.movement : 'foot',
    points,
    surfaces: fitSurfaces(surfaces, points.length),
    startTurn:
      typeof source.startTurn === 'number' && Number.isFinite(source.startTurn)
        ? clampTurnNumber(source.startTurn)
        : 0,
  };
}
