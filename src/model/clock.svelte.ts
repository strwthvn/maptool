/** Игровые часы и движение фишек по маршрутам вслед за ходом. */

import { clampTurnNumber, readStart } from '../core/clock';
import type { LngLat } from '../core/geodesy';
import { activeRoute, routePointAtTurn, routeTitle, type Route, type RoutePoint } from '../core/route';
import type { Unit } from '../core/units';
import { plural, pluralForm } from '../core/words';
import { reportState, routeReport } from './reports.svelte';
import { edit, findUnit, routesOf, scenario } from './scenario.svelte';

/** Где фишке быть на данном ходу по её маршруту. */
export interface Station {
  route: Route;
  /** null, пока маршрут не посчитан. */
  point: RoutePoint | null;
}

export interface Advance {
  /** Сколько фишек сменило место. */
  moved: number;
  /** Маршруты, которые ещё не посчитаны: их фишки остались на месте. */
  waiting: string[];
}

/** Место фишки на ходу `turn`; null, если на этом ходу она ни по какому маршруту не идёт. */
export function stationOf(unit: Unit, turn = scenario.clock.turn): Station | null {
  const route = activeRoute(routesOf(unit.id), turn);
  if (!route) return null;
  const report = reportState(route) === 'ready' ? routeReport(route.id) : null;
  // Отчёт на миг отстаёт от правки хода выхода или длины хода: такой к делу не годится.
  const fresh =
    report &&
    report.startTurn === route.startTurn &&
    report.turnMinutes === scenario.clock.turnMinutes;
  return { route, point: fresh ? routePointAtTurn(report, turn) : null };
}

function same(a: LngLat, b: LngLat): boolean {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

function plan(turn: number, units: Unit[]) {
  const moves: { unit: Unit; position: LngLat }[] = [];
  const waiting: string[] = [];
  for (const unit of units) {
    const station = stationOf(unit, turn);
    if (!station) continue;
    if (!station.point) waiting.push(routeTitle(station.route, unit));
    else if (!same(unit.position, station.point.position)) {
      moves.push({ unit, position: [station.point.position[0], station.point.position[1]] });
    }
  }
  return { moves, waiting };
}

/**
 * Ставит фишки туда, где они должны быть на текущем ходу по своим маршрутам.
 * Без `unitId` — все фишки, у которых есть маршрут.
 */
export function advanceUnits(unitId?: string): Advance {
  const only = unitId ? findUnit(unitId) : undefined;
  const { moves, waiting } = plan(scenario.clock.turn, only ? [only] : scenario.units);
  if (moves.length > 0) {
    edit(() => {
      for (const { unit, position } of moves) unit.position = position;
    });
  }
  return { moved: moves.length, waiting };
}

/** Переводит часы на ход `turn`. Если фишки идут вместе с ходом, заодно двигает их. */
export function goToTurn(turn: number): Advance | null {
  const next = clampTurnNumber(turn);
  if (next === scenario.clock.turn) return null;
  const following = scenario.clock.follow ? plan(next, scenario.units) : null;
  edit(() => {
    scenario.clock.turn = next;
    for (const { unit, position } of following?.moves ?? []) unit.position = position;
  });
  return following && { moved: following.moves.length, waiting: following.waiting };
}

export function stepTurn(delta: number): Advance | null {
  return goToTurn(scenario.clock.turn + delta);
}

/** Сколько сообщение о передвинутых фишках остаётся на виду, мс. */
const NOTICE_MS = 5000;

/** Что сказать о последнем переводе часов или продвижении фишек; показывается у часов. */
export const clockNotice = $state({ text: '' });
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function describe(result: Advance | null, asked: boolean): string {
  if (!result) return '';
  const parts: string[] = [];
  if (result.moved > 0) {
    const verb = pluralForm(result.moved, ['Передвинута', 'Передвинуты', 'Передвинуто']);
    parts.push(`${verb} ${plural(result.moved, ['фишка', 'фишки', 'фишек'])}.`);
  } else if (asked && result.waiting.length === 0) {
    parts.push('Фишки уже на своих местах.');
  }
  if (result.waiting.length > 0) {
    parts.push(`Ещё не посчитано: ${result.waiting.join(', ')}. Фишки там остались на месте.`);
  }
  return parts.join(' ');
}

function announce(result: Advance | null, asked: boolean): void {
  clearTimeout(noticeTimer);
  clockNotice.text = describe(result, asked);
  if (clockNotice.text) noticeTimer = setTimeout(() => (clockNotice.text = ''), NOTICE_MS);
}

/** Ход вперёд или назад по команде пользователя: с сообщением о том, что передвинулось. */
export function stepClock(delta: number): void {
  announce(stepTurn(delta), false);
}

/** Продвигает все фишки по команде пользователя. */
export function advanceAll(): void {
  announce(advanceUnits(), true);
}

/** Начало сценария; пустая строка или мусор — «не задано». */
export function setStart(value: string): void {
  const start = readStart(value);
  if (start === scenario.clock.start) return;
  edit(() => {
    scenario.clock.start = start;
  }, 'clock.start');
}

export function setFollow(follow: boolean): void {
  edit(() => {
    scenario.clock.follow = follow;
  });
}

/** Есть ли фишки с маршрутами: без них двигать по ходу некого. */
export function hasTravellers(): boolean {
  return scenario.routes.some((route) => route.unitId !== null);
}
