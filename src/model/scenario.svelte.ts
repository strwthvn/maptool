/** Текущий сценарий, выделение и история правок. Сценарий сохраняется в браузере сам. */

import type { Graphic } from '../core/graphics';
import { History } from '../core/history';
import {
  movementProfile,
  sameSpeeds,
  type MovementProfile,
  type MovementProfileId,
  type MovementSpeeds,
} from '../core/movement';
import { clampTurn } from '../core/clock';
import type { Route } from '../core/route';
import { emptyScenario, readScenario, type Scenario } from '../core/scenario';
import { createUnit, duplicateUnit, type Unit, type UnitTemplate } from '../core/units';
import { persist } from './persist.svelte';

const STORAGE_KEY = 'maptool.scenario';

function load(): Scenario {
  try {
    return readScenario(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return emptyScenario();
  }
}

export const scenario = $state<Scenario>(load());

/** Выделено что-то одно: фишка, знак графики или маршрут. */
export const selection = $state<{
  unitId: string | null;
  graphicId: string | null;
  routeId: string | null;
  /** Выделенное только что поставили: редактор сразу предлагает ввести подпись. */
  fresh: boolean;
}>({ unitId: null, graphicId: null, routeId: null, fresh: false });

export const undoState = $state({ canUndo: false, canRedo: false });

const history = new History<Scenario>();
let beforeMove: Scenario | null = null;

function snapshot(): Scenario {
  return $state.snapshot(scenario);
}

function restore(state: Scenario): void {
  scenario.name = state.name;
  scenario.units = state.units;
  scenario.graphics = state.graphics;
  scenario.routes = state.routes;
  scenario.clock = state.clock;
  scenario.profiles = state.profiles;
  const selected =
    findUnit(selection.unitId) ?? findGraphic(selection.graphicId) ?? findRoute(selection.routeId);
  if (!selected) select(null);
}

function historyChanged(): void {
  undoState.canUndo = history.canUndo;
  undoState.canRedo = history.canRedo;
}

/** Правка, которую можно отменить. Правки с одним mergeKey подряд отменяются одним шагом. */
export function edit(apply: () => void, mergeKey: string | null = null): void {
  history.record(snapshot(), mergeKey);
  apply();
  historyChanged();
}

export function undo(): void {
  const previous = history.undo(snapshot());
  if (previous) restore(previous);
  historyChanged();
}

export function redo(): void {
  const next = history.redo(snapshot());
  if (next) restore(next);
  historyChanged();
}

export function findUnit(id: string | null): Unit | undefined {
  if (id === null) return undefined;
  return scenario.units.find((unit) => unit.id === id);
}

export function findGraphic(id: string | null): Graphic | undefined {
  if (id === null) return undefined;
  return scenario.graphics.find((graphic) => graphic.id === id);
}

export function findRoute(id: string | null): Route | undefined {
  if (id === null) return undefined;
  return scenario.routes.find((route) => route.id === id);
}

/** Выделяет фишку; null снимает выделение со всего. */
export function select(id: string | null, fresh = false): void {
  selection.unitId = id;
  selection.graphicId = null;
  selection.routeId = null;
  selection.fresh = fresh;
}

export function selectGraphic(id: string, fresh = false): void {
  selection.unitId = null;
  selection.graphicId = id;
  selection.routeId = null;
  selection.fresh = fresh;
}

export function selectRoute(id: string, fresh = false): void {
  selection.unitId = null;
  selection.graphicId = null;
  selection.routeId = id;
  selection.fresh = fresh;
}

export function addUnit(template: UnitTemplate, position: [number, number]): Unit {
  const unit = createUnit(template, position);
  edit(() => scenario.units.push(unit));
  return unit;
}

export function copyUnit(source: Unit, position: [number, number]): Unit {
  const unit = duplicateUnit($state.snapshot(source), position);
  edit(() => scenario.units.push(unit));
  return unit;
}

export function updateUnit(id: string, patch: Partial<Omit<Unit, 'id'>>, field?: string): void {
  const unit = findUnit(id);
  if (!unit) return;
  edit(() => Object.assign(unit, patch), field ? `${id}.${field}` : null);
}

/** Убирает фишку. Её маршруты остаются на карте, но уже ничьи. */
export function removeUnit(id: string): void {
  if (!findUnit(id)) return;
  edit(() => {
    scenario.units = scenario.units.filter((unit) => unit.id !== id);
    for (const route of scenario.routes) {
      if (route.unitId === id) route.unitId = null;
    }
  });
  if (selection.unitId === id) select(null);
}

export function addGraphic(graphic: Graphic): void {
  edit(() => scenario.graphics.push(graphic));
}

export function updateGraphic(
  id: string,
  patch: Partial<Omit<Graphic, 'id' | 'kind'>>,
  field?: string,
): void {
  const graphic = findGraphic(id);
  if (!graphic) return;
  edit(() => Object.assign(graphic, patch), field ? `${id}.${field}` : null);
}

export function removeGraphic(id: string): void {
  if (!findGraphic(id)) return;
  edit(() => {
    scenario.graphics = scenario.graphics.filter((graphic) => graphic.id !== id);
  });
  if (selection.graphicId === id) select(null);
}

/** Правка знака во время перетаскивания: между beginMove и endMove, мимо истории. */
export function reshapeGraphic(id: string, patch: Partial<Omit<Graphic, 'id' | 'kind'>>): void {
  const graphic = findGraphic(id);
  if (graphic) Object.assign(graphic, patch);
}

export function addRoute(route: Route): void {
  edit(() => scenario.routes.push(route));
}

export function updateRoute(id: string, patch: Partial<Omit<Route, 'id'>>, field?: string): void {
  const route = findRoute(id);
  if (!route) return;
  edit(() => Object.assign(route, patch), field ? `${id}.${field}` : null);
}

export function removeRoute(id: string): void {
  if (!findRoute(id)) return;
  edit(() => {
    scenario.routes = scenario.routes.filter((route) => route.id !== id);
  });
  if (selection.routeId === id) select(null);
}

/** Правка маршрута во время перетаскивания: между beginMove и endMove, мимо истории. */
export function reshapeRoute(id: string, patch: Pick<Route, 'points' | 'surfaces'>): void {
  const route = findRoute(id);
  if (route) Object.assign(route, patch);
}

/** Маршруты, по которым идёт фишка. */
export function routesOf(unitId: string): Route[] {
  return scenario.routes.filter((route) => route.unitId === unitId);
}

export function setTurnMinutes(minutes: number): void {
  edit(() => {
    scenario.clock.turnMinutes = clampTurn(minutes);
  }, 'clock.turnMinutes');
}

/** Профиль движения со скоростями этого сценария. */
export function profileOf(id: MovementProfileId): MovementProfile {
  return movementProfile(id, scenario.profiles);
}

/** Меняет скорости профиля. Скорости, совпавшие с исходными, в сценарии не хранятся. */
export function setProfileSpeeds(id: MovementProfileId, speeds: MovementSpeeds, field: string): void {
  edit(() => {
    if (sameSpeeds(speeds, movementProfile(id))) delete scenario.profiles[id];
    else scenario.profiles[id] = speeds;
  }, `profiles.${id}.${field}`);
}

export function resetProfile(id: MovementProfileId): void {
  if (!scenario.profiles[id]) return;
  edit(() => {
    delete scenario.profiles[id];
  });
}

/** Перетаскивание: положение меняется на лету, в историю попадает одним шагом по окончании. */
export function beginMove(): void {
  beforeMove = snapshot();
}

export function moveUnit(id: string, position: [number, number]): void {
  const unit = findUnit(id);
  if (unit) unit.position = position;
}

export function endMove(): void {
  if (beforeMove) {
    history.record(beforeMove);
    historyChanged();
  }
  beforeMove = null;
}

export function renameScenario(name: string): void {
  edit(() => {
    scenario.name = name;
  }, 'scenario.name');
}

export function replaceScenario(next: Scenario): void {
  edit(() => restore(next));
  select(null);
}

persist(STORAGE_KEY, () => JSON.stringify(scenario));
