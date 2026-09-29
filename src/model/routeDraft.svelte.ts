/** Маршрут, который сейчас прокладывается на карте, и настройки для новых маршрутов. */

import type { LngLat } from '../core/geodesy';
import type { GraphicColor } from '../core/graphics';
import type { MovementProfileId, Surface } from '../core/movement';
import { DEFAULT_SURFACE, createRoute, type Route } from '../core/route';
import type { Unit } from '../core/units';
import { addRoute, findRoute, scenario, selectRoute, updateRoute } from './scenario.svelte';

/** Под этим идентификатором считается и рисуется прокладываемый маршрут. */
export const DRAFT_ID = 'draft';

/** С чем прокладываются новые маршруты. */
export const routeBrush = $state<{
  movement: MovementProfileId;
  color: GraphicColor;
  /** Покрытие участков, которые ставятся следующими щелчками. */
  surface: Surface;
}>({ movement: 'foot', color: 'friend', surface: DEFAULT_SURFACE });

export const routeDraft = $state<{
  active: boolean;
  /** Маршрут, который продолжают; null — прокладывается новый. */
  routeId: string | null;
  unitId: string | null;
  movement: MovementProfileId;
  color: GraphicColor;
  points: LngLat[];
  surfaces: Surface[];
  /** Положение курсора, до которого тянется линия от последней точки. */
  cursor: LngLat | null;
}>({
  active: false,
  routeId: null,
  unitId: null,
  movement: 'foot',
  color: 'friend',
  points: [],
  surfaces: [],
  cursor: null,
});

function follow(unit: Unit): void {
  routeDraft.unitId = unit.id;
  routeDraft.movement = unit.movement;
  routeDraft.color = unit.affiliation;
}

/** Начинает новый маршрут. Маршрут фишки начинается с её места и идёт так, как движется она. */
export function startRoute(unit?: Unit): void {
  routeDraft.active = true;
  routeDraft.routeId = null;
  routeDraft.unitId = null;
  routeDraft.movement = routeBrush.movement;
  routeDraft.color = routeBrush.color;
  routeDraft.points = [];
  routeDraft.surfaces = [];
  routeDraft.cursor = null;
  if (unit) {
    follow(unit);
    routeDraft.points = [[unit.position[0], unit.position[1]]];
  }
}

/** Продолжает готовый маршрут: новые точки встают после его последней. */
export function continueRoute(route: Route): void {
  routeDraft.active = true;
  routeDraft.routeId = route.id;
  routeDraft.unitId = route.unitId;
  routeDraft.movement = route.movement;
  routeDraft.color = route.color;
  routeDraft.points = route.points.map(([lng, lat]): LngLat => [lng, lat]);
  routeDraft.surfaces = [...route.surfaces];
  routeDraft.cursor = null;
}

export function cancelRoute(): void {
  routeDraft.active = false;
  routeDraft.routeId = null;
  routeDraft.unitId = null;
  routeDraft.points = [];
  routeDraft.surfaces = [];
  routeDraft.cursor = null;
}

/**
 * Ставит точку. Первая точка нового маршрута, поставленная на фишку, отдаёт маршрут ей.
 */
export function addRoutePoint(point: LngLat, unit?: Unit): void {
  if (!routeDraft.active) return;
  if (routeDraft.points.length === 0 && unit && !routeDraft.unitId) follow(unit);
  if (routeDraft.points.length > 0) routeDraft.surfaces.push(routeBrush.surface);
  routeDraft.points.push(point);
}

export function removeLastRoutePoint(): void {
  routeDraft.points.pop();
  routeDraft.surfaces.pop();
}

/** Хватит ли поставленных точек, чтобы закончить маршрут. */
export function routeDraftReady(): boolean {
  return routeDraft.active && routeDraft.points.length >= 2;
}

/** Заканчивает прокладку. Маршрут из одной точки не появляется, продолжаемый остаётся как был. */
export function finishRoute(): void {
  if (!routeDraft.active) return;
  const { routeId, unitId, movement, color } = routeDraft;
  const points = $state.snapshot(routeDraft.points) as LngLat[];
  const surfaces = $state.snapshot(routeDraft.surfaces) as Surface[];
  cancelRoute();
  if (points.length < 2) return;

  if (routeId) {
    if (!findRoute(routeId)) return;
    updateRoute(routeId, { points, surfaces, movement });
    selectRoute(routeId);
    return;
  }
  // Новый маршрут начинается с текущего хода: к концу следующего фишка уже в пути.
  const startTurn = scenario.clock.turn;
  const route = createRoute({ unitId, color, movement, points, surfaces, startTurn });
  if (!route) return;
  routeBrush.movement = unitId ? routeBrush.movement : movement;
  addRoute(route);
  selectRoute(route.id, true);
}

const sketch = $derived.by<Route | null>(() => {
  if (!routeDraft.active || routeDraft.points.length === 0) return null;
  return {
    id: DRAFT_ID,
    name: findRoute(routeDraft.routeId)?.name ?? '',
    unitId: routeDraft.unitId,
    color: routeDraft.color,
    movement: routeDraft.movement,
    points: $state.snapshot(routeDraft.points) as LngLat[],
    surfaces: $state.snapshot(routeDraft.surfaces) as Surface[],
    startTurn: findRoute(routeDraft.routeId)?.startTurn ?? scenario.clock.turn,
  };
});

/** Прокладываемый маршрут по уже поставленным точкам, без точки под курсором. */
export function draftRoute(): Route | null {
  return sketch;
}
