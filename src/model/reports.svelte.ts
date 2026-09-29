/**
 * Расчёты маршрутов. Высоты вдоль маршрута снимаются заново, только когда меняются его точки;
 * время, отметки ходов и непроходимые отрезки пересчитываются по уже снятому профилю.
 */

import { untrack } from 'svelte';
import type { LngLat } from '../core/geodesy';
import { survey, type Survey } from '../core/profile';
import { computeRoute, type Route, type RouteReport } from '../core/route';
import { dem } from '../map/dem';
import { draftRoute } from './routeDraft.svelte';
import { findRoute, profileOf, scenario, selection } from './scenario.svelte';

export type ReportState = 'ready' | 'loading' | 'failed';

interface Entry {
  /** Точки, по которым снят профиль. */
  key: string;
  survey: Survey;
}

let surveys = $state.raw<Record<string, Entry>>({});
/** Маршруты, высоты которых не загрузились, и точки, на которых это случилось. */
let failures = $state.raw<Record<string, string>>({});
let attempt = $state(0);

/** Что уже запрошено: маршрут и его точки. */
const asked = new Map<string, string>();
const computed = new Map<string, { key: string; report: RouteReport }>();

function tracked(): Route[] {
  const draft = draftRoute();
  return draft && draft.points.length >= 2 ? [...scenario.routes, draft] : scenario.routes;
}

function shape(route: Route): string {
  return JSON.stringify(route.points);
}

function without<T>(record: Record<string, T>, id: string): Record<string, T> {
  if (!(id in record)) return record;
  const { [id]: _, ...rest } = record;
  return rest;
}

async function measure(id: string, key: string, points: LngLat[]): Promise<void> {
  try {
    const result = await survey(points, (positions) => dem.elevations(positions));
    // Пока высоты грузились, маршрут могли передвинуть или убрать.
    if (asked.get(id) !== key) return;
    surveys = { ...surveys, [id]: { key, survey: result } };
    failures = without(failures, id);
  } catch (error) {
    if (asked.get(id) !== key) return;
    console.warn(error);
    failures = { ...failures, [id]: key };
  }
}

$effect.root(() => {
  $effect(() => {
    void attempt;
    const routes = tracked();
    for (const route of routes) {
      const key = shape(route);
      if (asked.get(route.id) === key) continue;
      asked.set(route.id, key);
      void measure(route.id, key, JSON.parse(key));
    }

    const alive = new Set(routes.map(({ id }) => id));
    for (const id of [...asked.keys()]) {
      if (alive.has(id)) continue;
      asked.delete(id);
      computed.delete(id);
      untrack(() => {
        surveys = without(surveys, id);
        failures = without(failures, id);
      });
    }
  });
});

const reports = $derived.by(() => {
  const ready: Record<string, RouteReport> = {};
  for (const route of tracked()) {
    const entry = surveys[route.id];
    if (!entry) continue;
    const profile = profileOf(route.movement);
    const minutes = scenario.clock.turnMinutes;
    const key = JSON.stringify([entry.key, route.surfaces, profile, minutes, route.startTurn]);

    let cached = computed.get(route.id);
    if (cached?.key !== key) {
      const surfaces = $state.snapshot(route.surfaces);
      cached = {
        key,
        report: computeRoute(entry.survey, surfaces, profile, minutes, route.startTurn),
      };
      computed.set(route.id, cached);
    }
    ready[route.id] = cached.report;
  }
  return ready;
});

/** Маршрут, профиль которого показан под картой: прокладываемый, а иначе выделенный. */
export function profiledRoute(): Route | null {
  const draft = draftRoute();
  if (draft) return draft.points.length >= 2 ? draft : null;
  return findRoute(selection.routeId) ?? null;
}

/** Расчёт маршрута; null, пока высоты не сняты. Во время правки может на миг отставать от точек. */
export function routeReport(id: string | null): RouteReport | null {
  return id === null ? null : (reports[id] ?? null);
}

export function reportState(route: Route): ReportState {
  const key = shape(route);
  if (failures[route.id] === key) return 'failed';
  return surveys[route.id]?.key === key ? 'ready' : 'loading';
}

/** Пробует снять высоты заново, например когда вернулась сеть. */
export function retryReport(id: string): void {
  asked.delete(id);
  failures = without(failures, id);
  attempt += 1;
}
